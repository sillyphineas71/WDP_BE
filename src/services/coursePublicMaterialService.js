import path from "path";
import { Course, CoursePublicMaterial, User } from "../models/index.js";
import {
  cloudinary,
  getCloudinaryResourceTypeForPublicMaterialType,
  getPublicIdFromUrl,
  getTypeFromFilename,
  normalizePublicMaterialUrl,
} from "../middleware/publicMaterialUploadMiddleware.js";

const ALLOWED_STATUSES = ["active", "archived"];
const ALLOWED_TYPES = [
  "pdf",
  "doc",
  "spreadsheet",
  "slide",
  "image",
  "video",
  "archive",
  "text",
  "other",
];

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

const normalizeCourseCode = (courseCode) => String(courseCode || "").trim().toUpperCase();

const validateAllowedStatus = (status) => {
  if (!ALLOWED_STATUSES.includes(status)) {
    throw httpError(
      `status chi duoc phep la: ${ALLOWED_STATUSES.join(", ")}.`,
      400,
      "VALIDATION_ERROR",
    );
  }
};

const validateAllowedType = (type) => {
  if (!ALLOWED_TYPES.includes(type)) {
    throw httpError(
      `type chi duoc phep la: ${ALLOWED_TYPES.join(", ")}.`,
      400,
      "VALIDATION_ERROR",
    );
  }
};

const parseOptionalBoolean = (value, field) => {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }

  throw httpError(`${field} phai la true hoac false.`, 400, "VALIDATION_ERROR");
};

const serializeMaterial = (material) => {
  const serialized = typeof material.toJSON === "function" ? material.toJSON() : material;
  return {
    ...serialized,
    file_url: normalizePublicMaterialUrl(serialized.file_url),
  };
};

const findCourseOrThrow = async (courseId) => {
  assertUUID(courseId, "courseId");

  const course = await Course.findByPk(courseId, {
    attributes: ["id", "code", "name", "description", "status", "created_at"],
  });

  if (!course) {
    throw httpError("Course khong ton tai.", 404, "NOT_FOUND");
  }

  return course;
};

const findMaterialOrThrow = async (materialId) => {
  assertUUID(materialId, "materialId");

  const material = await CoursePublicMaterial.findByPk(materialId, {
    include: [
      {
        model: Course,
        as: "course",
        attributes: ["id", "code", "name"],
      },
      {
        model: User,
        as: "uploader",
        attributes: ["id", "full_name", "email"],
      },
    ],
  });

  if (!material) {
    throw httpError("Tai lieu cong khai khong ton tai.", 404, "NOT_FOUND");
  }

  return material;
};

export const getAdminCoursePublicMaterials = async (courseId) => {
  const course = await findCourseOrThrow(courseId);

  const materials = await CoursePublicMaterial.findAll({
    where: { course_id: courseId },
    include: [
      {
        model: User,
        as: "uploader",
        attributes: ["id", "full_name", "email"],
      },
    ],
    order: [["created_at", "DESC"]],
  });

  return {
    course: course.toJSON(),
    materials: materials.map(serializeMaterial),
  };
};

export const createCoursePublicMaterial = async (adminId, courseId, body, file) => {
  assertUUID(adminId, "adminId");
  const course = await findCourseOrThrow(courseId);

  const status = body.status !== undefined ? String(body.status).trim().toLowerCase() : "active";
  validateAllowedStatus(status);

  const isVisible = body.is_visible !== undefined
    ? parseOptionalBoolean(body.is_visible, "is_visible")
    : true;

  if (!file) {
    throw httpError("File la bat buoc.", 400, "VALIDATION_ERROR");
  }

  const type = getTypeFromFilename(file.originalname);
  validateAllowedType(type);

  const fallbackTitle = path.parse(file.originalname).name;
  const title = body.title !== undefined && String(body.title).trim() !== ""
    ? String(body.title).trim()
    : fallbackTitle;

  const description = body.description !== undefined && String(body.description).trim() !== ""
    ? String(body.description).trim()
    : null;

  const material = await CoursePublicMaterial.create({
    course_id: course.id,
    uploaded_by: adminId,
    type,
    title,
    description,
    file_url: file.path,
    original_filename: file.originalname,
    file_size: file.size || null,
    is_visible: isVisible,
    status,
  });

  return serializeMaterial(material);
};

export const updateCoursePublicMaterial = async (adminId, materialId, body) => {
  assertUUID(adminId, "adminId");
  const material = await findMaterialOrThrow(materialId);

  const updateData = {};

  if (body.title !== undefined) {
    const title = String(body.title).trim();
    if (!title) {
      throw httpError("title khong duoc de trong.", 400, "VALIDATION_ERROR");
    }
    updateData.title = title;
  }

  if (body.description !== undefined) {
    const description = String(body.description || "").trim();
    updateData.description = description || null;
  }

  if (body.is_visible !== undefined) {
    updateData.is_visible = parseOptionalBoolean(body.is_visible, "is_visible");
  }

  if (body.status !== undefined) {
    const status = String(body.status).trim().toLowerCase();
    validateAllowedStatus(status);
    updateData.status = status;
  }

  if (Object.keys(updateData).length === 0) {
    throw httpError("Khong co thong tin nao can cap nhat.", 400, "VALIDATION_ERROR");
  }

  updateData.updated_at = new Date();
  await material.update(updateData);
  return serializeMaterial(material);
};

export const deleteCoursePublicMaterial = async (materialId) => {
  const material = await findMaterialOrThrow(materialId);

  if (material.file_url) {
    try {
      const publicId = getPublicIdFromUrl(material.file_url);
      if (publicId) {
        await cloudinary.uploader.destroy(publicId, {
          resource_type: getCloudinaryResourceTypeForPublicMaterialType(material.type),
        });
      }
    } catch (error) {
      console.warn(`Khong the xoa file tren Cloudinary: ${error.message}`);
    }
  }

  await material.destroy();

  return { message: "Xoa tai lieu cong khai thanh cong." };
};

export const toggleCoursePublicMaterialVisibility = async (materialId) => {
  const material = await findMaterialOrThrow(materialId);

  const is_visible = !material.is_visible;
  await material.update({
    is_visible,
    updated_at: new Date(),
  });

  return {
    id: material.id,
    is_visible,
    message: is_visible
      ? "Tai lieu da duoc hien thi."
      : "Tai lieu da duoc an.",
  };
};

export const searchPublicMaterialsByCourseCode = async (courseCode, userRole) => {
  const normalizedCode = normalizeCourseCode(courseCode);

  if (!normalizedCode) {
    throw httpError("course_code la bat buoc.", 400, "VALIDATION_ERROR");
  }

  void userRole;

  const course = await Course.findOne({
    where: { code: normalizedCode },
    attributes: ["id", "code", "name"],
  });

  if (!course) {
    throw httpError("Course khong ton tai.", 404, "NOT_FOUND");
  }

  const materials = await CoursePublicMaterial.findAll({
    where: {
      course_id: course.id,
      is_visible: true,
      status: "active",
    },
    include: [
      {
        model: User,
        as: "uploader",
        attributes: ["id", "full_name"],
      },
    ],
    order: [["created_at", "DESC"]],
  });

  return {
    course: course.toJSON(),
    materials: materials.map(serializeMaterial),
  };
};

export {
  assertUUID,
  httpError,
  normalizeCourseCode,
  validateAllowedStatus,
  validateAllowedType,
};
