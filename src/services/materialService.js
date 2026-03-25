// src/services/materialService.js
import { Op } from "sequelize";
import {
  Material,
  Class,
  Course,
  ClassSession,
} from "../models/index.js";
import {
  getTypeFromFilename,
  getPublicIdFromUrl,
  cloudinary,
} from "../middleware/uploadMiddleware.js";

const httpError = (message, statusCode, code, details) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.isOperational = true;
  if (code) err.code = code;
  if (details) err.details = details;
  return err;
};

const assertUUID = (id, field) => {
  if (
    typeof id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      id,
    )
  ) {
    throw httpError(`Invalid ${field}. Must be UUID.`, 400, "VALIDATION_ERROR", {
      field,
      value: id,
    });
  }
};

const verifyTeacherOwnsClass = async (teacherId, classId, checkActive = true) => {
  assertUUID(classId, "classId");

  const cls = await Class.findByPk(classId, {
    attributes: ["id", "name", "teacher_id", "status"],
  });

  if (!cls) {
    throw httpError("Lớp học không tồn tại.", 404, "NOT_FOUND");
  }
  if (cls.teacher_id !== teacherId) {
    throw httpError("Bạn không có quyền thao tác trên lớp học này.", 403, "FORBIDDEN");
  }
  if (checkActive && cls.status !== "active") {
    throw httpError(
      "Lớp học không ở trạng thái hoạt động. Không thể thao tác tài liệu.",
      400,
      "CLASS_NOT_ACTIVE",
    );
  }

  return cls;
};

const verifyTeacherOwnsMaterial = async (teacherId, materialId) => {
  assertUUID(materialId, "materialId");

  const material = await Material.findByPk(materialId, {
    include: [
      {
        model: Class,
        as: "class",
        attributes: ["id", "name", "teacher_id", "status"],
      },
    ],
  });

  if (!material) {
    throw httpError("Tài liệu không tồn tại.", 404, "NOT_FOUND");
  }
  if (!material.class || material.class.teacher_id !== teacherId) {
    throw httpError("Bạn không có quyền thao tác trên tài liệu này.", 403, "FORBIDDEN");
  }

  return material;
};

