import { Op, fn, col } from "sequelize";
import {
  sequelize,
  Class,
  Enrollment,
  Notification,
  Role,
  User,
  ClassStreamAttachment,
  ClassStreamComment,
  ClassStreamPost,
} from "../models/index.js";
import { emitClassStreamEvent } from "../config/socket.js";
import { queueEventNotification } from "./notificationService.js";
import {
  cloudinary,
  getCloudinaryResourceTypeForAttachment,
} from "../middleware/streamUploadMiddleware.js";

const ROLE_LABELS = {
  ADMIN: "Quản trị viên",
  TEACHER: "Giáo viên",
  STUDENT: "Học sinh",
};

const POST_TYPE_LABELS = {
  announcement: "Thông báo",
  discussion: "Thảo luận",
  question: "Câu hỏi",
  resource: "Tài liệu",
};

const STREAM_EVENTS = {
  POST_CREATED: "stream:post_created",
  POST_UPDATED: "stream:post_updated",
  POST_DELETED: "stream:post_deleted",
  POST_PINNED: "stream:post_pinned",
  POST_COMMENT_POLICY_UPDATED: "stream:post_comment_policy_updated",
  COMMENT_CREATED: "stream:comment_created",
  COMMENT_UPDATED: "stream:comment_updated",
  COMMENT_DELETED: "stream:comment_deleted",
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const httpError = (message, statusCode, code, details) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  if (code) err.code = code;
  if (details) err.details = details;
  return err;
};

const assertUUID = (value, fieldName) => {
  if (typeof value !== "string" || !UUID_REGEX.test(value)) {
    throw httpError(`Invalid ${fieldName}. Must be UUID.`, 400, "VALIDATION_ERROR", {
      field: fieldName,
      value,
    });
  }
};

const normalizeTextContent = (value) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
};

const roleLabelFromCode = (roleCode) => ROLE_LABELS[roleCode] || roleCode || null;
const postTypeLabel = (postType) => POST_TYPE_LABELS[postType] || postType || null;

