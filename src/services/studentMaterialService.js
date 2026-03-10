// src/services/studentMaterialService.js
import { Op } from "sequelize";
import {
  Material,
  Class,
  ClassSession,
  Enrollment,
} from "../models/index.js";

// ────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────

const httpError = (message, statusCode, code, details) => {
  const err = new Error(message);
  err.statusCode = statusCode;
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

/**
 * Verify sinh viên đang enrolled (active) trong lớp.
 */
const verifyStudentEnrolled = async (studentId, classId) => {
  assertUUID(classId, "classId");

  const enrollment = await Enrollment.findOne({
    where: { user_id: studentId, class_id: classId, status: "active" },
  });

  if (!enrollment) {
    throw httpError(
      "Bạn không thuộc lớp học này hoặc đã bị hủy đăng ký.",
      403,
      "FORBIDDEN",
    );
  }

  return enrollment;
};

/**
 * Verify tài liệu tồn tại, visible, và SV enrolled trong lớp chứa tài liệu.
 */
const verifyStudentCanAccessMaterial = async (studentId, materialId) => {
  assertUUID(materialId, "materialId");

  const material = await Material.findByPk(materialId, {
    include: [
      {
        model: Class,
        as: "class",
        attributes: ["id", "name"],
      },
    ],
  });

  // E1: Tài liệu không tồn tại
  if (!material) {
    throw httpError(
      "Tài liệu này không tồn tại hoặc đã bị Giảng viên gỡ bỏ. Vui lòng tải lại trang.",
      404,
      "NOT_FOUND",
    );
  }

  // Tài liệu bị ẩn bởi GV
  if (!material.is_visible) {
    throw httpError(
      "Tài liệu này không tồn tại hoặc đã bị Giảng viên gỡ bỏ. Vui lòng tải lại trang.",
      404,
      "NOT_FOUND",
    );
  }

  // Verify SV enrolled
  await verifyStudentEnrolled(studentId, material.class_id);

  return material;
};

// ────────────────────────────────────────────
// 1. GET CLASS MATERIALS (visible only)
// ────────────────────────────────────────────

/**
 * Lấy danh sách tài liệu visible của lớp, nhóm theo "Chung" + buổi.
 * Chỉ trả tài liệu có is_visible = true.
 */
export const getClassMaterials = async (studentId, classId) => {
  await verifyStudentEnrolled(studentId, classId);

  // Chỉ lấy materials visible
  const materials = await Material.findAll({
    where: { class_id: classId, is_visible: true },
    attributes: [
      "id", "session_id", "type", "title", "description",
      "file_url", "original_filename", "file_size", "created_at",
    ],
    order: [["created_at", "ASC"]],
  });

  // Lấy sessions để build cấu trúc cây
  const sessions = await ClassSession.findAll({
    where: { class_id: classId },
    attributes: ["id", "start_time", "end_time", "topic", "status"],
    order: [["start_time", "ASC"]],
  });

  // Phân loại
  const general = [];
  const sessionMaterialsMap = new Map();

  for (const m of materials) {
    const plain = m.toJSON();
    if (!m.session_id) {
      general.push(plain);
    } else {
      if (!sessionMaterialsMap.has(m.session_id)) {
        sessionMaterialsMap.set(m.session_id, []);
      }
      sessionMaterialsMap.get(m.session_id).push(plain);
    }
  }

  // Build by_session (chỉ hiện buổi có tài liệu hoặc tất cả buổi)
  const bySession = sessions.map((s, idx) => ({
    session: {
      id: s.id,
      index: idx + 1,
      start_time: s.start_time,
      end_time: s.end_time,
      topic: s.topic,
      status: s.status,
    },
    materials: sessionMaterialsMap.get(s.id) || [],
  }));

  return { general, by_session: bySession };
};

// ────────────────────────────────────────────
// 2. GET MATERIAL DETAIL
// ────────────────────────────────────────────

/**
 * Lấy chi tiết 1 tài liệu. Verify enrolled + visible.
 */
export const getMaterialDetail = async (studentId, materialId) => {
  const material = await verifyStudentCanAccessMaterial(studentId, materialId);

  return {
    id: material.id,
    class_id: material.class_id,
    session_id: material.session_id,
    type: material.type,
    title: material.title,
    description: material.description,
    file_url: material.file_url,
    original_filename: material.original_filename,
    file_size: material.file_size,
    created_at: material.created_at,
    class: material.class
      ? { id: material.class.id, name: material.class.name }
      : null,
  };
};

// ────────────────────────────────────────────
// 3. DOWNLOAD MATERIAL
// ────────────────────────────────────────────

/**
 * Trả URL để FE download/mở. File lưu trên Cloudinary → trả URL trực tiếp.
 */
export const downloadMaterial = async (studentId, materialId) => {
  const material = await verifyStudentCanAccessMaterial(studentId, materialId);

  // Cả file lẫn link đều trả URL → FE mở tab mới hoặc tải về
  return {
    url: material.file_url,
    original_filename: material.original_filename || null,
    type: material.type,
  };
};