const isValidUrl = (str) => {
  try {
    const url = new URL(str);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

export const getClassMaterials = async (teacherId, classId) => {
  await verifyTeacherOwnsClass(teacherId, classId, false);

  const materials = await Material.findAll({
    where: { class_id: classId },
    attributes: [
      "id",
      "class_id",
      "session_id",
      "uploaded_by",
      "type",
      "title",
      "description",
      "file_url",
      "original_filename",
      "file_size",
      "is_visible",
      "created_at",
      "updated_at",
    ],
    order: [["created_at", "ASC"]],
  });

  const sessions = await ClassSession.findAll({
    where: { class_id: classId },
    attributes: ["id", "start_time", "end_time", "topic", "status"],
    order: [["start_time", "ASC"]],
  });

  const general = [];
  const sessionMaterialsMap = new Map();

  for (const material of materials) {
    const plain = material.toJSON();
    if (!material.session_id) {
      general.push(plain);
    } else {
      if (!sessionMaterialsMap.has(material.session_id)) {
        sessionMaterialsMap.set(material.session_id, []);
      }
      sessionMaterialsMap.get(material.session_id).push(plain);
    }
  }

  const bySession = sessions.map((session, idx) => ({
    session: {
      id: session.id,
      index: idx + 1,
      start_time: session.start_time,
      end_time: session.end_time,
      topic: session.topic,
      status: session.status,
    },
    materials: sessionMaterialsMap.get(session.id) || [],
  }));

  return { general, by_session: bySession };
};

export const getMaterialsBySession = async (teacherId, classId, sessionId) => {
  await verifyTeacherOwnsClass(teacherId, classId, false);
  assertUUID(sessionId, "sessionId");

  const session = await ClassSession.findOne({
    where: { id: sessionId, class_id: classId },
    attributes: ["id", "start_time", "end_time", "topic", "status"],
  });

  if (!session) {
    throw httpError(
      "Buổi học không tồn tại hoặc không thuộc lớp này.",
      404,
      "NOT_FOUND",
    );
  }

  const materials = await Material.findAll({
    where: { class_id: classId, session_id: sessionId },
    attributes: [
      "id",
      "type",
      "title",
      "description",
      "file_url",
      "original_filename",
      "file_size",
      "is_visible",
      "created_at",
      "updated_at",
    ],
    order: [["created_at", "ASC"]],
  });

  return { session: session.toJSON(), materials };
};

export const uploadMaterial = async (teacherId, classId, body, file) => {
  await verifyTeacherOwnsClass(teacherId, classId);

  const { title, description, session_id, url } = body;

  if (!title || String(title).trim() === "") {
    throw httpError("Tên tài liệu (title) là bắt buộc.", 400, "VALIDATION_ERROR");
  }

  if (!file && !url) {
    throw httpError(
      "Vui lòng chọn file để tải lên hoặc nhập URL đường dẫn.",
      400,
      "VALIDATION_ERROR",
    );
  }

  if (file && url) {
    throw httpError(
      "Chỉ được chọn 1 trong 2: tải file hoặc nhập URL, không cả hai.",
      400,
      "VALIDATION_ERROR",
    );
  }

  if (session_id) {
    assertUUID(session_id, "session_id");
    const session = await ClassSession.findOne({
      where: { id: session_id, class_id: classId },
    });
    if (!session) {
      throw httpError(
        "Buổi học không tồn tại hoặc không thuộc lớp này.",
        404,
        "NOT_FOUND",
      );
    }
  }

  let materialData;

  if (file) {
    materialData = {
      class_id: classId,
      session_id: session_id || null,
      uploaded_by: teacherId,
      type: getTypeFromFilename(file.originalname),
      title: String(title).trim(),
      description: description ? String(description).trim() : null,
      file_url: file.path,
      original_filename: file.originalname,
      file_size: file.size || null,
      is_visible: true,
    };
  } else {
    if (!isValidUrl(url)) {
      throw httpError(
        "URL không hợp lệ. Vui lòng nhập URL bắt đầu bằng http:// hoặc https://",
        400,
        "VALIDATION_ERROR",
      );
    }

    materialData = {
      class_id: classId,
      session_id: session_id || null,
      uploaded_by: teacherId,
      type: "link",
      title: String(title).trim(),
      description: description ? String(description).trim() : null,
      file_url: url,
      original_filename: null,
      file_size: null,
      is_visible: true,
    };
  }

  return Material.create(materialData);
};

export const updateMaterial = async (teacherId, materialId, body) => {
  const material = await verifyTeacherOwnsMaterial(teacherId, materialId);

  const updateData = {};

  if (body.title !== undefined) {
    if (!body.title || String(body.title).trim() === "") {
      throw httpError("Tên tài liệu không được để trống.", 400, "VALIDATION_ERROR");
    }
    updateData.title = String(body.title).trim();
  }

  if (body.description !== undefined) {
    updateData.description = body.description ? String(body.description).trim() : null;
  }

  if (body.url !== undefined) {
    if (material.type !== "link") {
      throw httpError(
        "Chỉ có thể cập nhật URL cho tài liệu dạng link. Tài liệu dạng file không thể đổi URL.",
        400,
        "VALIDATION_ERROR",
      );
    }
    if (!isValidUrl(body.url)) {
      throw httpError(
        "URL không hợp lệ. Vui lòng nhập URL bắt đầu bằng http:// hoặc https://",
        400,
        "VALIDATION_ERROR",
      );
    }
    updateData.file_url = body.url;
  }

  if (body.session_id !== undefined) {
    if (body.session_id === null || body.session_id === "") {
      updateData.session_id = null;
    } else {
      assertUUID(body.session_id, "session_id");
      const session = await ClassSession.findOne({
        where: { id: body.session_id, class_id: material.class_id },
      });
      if (!session) {
        throw httpError(
          "Buổi học không tồn tại hoặc không thuộc lớp này.",
          404,
          "NOT_FOUND",
        );
      }
      updateData.session_id = body.session_id;
    }
  }

  if (Object.keys(updateData).length === 0) {
    throw httpError("Không có thông tin nào cần cập nhật.", 400, "VALIDATION_ERROR");
  }

  updateData.updated_at = new Date();
  await material.update(updateData);

  return material;
};

export const shareMaterial = async (teacherId, materialId, body) => {
  const material = await verifyTeacherOwnsMaterial(teacherId, materialId);
  const targetClassIds = Array.isArray(body?.target_class_ids) ? body.target_class_ids : [];

  if (targetClassIds.length === 0) {
    throw httpError(
      "Vui lòng chọn ít nhất một lớp để chia sẻ tài liệu.",
      400,
      "VALIDATION_ERROR",
    );
  }

  const normalizedTargetIds = [...new Set(targetClassIds.map((id) => String(id).trim()).filter(Boolean))];
  normalizedTargetIds.forEach((classId) => assertUUID(classId, "target_class_id"));

  const filteredTargetIds = normalizedTargetIds.filter((classId) => classId !== material.class_id);
  if (filteredTargetIds.length === 0) {
    throw httpError(
      "Kh?ng c? l?p ??ch h?p l? ?? chia s?. L?p hi?n t?i s? kh?ng ???c t?nh.",
      400,
      "VALIDATION_ERROR",
    );
  }

  const targetClasses = await Class.findAll({
    where: {
      id: { [Op.in]: filteredTargetIds },
      teacher_id: teacherId,
      status: "active",
    },
    attributes: ["id", "name"],
    include: [
      {
        model: Course,
        as: "course",
        required: false,
        attributes: ["id", "code", "name"],
      },
    ],
  });

  if (targetClasses.length !== filteredTargetIds.length) {
    throw httpError(
      "Một hoặc nhiều lớp đích không tồn tại, không hoạt động, hoặc bạn không có quyền thao tác.",
      403,
      "FORBIDDEN",
    );
  }

  const existingShares = await Material.findAll({
    where: {
      class_id: { [Op.in]: filteredTargetIds },
      title: material.title,
      file_url: material.file_url,
      uploaded_by: teacherId,
    },
    attributes: ["class_id"],
  });

  const alreadySharedClassIds = new Set(existingShares.map((item) => item.class_id));
  const shareTargets = targetClasses.filter((targetClass) => !alreadySharedClassIds.has(targetClass.id));

  if (shareTargets.length === 0) {
    throw httpError(
      "Tài liệu này đã được chia sẻ tới các lớp đã chọn trước đó.",
      409,
      "DUPLICATE_SHARE",
    );
  }

  const timestamp = new Date();
  const createdMaterials = await Material.bulkCreate(
    shareTargets.map((targetClass) => ({
      class_id: targetClass.id,
      session_id: null,
      uploaded_by: teacherId,
      type: material.type,
      title: material.title,
      description: material.description,
      file_url: material.file_url,
      original_filename: material.original_filename,
      file_size: material.file_size,
      is_visible: material.is_visible,
      created_at: timestamp,
      updated_at: timestamp,
    })),
    { returning: true },
  );

  return {
    source_material_id: material.id,
    shared_count: createdMaterials.length,
    skipped_count: alreadySharedClassIds.size,
    shared_to: shareTargets.map((targetClass) => {
      const created = createdMaterials.find((item) => item.class_id === targetClass.id);
      return {
        class_id: targetClass.id,
        class_name: targetClass.name,
        course_code: targetClass.course?.code || null,
        material_id: created?.id || null,
      };
    }),
  };
};

export const toggleVisibility = async (teacherId, materialId) => {
  const material = await verifyTeacherOwnsMaterial(teacherId, materialId);

  const newVisibility = !material.is_visible;
  await material.update({
    is_visible: newVisibility,
    updated_at: new Date(),
  });

  return {
    id: material.id,
    is_visible: newVisibility,
    message: newVisibility
      ? "Tài liệu đã được hiển thị cho sinh viên."
      : "Tài liệu đã được ẩn khỏi sinh viên.",
  };
};

export const deleteMaterial = async (teacherId, materialId) => {
  const material = await verifyTeacherOwnsMaterial(teacherId, materialId);

  if (material.type !== "link" && material.file_url) {
    try {
      const sharedReferenceCount = await Material.count({
        where: {
          file_url: material.file_url,
          id: { [Op.ne]: material.id },
        },
      });

      if (sharedReferenceCount === 0) {
        const publicId = getPublicIdFromUrl(material.file_url);
        if (publicId) {
          await cloudinary.uploader.destroy(publicId, { resource_type: "raw" });
        }
      }
    } catch (cloudErr) {
      console.warn(`Cảnh báo: Không thể xóa file trên Cloudinary: ${cloudErr.message}`);
    }
  }

  await material.destroy();

  return { message: "Tài liệu đã được xóa thành công." };
};
