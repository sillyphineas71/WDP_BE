import { successResponse } from "../utils/responseUtils.js";
import {
  createStreamComment,
  createStreamPost,
  deleteStreamComment,
  deleteStreamPost,
  getClassStream,
  getStreamComments,
  getStreamPostDetail,
  setStreamPostCommentPolicy,
  setStreamPostPinned,
  updateStreamComment,
  updateStreamPost,
} from "../services/classStreamService.js";
import {
  normalizeClassStreamPayload,
  validateCommentPagination,
  validateCreateStreamComment,
  validateCreateStreamPost,
  validatePinStreamPost,
  validateStreamPagination,
  validateTogglePostComments,
  validateUpdateStreamComment,
  validateUpdateStreamPost,
} from "../validators/classStreamValidator.js";

const validationErrorResponse = (res, error) => {
  const validationErrors = error.details.map((detail) => ({
    field: detail.path.join("."),
    message: detail.message,
  }));

  return res.status(400).json({
    success: false,
    message: "Validation failed",
    statusCode: 400,
    error: {
      validationErrors,
    },
  });
};

export const getClassStreamHandler = async (req, res, next) => {
  try {
    const { error, value } = validateStreamPagination(req.query);
    if (error) {
      return validationErrorResponse(res, error);
    }

    const data = await getClassStream(req.user, req.params.classId, value);
    return res
      .status(200)
      .json(successResponse(data, "Lấy bảng tin lớp học thành công", 200));
  } catch (error) {
    next(error);
  }
};

export const getStreamPostDetailHandler = async (req, res, next) => {
  try {
    const data = await getStreamPostDetail(req.user, req.params.classId, req.params.postId);
    return res
      .status(200)
      .json(successResponse(data, "Lấy chi tiết bài đăng thành công", 200));
  } catch (error) {
    next(error);
  }
};

export const createStreamPostHandler = async (req, res, next) => {
  try {
    const normalizedPayload = normalizeClassStreamPayload(req.body);
    const { error, value } = validateCreateStreamPost(normalizedPayload);
    if (error) {
      return validationErrorResponse(res, error);
    }

    const data = await createStreamPost(req.user, req.params.classId, value, req.files || []);
    return res.status(201).json(successResponse(data, "Tạo bài đăng thành công", 201));
  } catch (error) {
    next(error);
  }
};

export const updateStreamPostHandler = async (req, res, next) => {
  try {
    const normalizedPayload = normalizeClassStreamPayload(req.body);
    const { error, value } = validateUpdateStreamPost(normalizedPayload);
    if (error) {
      return validationErrorResponse(res, error);
    }

    const data = await updateStreamPost(
      req.user,
      req.params.classId,
      req.params.postId,
      value,
      req.files || [],
    );
    return res
      .status(200)
      .json(successResponse(data, "Cập nhật bài đăng thành công", 200));
  } catch (error) {
    next(error);
  }
};

export const deleteStreamPostHandler = async (req, res, next) => {
  try {
    const data = await deleteStreamPost(req.user, req.params.classId, req.params.postId);
    return res.status(200).json(successResponse(data, data.message, 200));
  } catch (error) {
    next(error);
  }
};

export const setStreamPostPinnedHandler = async (req, res, next) => {
  try {
    const normalizedPayload = normalizeClassStreamPayload(req.body);
    const { error, value } = validatePinStreamPost(normalizedPayload);
    if (error) {
      return validationErrorResponse(res, error);
    }

    const data = await setStreamPostPinned(
      req.user,
      req.params.classId,
      req.params.postId,
      value,
    );
    return res
      .status(200)
      .json(successResponse(data, "Cập nhật trạng thái ghim thành công", 200));
  } catch (error) {
    next(error);
  }
};

export const setStreamPostCommentPolicyHandler = async (req, res, next) => {
  try {
    const normalizedPayload = normalizeClassStreamPayload(req.body);
    const { error, value } = validateTogglePostComments(normalizedPayload);
    if (error) {
      return validationErrorResponse(res, error);
    }

    const data = await setStreamPostCommentPolicy(
      req.user,
      req.params.classId,
      req.params.postId,
      value,
    );
    return res
      .status(200)
      .json(successResponse(data, "Cập nhật quyền bình luận thành công", 200));
  } catch (error) {
    next(error);
  }
};

export const getStreamCommentsHandler = async (req, res, next) => {
  try {
    const { error, value } = validateCommentPagination(req.query);
    if (error) {
      return validationErrorResponse(res, error);
    }

    const data = await getStreamComments(req.user, req.params.classId, req.params.postId, value);
    return res.status(200).json(successResponse(data, "Lấy bình luận thành công", 200));
  } catch (error) {
    next(error);
  }
};

export const createStreamCommentHandler = async (req, res, next) => {
  try {
    const normalizedPayload = normalizeClassStreamPayload(req.body);
    const { error, value } = validateCreateStreamComment(normalizedPayload);
    if (error) {
      return validationErrorResponse(res, error);
    }

    const data = await createStreamComment(
      req.user,
      req.params.classId,
      req.params.postId,
      value,
      req.files || [],
    );
    return res.status(201).json(successResponse(data, "Tạo bình luận thành công", 201));
  } catch (error) {
    next(error);
  }
};

export const updateStreamCommentHandler = async (req, res, next) => {
  try {
    const normalizedPayload = normalizeClassStreamPayload(req.body);
    const { error, value } = validateUpdateStreamComment(normalizedPayload);
    if (error) {
      return validationErrorResponse(res, error);
    }

    const data = await updateStreamComment(
      req.user,
      req.params.classId,
      req.params.commentId,
      value,
      req.files || [],
    );
    return res
      .status(200)
      .json(successResponse(data, "Cập nhật bình luận thành công", 200));
  } catch (error) {
    next(error);
  }
};

export const deleteStreamCommentHandler = async (req, res, next) => {
  try {
    const data = await deleteStreamComment(req.user, req.params.classId, req.params.commentId);
    return res.status(200).json(successResponse(data, data.message, 200));
  } catch (error) {
    next(error);
  }
};