const excerptText = (value, maxLength = 140) => {
  if (!value) return "";
  const normalized = String(value).replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3)}...`;
};

const buildStreamRoom = (classId) => `class_stream_${classId}`;

const isClassReadOnly = (classRecord) => {
  if (!classRecord) return false;
  if (["closed", "cancelled"].includes(classRecord.status)) return true;
  if (!classRecord.end_date) return false;
  const today = new Date().toISOString().slice(0, 10);
  return classRecord.end_date < today;
};

const buildClassSummary = (context) => ({
  id: context.class.id,
  name: context.class.name,
  status: context.class.status,
  start_date: context.class.start_date,
  end_date: context.class.end_date,
  is_read_only: context.isReadOnly,
});

const buildClassPermissions = (context) => ({
  is_teacher: context.isTeacher,
  can_view_stream: true,
  can_create_post: !context.isReadOnly,
  can_comment: !context.isReadOnly,
  can_manage_stream: context.isTeacher && !context.isReadOnly,
});

const serializeAuthor = (author) => {
  if (!author) return null;

  return {
    id: author.id,
    full_name: author.full_name,
    avatar_url: author.avatar_url,
    role: {
      code: author.role?.code || null,
      name: author.role?.name || null,
      display_name: roleLabelFromCode(author.role?.code),
    },
  };
};

const serializeAttachment = (attachment) => ({
  id: attachment.id,
  file_url: attachment.file_url,
  original_name: attachment.original_name,
  mime_type: attachment.mime_type,
  file_type: attachment.file_type,
  file_size: Number(attachment.file_size || 0),
  storage_provider: attachment.storage_provider,
  created_at: attachment.created_at,
});

const buildPostPermissions = (post, context) => {
  const isAuthor = String(post.author_id) === String(context.userId);
  const isWritable = !context.isReadOnly;

  return {
    can_comment: isWritable && post.allow_comments,
    can_edit: isWritable && isAuthor,
    can_delete: isWritable && isAuthor,
    can_pin: isWritable && context.isTeacher && !post.is_pinned,
    can_unpin: isWritable && context.isTeacher && post.is_pinned,
    can_lock_comments: isWritable && context.isTeacher && post.allow_comments,
    can_unlock_comments: isWritable && context.isTeacher && !post.allow_comments,
  };
};

const buildCommentPermissions = (comment, context) => {
  const isAuthor = String(comment.author_id) === String(context.userId);
  const isWritable = !context.isReadOnly;

  return {
    can_edit: isWritable && isAuthor,
    can_delete: isWritable && isAuthor,
  };
};

const serializePost = (post, context, attachmentsByPostId, commentCountMap, latestCommentMap) => ({
  id: post.id,
  class_id: post.class_id,
  author_id: post.author_id,
  post_type: post.post_type,
  post_type_label: postTypeLabel(post.post_type),
  content: post.content,
  allow_comments: post.allow_comments,
  is_pinned: post.is_pinned,
  status: post.status,
  created_at: post.created_at,
  updated_at: post.updated_at,
  author: serializeAuthor(post.author),
  attachments: (attachmentsByPostId.get(post.id) || []).map(serializeAttachment),
  attachment_count: (attachmentsByPostId.get(post.id) || []).length,
  comment_count: commentCountMap.get(post.id) || 0,
  latest_comment_at: latestCommentMap.get(post.id) || null,
  permissions: buildPostPermissions(post, context),
});

const serializeComment = (comment, context, attachmentsByCommentId) => ({
  id: comment.id,
  post_id: comment.post_id,
  author_id: comment.author_id,
  parent_comment_id: comment.parent_comment_id,
  content: comment.content,
  status: comment.status,
  created_at: comment.created_at,
  updated_at: comment.updated_at,
  author: serializeAuthor(comment.author),
  attachments: (attachmentsByCommentId.get(comment.id) || []).map(serializeAttachment),
  attachment_count: (attachmentsByCommentId.get(comment.id) || []).length,
  permissions: buildCommentPermissions(comment, context),
});

const buildRealtimeMetadata = (classId) => ({
  room: buildStreamRoom(classId),
  supported_events: Object.values(STREAM_EVENTS),
});

const buildAttachmentPayloadFromFile = (file, ownerField, ownerId, uploadedBy) => {
  const mimeType = file.mimetype || "application/octet-stream";
  const extension = (file.originalname || "").split(".").pop()?.toLowerCase() || "";

  let fileType = "other";
  if (mimeType.startsWith("image/")) fileType = "image";
  else if (mimeType.startsWith("audio/")) fileType = "audio";
  else if (mimeType.startsWith("video/")) fileType = "video";
  else if (["zip", "rar", "7z"].includes(extension)) fileType = "archive";
  else if (
    mimeType.startsWith("application/") ||
    mimeType.startsWith("text/") ||
    ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "csv", "txt"].includes(extension)
  ) {
    fileType = "document";
  }

  return {
    [ownerField]: ownerId,
    file_url: file.path,
    original_name: file.originalname,
    storage_key: file.filename || null,
    mime_type: mimeType,
    file_type: fileType,
    file_size: Number(file.size || 0),
    storage_provider: "cloudinary",
    uploaded_by: uploadedBy,
  };
};

const deleteCloudinaryAssets = async (attachments) => {
  await Promise.all(
    attachments.map(async (attachment) => {
      if (!attachment.storage_key) return;

      try {
        await cloudinary.uploader.destroy(attachment.storage_key, {
          resource_type: getCloudinaryResourceTypeForAttachment(attachment.file_type),
        });
      } catch (error) {
        console.warn(
          `[Stream] Failed to delete Cloudinary asset ${attachment.storage_key}:`,
          error.message,
        );
      }
    }),
  );
};

const fetchContextForUser = async (user, classId) => {
  assertUUID(classId, "classId");

  const classRecord = await Class.findByPk(classId, {
    attributes: ["id", "name", "teacher_id", "status", "start_date", "end_date"],
  });

  if (!classRecord) {
    throw httpError("Lớp học không tồn tại hoặc đã bị gỡ bỏ.", 404, "CLASS_NOT_FOUND");
  }

  const isTeacher = String(classRecord.teacher_id) === String(user.id);

  if (!isTeacher) {
    const enrollment = await Enrollment.findOne({
      where: {
        class_id: classId,
        user_id: user.id,
        status: "active",
      },
      attributes: ["id"],
    });

    if (!enrollment) {
      throw httpError(
        "Bạn không có quyền truy cập bảng tin của lớp học này.",
        403,
        "STREAM_ACCESS_DENIED",
      );
    }
  }

  return {
    class: classRecord,
    isTeacher,
    isReadOnly: isClassReadOnly(classRecord),
    userId: user.id,
    userRole: user.role,
  };
};

const assertClassWritable = (context, actionLabel) => {
  if (!context.isReadOnly) return;

  throw httpError(
    `Lớp học hiện đang ở chế độ chỉ đọc. Bạn không thể ${actionLabel}.`,
    400,
    "CLASS_STREAM_READ_ONLY",
  );
};

const assertTeacherPermission = (context, actionLabel) => {
  if (context.isTeacher) return;

  throw httpError(
    `Chỉ giáo viên phụ trách lớp mới có thể ${actionLabel}.`,
    403,
    "STREAM_TEACHER_ONLY",
  );
};

const fetchPostRecord = async (classId, postId, options = {}) => {
  const { transaction = undefined, includeDeleted = false } = options;
  assertUUID(postId, "postId");

  const where = {
    id: postId,
    class_id: classId,
  };

  if (!includeDeleted) {
    where.status = "active";
  }

  const post = await ClassStreamPost.findOne({
    where,
    attributes: [
      "id",
      "class_id",
      "author_id",
      "post_type",
      "content",
      "allow_comments",
      "is_pinned",
      "status",
      "created_at",
      "updated_at",
      "deleted_at",
    ],
    include: [
      {
        model: User,
        as: "author",
        attributes: ["id", "full_name", "avatar_url"],
        include: [
          {
            model: Role,
            as: "role",
            attributes: ["code", "name"],
          },
        ],
      },
    ],
    transaction,
  });

  if (!post) {
    throw httpError("Bài đăng không tồn tại hoặc đã bị gỡ bỏ.", 404, "STREAM_POST_NOT_FOUND");
  }

  return post;
};

const fetchCommentRecord = async (classId, commentId, options = {}) => {
  const { transaction = undefined, includeDeleted = false, includePost = false } = options;
  assertUUID(commentId, "commentId");

  const comment = await ClassStreamComment.findOne({
    where: includeDeleted ? { id: commentId } : { id: commentId, status: "active" },
    attributes: [
      "id",
      "post_id",
      "author_id",
      "parent_comment_id",
      "content",
      "status",
      "created_at",
      "updated_at",
      "deleted_at",
    ],
    include: [
      {
        model: User,
        as: "author",
        attributes: ["id", "full_name", "avatar_url"],
        include: [
          {
            model: Role,
            as: "role",
            attributes: ["code", "name"],
          },
        ],
      },
      ...(includePost
        ? [
            {
              model: ClassStreamPost,
              as: "post",
              attributes: ["id", "class_id", "author_id", "allow_comments", "status"],
              where: { class_id: classId },
            },
          ]
        : []),
    ],
    transaction,
  });

  if (!comment || (includePost && comment.post?.class_id !== classId)) {
    throw httpError("Bình luận không tồn tại hoặc đã bị gỡ bỏ.", 404, "STREAM_COMMENT_NOT_FOUND");
  }

  if (!includePost) {
    const post = await ClassStreamPost.findOne({
      where: { id: comment.post_id, class_id: classId },
      attributes: ["id"],
      transaction,
    });

    if (!post) {
      throw httpError("Bình luận không tồn tại hoặc đã bị gỡ bỏ.", 404, "STREAM_COMMENT_NOT_FOUND");
    }
  }

  return comment;
};

const fetchAttachmentsByPostIds = async (postIds) => {
  if (!postIds.length) return new Map();

  const attachments = await ClassStreamAttachment.findAll({
    where: {
      post_id: {
        [Op.in]: postIds,
      },
    },
    attributes: [
      "id",
      "post_id",
      "file_url",
      "original_name",
      "mime_type",
      "file_type",
      "file_size",
      "storage_provider",
      "storage_key",
      "created_at",
    ],
    order: [["created_at", "ASC"]],
  });

  const grouped = new Map();
  for (const attachment of attachments) {
    if (!grouped.has(attachment.post_id)) {
      grouped.set(attachment.post_id, []);
    }
    grouped.get(attachment.post_id).push(attachment);
  }

  return grouped;
};

const fetchAttachmentsByCommentIds = async (commentIds) => {
  if (!commentIds.length) return new Map();

  const attachments = await ClassStreamAttachment.findAll({
    where: {
      comment_id: {
        [Op.in]: commentIds,
      },
    },
    attributes: [
      "id",
      "comment_id",
      "file_url",
      "original_name",
      "mime_type",
      "file_type",
      "file_size",
      "storage_provider",
      "storage_key",
      "created_at",
    ],
    order: [["created_at", "ASC"]],
  });

  const grouped = new Map();
  for (const attachment of attachments) {
    if (!grouped.has(attachment.comment_id)) {
      grouped.set(attachment.comment_id, []);
    }
    grouped.get(attachment.comment_id).push(attachment);
  }

  return grouped;
};

const fetchCommentSummaryForPosts = async (postIds) => {
  const commentCountMap = new Map();
  const latestCommentMap = new Map();

  if (!postIds.length) {
    return { commentCountMap, latestCommentMap };
  }

  const commentCounts = await ClassStreamComment.findAll({
    where: {
      post_id: {
        [Op.in]: postIds,
      },
      status: "active",
    },
    attributes: [
      "post_id",
      [fn("COUNT", col("id")), "comment_count"],
      [fn("MAX", col("created_at")), "latest_comment_at"],
    ],
    group: ["post_id"],
    raw: true,
  });

  for (const row of commentCounts) {
    commentCountMap.set(row.post_id, Number(row.comment_count || 0));
    latestCommentMap.set(row.post_id, row.latest_comment_at || null);
  }

  return { commentCountMap, latestCommentMap };
};

const fetchPostAudience = async (classId) => {
  const classRecord = await Class.findByPk(classId, {
    attributes: ["id", "name", "teacher_id"],
  });

  if (!classRecord) {
    return {
      className: null,
      teacherId: null,
      studentIds: [],
    };
  }

  const enrollments = await Enrollment.findAll({
    where: {
      class_id: classId,
      status: "active",
    },
    attributes: ["user_id"],
  });

  return {
    className: classRecord.name,
    teacherId: classRecord.teacher_id,
    studentIds: enrollments.map((item) => item.user_id),
  };
};

const enqueueStreamNotification = async ({
  eventType,
  recipientIds,
  actorId,
  refType,
  refId,
  classId,
  className,
  authorName,
  postType,
  content,
}) => {
  const uniqueRecipients = [...new Set(recipientIds.filter(Boolean))].filter(
    (recipientId) => String(recipientId) !== String(actorId),
  );

  if (!uniqueRecipients.length) return;

  try {
    await queueEventNotification({
      event_type: eventType,
      user_ids: uniqueRecipients,
      channels: ["in_app"],
      params: {
        ref_type: refType,
        ref_id: refId,
        class_id: classId,
        class_name: className,
        author_name: authorName,
        post_type: postType,
        post_type_label: postTypeLabel(postType),
        excerpt: excerptText(content),
      },
    });
  } catch (error) {
    console.error(`[Stream] Failed to enqueue ${eventType}:`, error.message);
  }
};

const syncOwnerAttachments = async ({
  ownerField,
  ownerId,
  retainAttachmentIds,
  files,
  uploadedBy,
  transaction,
}) => {
  const existingAttachments = await ClassStreamAttachment.findAll({
    where: {
      [ownerField]: ownerId,
    },
    transaction,
  });

  const existingIdSet = new Set(existingAttachments.map((attachment) => attachment.id));
  const retainSet = retainAttachmentIds
    ? new Set(retainAttachmentIds)
    : new Set(existingAttachments.map((attachment) => attachment.id));

  for (const attachmentId of retainSet) {
    if (!existingIdSet.has(attachmentId)) {
      throw httpError(
        "Có tệp đính kèm không thuộc nội dung này.",
        400,
        "STREAM_ATTACHMENT_INVALID",
      );
    }
  }

  const attachmentsToDelete = existingAttachments.filter(
    (attachment) => !retainSet.has(attachment.id),
  );

  if (attachmentsToDelete.length) {
    await ClassStreamAttachment.destroy({
      where: {
        id: {
          [Op.in]: attachmentsToDelete.map((attachment) => attachment.id),
        },
      },
      transaction,
    });
  }

  if (files?.length) {
    await ClassStreamAttachment.bulkCreate(
      files.map((file) =>
        buildAttachmentPayloadFromFile(file, ownerField, ownerId, uploadedBy),
      ),
      { transaction },
    );
  }

  return attachmentsToDelete;
};

const fetchSerializedPostById = async (classId, postId, context) => {
  const post = await fetchPostRecord(classId, postId);
  const attachmentsByPostId = await fetchAttachmentsByPostIds([post.id]);
  const { commentCountMap, latestCommentMap } = await fetchCommentSummaryForPosts([post.id]);

  return serializePost(post, context, attachmentsByPostId, commentCountMap, latestCommentMap);
};

const fetchSerializedCommentById = async (classId, commentId, context) => {
  const comment = await fetchCommentRecord(classId, commentId, { includePost: true });
  const attachmentsByCommentId = await fetchAttachmentsByCommentIds([comment.id]);

  return {
    comment: serializeComment(comment, context, attachmentsByCommentId),
    postId: comment.post_id,
  };
};

const collectCommentSubtreeIds = async (postId, rootCommentId, transaction) => {
  const comments = await ClassStreamComment.findAll({
    where: {
      post_id: postId,
      status: "active",
    },
    attributes: ["id", "parent_comment_id"],
    transaction,
  });

  const childrenByParent = new Map();
  for (const comment of comments) {
    if (!comment.parent_comment_id) continue;
    if (!childrenByParent.has(comment.parent_comment_id)) {
      childrenByParent.set(comment.parent_comment_id, []);
    }
    childrenByParent.get(comment.parent_comment_id).push(comment.id);
  }

  const collected = [];
  const stack = [rootCommentId];
  while (stack.length) {
    const current = stack.pop();
    collected.push(current);

    const children = childrenByParent.get(current) || [];
    for (const childId of children) {
      stack.push(childId);
    }
  }

  return collected;
};

const fetchAttachmentsForCommentIds = async (commentIds, transaction) =>
  ClassStreamAttachment.findAll({
    where: {
      comment_id: {
        [Op.in]: commentIds,
      },
    },
    transaction,
  });

const fetchAttachmentsForPostIds = async (postIds, transaction) =>
  ClassStreamAttachment.findAll({
    where: {
      post_id: {
        [Op.in]: postIds,
      },
    },
    transaction,
  });

const ensureContentOrAttachments = (content, attachmentsCount) => {
  if (!content && attachmentsCount === 0) {
    throw httpError(
      "Bài đăng hoặc bình luận phải có nội dung văn bản hoặc ít nhất một tệp đính kèm.",
      400,
      "STREAM_EMPTY_CONTENT",
    );
  }
};

const canUserAccessClassId = async (userId, classId) => {
  const classRecord = await Class.findByPk(classId, {
    attributes: ["id", "teacher_id"],
  });

  if (!classRecord) {
    return { classRecord: null, isTeacher: false, hasAccess: false };
  }

  const isTeacher = String(classRecord.teacher_id) === String(userId);
  if (isTeacher) {
    return { classRecord, isTeacher: true, hasAccess: true };
  }

  const enrollment = await Enrollment.findOne({
    where: {
      class_id: classId,
      user_id: userId,
      status: "active",
    },
    attributes: ["id"],
  });

  return { classRecord, isTeacher: false, hasAccess: Boolean(enrollment) };
};

export const getClassStream = async (user, classId, query) => {
  const context = await fetchContextForUser(user, classId);
  const page = Number(query.page || 1);
  const limit = Number(query.limit || 10);
  const offset = (page - 1) * limit;

  const where = {
    class_id: classId,
    status: "active",
  };

  const [totalItems, pinnedCount, posts] = await Promise.all([
    ClassStreamPost.count({ where }),
    ClassStreamPost.count({
      where: {
        ...where,
        is_pinned: true,
      },
    }),
    ClassStreamPost.findAll({
      where,
      attributes: [
        "id",
        "class_id",
        "author_id",
        "post_type",
        "content",
        "allow_comments",
        "is_pinned",
        "status",
        "created_at",
        "updated_at",
      ],
      include: [
        {
          model: User,
          as: "author",
          attributes: ["id", "full_name", "avatar_url"],
          include: [
            {
              model: Role,
              as: "role",
              attributes: ["code", "name"],
            },
          ],
        },
      ],
      order: [
        ["is_pinned", "DESC"],
        ["created_at", "DESC"],
      ],
      limit,
      offset,
    }),
  ]);

  const postIds = posts.map((post) => post.id);
  const [attachmentsByPostId, commentSummary] = await Promise.all([
    fetchAttachmentsByPostIds(postIds),
    fetchCommentSummaryForPosts(postIds),
  ]);

  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / limit);
  const regularCount = totalItems - pinnedCount;

  return {
    class: buildClassSummary(context),
    permissions: buildClassPermissions(context),
    pagination: {
      page,
      limit,
      total_items: totalItems,
      total_pages: totalPages,
      has_more: page < totalPages,
      pinned_count: pinnedCount,
      regular_count: regularCount,
    },
    empty_state:
      totalItems === 0
        ? {
            message: "Chưa có bài đăng nào trong lớp học này.",
          }
        : null,
    realtime: buildRealtimeMetadata(classId),
    posts: posts.map((post) =>
      serializePost(
        post,
        context,
        attachmentsByPostId,
        commentSummary.commentCountMap,
        commentSummary.latestCommentMap,
      ),
    ),
  };
};

export const getStreamPostDetail = async (user, classId, postId) => {
  const context = await fetchContextForUser(user, classId);
  const post = await fetchSerializedPostById(classId, postId, context);

  return {
    class: buildClassSummary(context),
    permissions: buildClassPermissions(context),
    post,
  };
};

export const createStreamPost = async (user, classId, payload, files = []) => {
  const context = await fetchContextForUser(user, classId);
  assertClassWritable(context, "đăng bài mới");

  const content = normalizeTextContent(payload.content);
  ensureContentOrAttachments(content, files.length);

  const transaction = await sequelize.transaction();
  let post;

  try {
    post = await ClassStreamPost.create(
      {
        class_id: classId,
        author_id: user.id,
        post_type: payload.post_type,
        content,
        allow_comments: payload.allow_comments,
      },
      { transaction },
    );

    if (files.length) {
      await ClassStreamAttachment.bulkCreate(
        files.map((file) =>
          buildAttachmentPayloadFromFile(file, "post_id", post.id, user.id),
        ),
        { transaction },
      );
    }

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }

  const createdPost = await fetchSerializedPostById(classId, post.id, context);
  emitClassStreamEvent(classId, STREAM_EVENTS.POST_CREATED, {
    class_id: classId,
    post: createdPost,
  });

  const audience = await fetchPostAudience(classId);
  const recipientIds = context.isTeacher ? audience.studentIds : [audience.teacherId];

  await enqueueStreamNotification({
    eventType: context.isTeacher
      ? "STREAM_POST_CREATED_TEACHER"
      : "STREAM_POST_CREATED_STUDENT",
    recipientIds,
    actorId: user.id,
    refType: "STREAM_POST",
    refId: post.id,
    classId,
    className: audience.className,
    authorName: user.full_name,
    postType: payload.post_type,
    content,
  });

  return {
    class: buildClassSummary(context),
    post: createdPost,
  };
};

export const updateStreamPost = async (user, classId, postId, payload, files = []) => {
  const context = await fetchContextForUser(user, classId);
  assertClassWritable(context, "cập nhật bài đăng");

  const post = await fetchPostRecord(classId, postId);
  if (String(post.author_id) !== String(user.id)) {
    throw httpError(
      "Bạn chỉ có thể chỉnh sửa bài đăng của chính mình.",
      403,
      "STREAM_POST_EDIT_DENIED",
    );
  }

  const transaction = await sequelize.transaction();
  let removedAttachments = [];

  try {
    removedAttachments = await syncOwnerAttachments({
      ownerField: "post_id",
      ownerId: post.id,
      retainAttachmentIds: payload.retain_attachment_ids,
      files,
      uploadedBy: user.id,
      transaction,
    });

    const attachmentsAfterUpdate = await ClassStreamAttachment.count({
      where: { post_id: post.id },
      transaction,
    });

    const nextContent =
      payload.content !== undefined ? normalizeTextContent(payload.content) : post.content;
    ensureContentOrAttachments(nextContent, attachmentsAfterUpdate);

    const updateData = { updated_at: new Date() };

    if (payload.post_type !== undefined) {
      updateData.post_type = payload.post_type;
    }

    if (payload.content !== undefined) {
      updateData.content = nextContent;
    }

    const hasMutableFields =
      Object.keys(updateData).length > 1 || files.length || removedAttachments.length;
    if (!hasMutableFields) {
      throw httpError("Không có thông tin nào cần cập nhật.", 400, "VALIDATION_ERROR");
    }

    await post.update(updateData, { transaction });
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }

  if (removedAttachments.length) {
    await deleteCloudinaryAssets(removedAttachments);
  }

  const updatedPost = await fetchSerializedPostById(classId, postId, context);
  emitClassStreamEvent(classId, STREAM_EVENTS.POST_UPDATED, {
    class_id: classId,
    post: updatedPost,
  });

  return {
    class: buildClassSummary(context),
    post: updatedPost,
  };
};

export const deleteStreamPost = async (user, classId, postId) => {
  const context = await fetchContextForUser(user, classId);
  assertClassWritable(context, "xóa bài đăng");

  const post = await fetchPostRecord(classId, postId);
  if (String(post.author_id) !== String(user.id)) {
    throw httpError(
      "Bạn chỉ có thể xóa bài đăng của chính mình.",
      403,
      "STREAM_POST_DELETE_DENIED",
    );
  }

  const transaction = await sequelize.transaction();
  let attachmentsToDelete = [];
  let deletedCommentIds = [];

  try {
    const comments = await ClassStreamComment.findAll({
      where: {
        post_id: post.id,
        status: "active",
      },
      attributes: ["id"],
      transaction,
    });

    deletedCommentIds = comments.map((comment) => comment.id);

    const [postAttachments, commentAttachments] = await Promise.all([
      fetchAttachmentsForPostIds([post.id], transaction),
      deletedCommentIds.length
        ? fetchAttachmentsForCommentIds(deletedCommentIds, transaction)
        : Promise.resolve([]),
    ]);

    attachmentsToDelete = [...postAttachments, ...commentAttachments];

    if (attachmentsToDelete.length) {
      await ClassStreamAttachment.destroy({
        where: {
          id: {
            [Op.in]: attachmentsToDelete.map((attachment) => attachment.id),
          },
        },
        transaction,
      });
    }

    await ClassStreamComment.update(
      {
        status: "deleted",
        deleted_at: new Date(),
        updated_at: new Date(),
      },
      {
        where: {
          post_id: post.id,
          status: {
            [Op.ne]: "deleted",
          },
        },
        transaction,
      },
    );

    await post.update(
      {
        status: "deleted",
        deleted_at: new Date(),
        updated_at: new Date(),
      },
      { transaction },
    );

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }

  if (attachmentsToDelete.length) {
    await deleteCloudinaryAssets(attachmentsToDelete);
  }

  emitClassStreamEvent(classId, STREAM_EVENTS.POST_DELETED, {
    class_id: classId,
    post_id: postId,
    deleted_comment_ids: deletedCommentIds,
    deleted_by: user.id,
  });

  return {
    message: "Bài đăng đã được xóa thành công.",
    post_id: postId,
  };
};

export const setStreamPostPinned = async (user, classId, postId, payload) => {
  const context = await fetchContextForUser(user, classId);
  assertClassWritable(context, "ghim hoặc bỏ ghim bài đăng");
  assertTeacherPermission(context, "ghim hoặc bỏ ghim bài đăng");

  const post = await fetchPostRecord(classId, postId);
  await post.update({
    is_pinned: payload.is_pinned,
    updated_at: new Date(),
  });

  const updatedPost = await fetchSerializedPostById(classId, postId, context);
  emitClassStreamEvent(classId, STREAM_EVENTS.POST_PINNED, {
    class_id: classId,
    post: updatedPost,
  });

  if (payload.is_pinned) {
    const audience = await fetchPostAudience(classId);
    await enqueueStreamNotification({
      eventType: "STREAM_POST_PINNED",
      recipientIds: audience.studentIds,
      actorId: user.id,
      refType: "STREAM_POST",
      refId: postId,
      classId,
      className: audience.className,
      authorName: user.full_name,
      postType: post.post_type,
      content: post.content,
    });
  }

  return {
    class: buildClassSummary(context),
    post: updatedPost,
  };
};

export const setStreamPostCommentPolicy = async (user, classId, postId, payload) => {
  const context = await fetchContextForUser(user, classId);
  assertClassWritable(context, "khóa hoặc mở bình luận");
  assertTeacherPermission(context, "khóa hoặc mở bình luận");

  const post = await fetchPostRecord(classId, postId);
  await post.update({
    allow_comments: payload.allow_comments,
    updated_at: new Date(),
  });

  const updatedPost = await fetchSerializedPostById(classId, postId, context);
  emitClassStreamEvent(classId, STREAM_EVENTS.POST_COMMENT_POLICY_UPDATED, {
    class_id: classId,
    post: updatedPost,
  });

  return {
    class: buildClassSummary(context),
    post: updatedPost,
  };
};

export const getStreamComments = async (user, classId, postId, query) => {
  const context = await fetchContextForUser(user, classId);
  const page = Number(query.page || 1);
  const limit = Number(query.limit || 20);
  const offset = (page - 1) * limit;

  const post = await fetchPostRecord(classId, postId);

  const [totalItems, comments] = await Promise.all([
    ClassStreamComment.count({
      where: {
        post_id: postId,
        status: "active",
      },
    }),
    ClassStreamComment.findAll({
      where: {
        post_id: postId,
        status: "active",
      },
      attributes: [
        "id",
        "post_id",
        "author_id",
        "parent_comment_id",
        "content",
        "status",
        "created_at",
        "updated_at",
      ],
      include: [
        {
          model: User,
          as: "author",
          attributes: ["id", "full_name", "avatar_url"],
          include: [
            {
              model: Role,
              as: "role",
              attributes: ["code", "name"],
            },
          ],
        },
      ],
      order: [
        ["created_at", "ASC"],
        ["id", "ASC"],
      ],
      limit,
      offset,
    }),
  ]);

  const commentIds = comments.map((comment) => comment.id);
  const attachmentsByCommentId = await fetchAttachmentsByCommentIds(commentIds);
  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / limit);

  return {
    class: buildClassSummary(context),
    permissions: buildClassPermissions(context),
    post: {
      id: post.id,
      author_id: post.author_id,
      allow_comments: post.allow_comments,
      is_pinned: post.is_pinned,
      comment_count: totalItems,
      permissions: buildPostPermissions(post, context),
    },
    pagination: {
      page,
      limit,
      total_items: totalItems,
      total_pages: totalPages,
      has_more: page < totalPages,
    },
    empty_state:
      totalItems === 0
        ? {
            message: "Chưa có bình luận nào cho bài đăng này.",
          }
        : null,
    comments: comments.map((comment) => serializeComment(comment, context, attachmentsByCommentId)),
  };
};

export const createStreamComment = async (user, classId, postId, payload, files = []) => {
  const context = await fetchContextForUser(user, classId);
  assertClassWritable(context, "bình luận");

  const post = await fetchPostRecord(classId, postId);
  if (!post.allow_comments) {
    throw httpError("Bài đăng này hiện đang bị khóa bình luận.", 400, "STREAM_COMMENTS_LOCKED");
  }

  let parentComment = null;
  if (payload.parent_comment_id) {
    parentComment = await fetchCommentRecord(classId, payload.parent_comment_id, {
      includePost: true,
    });

    if (String(parentComment.post_id) !== String(postId)) {
      throw httpError(
        "Bình luận cha không thuộc bài đăng này.",
        400,
        "STREAM_PARENT_COMMENT_INVALID",
      );
    }
  }

  const content = normalizeTextContent(payload.content);
  ensureContentOrAttachments(content, files.length);

  const transaction = await sequelize.transaction();
  let comment;

  try {
    comment = await ClassStreamComment.create(
      {
        post_id: postId,
        author_id: user.id,
        parent_comment_id: payload.parent_comment_id || null,
        content,
      },
      { transaction },
    );

    if (files.length) {
      await ClassStreamAttachment.bulkCreate(
        files.map((file) =>
          buildAttachmentPayloadFromFile(file, "comment_id", comment.id, user.id),
        ),
        { transaction },
      );
    }

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }

  const serializedComment = await fetchSerializedCommentById(classId, comment.id, context);
  emitClassStreamEvent(classId, STREAM_EVENTS.COMMENT_CREATED, {
    class_id: classId,
    post_id: postId,
    comment: serializedComment.comment,
  });

  const audience = await fetchPostAudience(classId);
  const recipientIds = [post.author_id, audience.teacherId, parentComment?.author_id];

  await enqueueStreamNotification({
    eventType: "STREAM_COMMENT_CREATED",
    recipientIds,
    actorId: user.id,
    refType: "STREAM_COMMENT",
    refId: comment.id,
    classId,
    className: audience.className,
    authorName: user.full_name,
    postType: post.post_type,
    content,
  });

  return {
    class: buildClassSummary(context),
    comment: serializedComment.comment,
  };
};

export const updateStreamComment = async (user, classId, commentId, payload, files = []) => {
  const context = await fetchContextForUser(user, classId);
  assertClassWritable(context, "cập nhật bình luận");

  const comment = await fetchCommentRecord(classId, commentId, { includePost: true });
  if (String(comment.author_id) !== String(user.id)) {
    throw httpError(
      "Bạn chỉ có thể chỉnh sửa bình luận của chính mình.",
      403,
      "STREAM_COMMENT_EDIT_DENIED",
    );
  }

  const transaction = await sequelize.transaction();
  let removedAttachments = [];

  try {
    removedAttachments = await syncOwnerAttachments({
      ownerField: "comment_id",
      ownerId: comment.id,
      retainAttachmentIds: payload.retain_attachment_ids,
      files,
      uploadedBy: user.id,
      transaction,
    });

    const attachmentsAfterUpdate = await ClassStreamAttachment.count({
      where: { comment_id: comment.id },
      transaction,
    });

    const nextContent =
      payload.content !== undefined ? normalizeTextContent(payload.content) : comment.content;
    ensureContentOrAttachments(nextContent, attachmentsAfterUpdate);

    const updateData = { updated_at: new Date() };
    if (payload.content !== undefined) {
      updateData.content = nextContent;
    }

    const hasMutableFields =
      Object.keys(updateData).length > 1 || files.length || removedAttachments.length;
    if (!hasMutableFields) {
      throw httpError("Không có thông tin nào cần cập nhật.", 400, "VALIDATION_ERROR");
    }

    await comment.update(updateData, { transaction });
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }

  if (removedAttachments.length) {
    await deleteCloudinaryAssets(removedAttachments);
  }

  const serializedComment = await fetchSerializedCommentById(classId, comment.id, context);
  emitClassStreamEvent(classId, STREAM_EVENTS.COMMENT_UPDATED, {
    class_id: classId,
    post_id: comment.post_id,
    comment: serializedComment.comment,
  });

  return {
    class: buildClassSummary(context),
    comment: serializedComment.comment,
  };
};

export const deleteStreamComment = async (user, classId, commentId) => {
  const context = await fetchContextForUser(user, classId);
  assertClassWritable(context, "xóa bình luận");

  const comment = await fetchCommentRecord(classId, commentId, { includePost: true });
  if (String(comment.author_id) !== String(user.id)) {
    throw httpError(
      "Bạn chỉ có thể xóa bình luận của chính mình.",
      403,
      "STREAM_COMMENT_DELETE_DENIED",
    );
  }

  const transaction = await sequelize.transaction();
  let deletedIds = [];
  let attachmentsToDelete = [];

  try {
    deletedIds = await collectCommentSubtreeIds(comment.post_id, comment.id, transaction);

    attachmentsToDelete = deletedIds.length
      ? await fetchAttachmentsForCommentIds(deletedIds, transaction)
      : [];

    if (attachmentsToDelete.length) {
      await ClassStreamAttachment.destroy({
        where: {
          id: {
            [Op.in]: attachmentsToDelete.map((attachment) => attachment.id),
          },
        },
        transaction,
      });
    }

    await ClassStreamComment.update(
      {
        status: "deleted",
        deleted_at: new Date(),
        updated_at: new Date(),
      },
      {
        where: {
          id: {
            [Op.in]: deletedIds,
          },
        },
        transaction,
      },
    );

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }

  if (attachmentsToDelete.length) {
    await deleteCloudinaryAssets(attachmentsToDelete);
  }

  emitClassStreamEvent(classId, STREAM_EVENTS.COMMENT_DELETED, {
    class_id: classId,
    post_id: comment.post_id,
    comment_id: commentId,
    deleted_comment_ids: deletedIds,
    deleted_by: user.id,
  });

  return {
    message: "Bình luận đã được xóa thành công.",
    comment_id: commentId,
    deleted_comment_ids: deletedIds,
  };
};

export const resolveNotificationTargetForUser = async (userId, notificationId) => {
  assertUUID(notificationId, "notificationId");

  const notification = await Notification.findOne({
    where: {
      id: notificationId,
      user_id: userId,
    },
  });

  if (!notification) {
    throw httpError("Notification not found or access denied", 404, "NOTIFICATION_NOT_FOUND");
  }

  if (!notification.is_read) {
    await notification.update({ is_read: true });
  }

  if (notification.ref_type === "STREAM_POST") {
    const post = await ClassStreamPost.findOne({
      where: {
        id: notification.ref_id,
        status: "active",
      },
      attributes: ["id", "class_id"],
    });

    if (!post) {
      throw httpError(
        "Nội dung này không còn tồn tại hoặc đã bị gỡ bỏ.",
        404,
        "STREAM_TARGET_REMOVED",
      );
    }

    const access = await canUserAccessClassId(userId, post.class_id);
    if (!access.hasAccess) {
      throw httpError(
        "Bạn không còn quyền truy cập nội dung thông báo này.",
        403,
        "STREAM_TARGET_ACCESS_DENIED",
      );
    }

    return {
      notification,
      target: {
        type: "stream_post",
        class_id: post.class_id,
        post_id: post.id,
        comment_id: null,
        route: `/classes/${post.class_id}/stream?postId=${post.id}`,
      },
    };
  }

  if (notification.ref_type === "STREAM_COMMENT") {
    const comment = await ClassStreamComment.findOne({
      where: {
        id: notification.ref_id,
        status: "active",
      },
      attributes: ["id", "post_id"],
      include: [
        {
          model: ClassStreamPost,
          as: "post",
          attributes: ["id", "class_id", "status"],
        },
      ],
    });

    if (!comment || !comment.post || comment.post.status !== "active") {
      throw httpError(
        "Nội dung này không còn tồn tại hoặc đã bị gỡ bỏ.",
        404,
        "STREAM_TARGET_REMOVED",
      );
    }

    const access = await canUserAccessClassId(userId, comment.post.class_id);
    if (!access.hasAccess) {
      throw httpError(
        "Bạn không còn quyền truy cập nội dung thông báo này.",
        403,
        "STREAM_TARGET_ACCESS_DENIED",
      );
    }

    return {
      notification,
      target: {
        type: "stream_comment",
        class_id: comment.post.class_id,
        post_id: comment.post_id,
        comment_id: comment.id,
        route: `/classes/${comment.post.class_id}/stream?postId=${comment.post_id}&commentId=${comment.id}`,
      },
    };
  }

  return {
    notification,
    target: notification.ref_id
      ? {
          type: notification.ref_type,
          ref_id: notification.ref_id,
        }
      : null,
  };
};

