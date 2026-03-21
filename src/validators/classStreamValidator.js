import Joi from "joi";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const parseBooleanLike = (value) => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "no", "off"].includes(normalized)) {
      return false;
    }
  }

  return value;
};

const parseUuidArrayLike = (value) => {
  if (Array.isArray(value)) {
    return value.filter((item) => item !== undefined && item !== null && String(item).trim() !== "");
  }

  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    // Fall back to comma-separated parsing.
  }

  return trimmed
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
};

const booleanLikeSchema = Joi.any().custom((value, helpers) => {
  const parsed = parseBooleanLike(value);
  if (typeof parsed !== "boolean") {
    return helpers.error("boolean.base");
  }
  return parsed;
}, "boolean-like parser");

const uuidArrayLikeSchema = Joi.any().custom((value, helpers) => {
  const parsed = parseUuidArrayLike(value);

  if (!Array.isArray(parsed)) {
    return helpers.error("array.base");
  }

  for (const item of parsed) {
    if (typeof item !== "string" || !UUID_REGEX.test(item)) {
      return helpers.error("string.guid");
    }
  }

  return parsed;
}, "uuid-array parser");

export const normalizeClassStreamPayload = (payload = {}) => {
  const normalized = { ...payload };

  if (Object.prototype.hasOwnProperty.call(normalized, "allow_comments")) {
    normalized.allow_comments = parseBooleanLike(normalized.allow_comments);
  }

  if (Object.prototype.hasOwnProperty.call(normalized, "is_pinned")) {
    normalized.is_pinned = parseBooleanLike(normalized.is_pinned);
  }

  if (Object.prototype.hasOwnProperty.call(normalized, "retain_attachment_ids")) {
    normalized.retain_attachment_ids = parseUuidArrayLike(normalized.retain_attachment_ids);
  }

  if (
    Object.prototype.hasOwnProperty.call(normalized, "parent_comment_id") &&
    normalized.parent_comment_id === ""
  ) {
    normalized.parent_comment_id = null;
  }

  return normalized;
};

export const validateStreamPagination = (payload) => {
  const schema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(50).default(10),
  });

  return schema.validate(payload, { abortEarly: false, stripUnknown: true });
};

export const validateCommentPagination = (payload) => {
  const schema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
  });

  return schema.validate(payload, { abortEarly: false, stripUnknown: true });
};

export const validateCreateStreamPost = (payload) => {
  const schema = Joi.object({
    post_type: Joi.string()
      .valid("announcement", "discussion", "question", "resource")
      .default("discussion"),
    content: Joi.string().allow("", null).max(10000).default(null),
    allow_comments: booleanLikeSchema.default(true),
  });

  return schema.validate(payload, { abortEarly: false, stripUnknown: true });
};

export const validateUpdateStreamPost = (payload) => {
  const schema = Joi.object({
    post_type: Joi.string()
      .valid("announcement", "discussion", "question", "resource")
      .optional(),
    content: Joi.string().allow("", null).max(10000).optional(),
    retain_attachment_ids: uuidArrayLikeSchema.optional(),
  });

  return schema.validate(payload, { abortEarly: false, stripUnknown: true });
};

export const validateCreateStreamComment = (payload) => {
  const schema = Joi.object({
    content: Joi.string().allow("", null).max(5000).default(null),
    parent_comment_id: Joi.string().uuid().allow(null).default(null),
  });

  return schema.validate(payload, { abortEarly: false, stripUnknown: true });
};

export const validateUpdateStreamComment = (payload) => {
  const schema = Joi.object({
    content: Joi.string().allow("", null).max(5000).optional(),
    retain_attachment_ids: uuidArrayLikeSchema.optional(),
  });

  return schema.validate(payload, { abortEarly: false, stripUnknown: true });
};

export const validatePinStreamPost = (payload) => {
  const schema = Joi.object({
    is_pinned: booleanLikeSchema.required(),
  });

  return schema.validate(payload, { abortEarly: false, stripUnknown: true });
};

export const validateTogglePostComments = (payload) => {
  const schema = Joi.object({
    allow_comments: booleanLikeSchema.required(),
  });

  return schema.validate(payload, { abortEarly: false, stripUnknown: true });
};
