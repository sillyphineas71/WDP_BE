// src/services/materialService.js
import { Op } from "sequelize";
import fs from "fs";
import path from "path";
import {
  Material,
  Class,
  Course,
  ClassSession,
} from "../models/index.js";
import { getTypeFromFilename } from "../middleware/uploadMiddleware.js";

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
 * Verify giảng viên có quyền thao tác trên lớp này.
 * - Class phải tồn tại
 * - Class.teacher_id === teacherId
 * - Class.status === "active"
 */
const verifyTeacherOwnsClass = async (teacherId, classId) => {
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
  if (cls.status !== "active") {
    throw httpError(
      "Lớp học không ở trạng thái hoạt động. Không thể thao tác tài liệu.",
      400,
      "CLASS_NOT_ACTIVE",
    );
  }

  return cls;
};

/**
 * Verify giảng viên có quyền thao tác trên tài liệu này.
 * Kiểm tra Material tồn tại + thuộc lớp mà GV phụ trách.
 */
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

/**
 * Kiểm tra URL hợp lệ cơ bản.
 */
const isValidUrl = (str) => {
  try {
    const url = new URL(str);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

// ────────────────────────────────────────────
// 1. GET CLASS MATERIALS (nhóm theo chung + buổi)
// ────────────────────────────────────────────

/**
 * Lấy tất cả tài liệu của lớp, nhóm theo:
 * - "general": tài liệu chung (session_id IS NULL)
 * - "by_session": nhóm theo từng buổi
 *
 * @param {string} teacherId
 * @param {string} classId
 */
export const getClassMaterials = async (teacherId, classId) => {
  await verifyTeacherOwnsClass(teacherId, classId);

  // Lấy tất cả materials của class
  const materials = await Material.findAll({
    where: { class_id: classId },
    attributes: [
      "id", "class_id", "session_id", "uploaded_by", "type",
      "title", "description", "file_url", "original_filename",
      "file_size", "is_visible", "created_at", "updated_at",
    ],
    order: [["created_at", "ASC"]],
  });

  // Lấy tất cả sessions của class để đặt vào cấu trúc cây
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

  // Build by_session array (bao gồm cả buổi chưa có tài liệu)
  const bySession = sessions.map((s, idx) => ({
    session: {
      id: s.id,
      index: idx + 1, // "Buổi 1, 2, 3..."
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
// 2. GET MATERIALS BY SESSION
// ────────────────────────────────────────────

/**
 * Lấy tài liệu theo buổi học cụ thể.
 */
export const getMaterialsBySession = async (teacherId, classId, sessionId) => {
  await verifyTeacherOwnsClass(teacherId, classId);
  assertUUID(sessionId, "sessionId");

  // Verify session thuộc class
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
      "id", "type", "title", "description", "file_url",
      "original_filename", "file_size", "is_visible", "created_at", "updated_at",
    ],
    order: [["created_at", "ASC"]],
  });

  return { session: session.toJSON(), materials };
};

// ────────────────────────────────────────────
// 3. UPLOAD MATERIAL
// ────────────────────────────────────────────

/**
 * Upload tài liệu (file hoặc link URL).
 *
 * @param {string} teacherId
 * @param {string} classId
 * @param {object} body  - { title, description?, session_id?, url? }
 * @param {object|null} file - multer file object (nếu upload file)
 */
export const uploadMaterial = async (teacherId, classId, body, file) => {
  await verifyTeacherOwnsClass(teacherId, classId);

  const { title, description, session_id, url } = body;

  // Validate title
  if (!title || String(title).trim() === "") {
    throw httpError("Tên tài liệu (title) là bắt buộc.", 400, "VALIDATION_ERROR");
  }

  // Phải có file HOẶC url
  if (!file && !url) {
    throw httpError(
      "Vui lòng chọn file để tải lên hoặc nhập URL đường dẫn.",
      400,
      "VALIDATION_ERROR",
    );
  }

  // Không được gửi cả 2
  if (file && url) {
    throw httpError(
      "Chỉ được chọn 1 trong 2: tải file hoặc nhập URL, không cả hai.",
      400,
      "VALIDATION_ERROR",
    );
  }

  // Validate session_id nếu có → phải thuộc class
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
    // ── Upload file ──
    const materialType = getTypeFromFilename(file.originalname);

    materialData = {
      class_id: classId,
      session_id: session_id || null,
      uploaded_by: teacherId,
      type: materialType,
      title: String(title).trim(),
      description: description ? String(description).trim() : null,
      file_url: `/${file.path.replace(/\\/g, "/")}`, // normalize path separator
      original_filename: file.originalname,
      file_size: file.size,
      is_visible: true,
    };
  } else {
    // ── Link URL ──
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

  const material = await Material.create(materialData);
  return material;
};

// ────────────────────────────────────────────
// 4. UPDATE MATERIAL (đổi tên, mô tả, URL)
// ────────────────────────────────────────────

/**
 * Chỉnh sửa tài liệu: đổi title, description, hoặc cập nhật URL (nếu type=link).
 */
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

  // Chỉ cho phép cập nhật URL nếu type là "link"
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

  // Cho phép di chuyển tài liệu sang buổi khác hoặc về "chung"
  if (body.session_id !== undefined) {
    if (body.session_id === null || body.session_id === "") {
      // Di chuyển về "Tài liệu chung"
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

// ────────────────────────────────────────────
// 5. TOGGLE VISIBILITY (Ẩn/Hiện)
// ────────────────────────────────────────────

/**
 * Bật/tắt hiển thị tài liệu (A1).
 */
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

// ────────────────────────────────────────────
// 6. DELETE MATERIAL
// ────────────────────────────────────────────

/**
 * Xóa tài liệu: xóa file vật lý (nếu type !== link) + xóa record DB (A3).
 */
export const deleteMaterial = async (teacherId, materialId) => {
  const material = await verifyTeacherOwnsMaterial(teacherId, materialId);

  // Xóa file vật lý nếu đây là file upload (không phải link)
  if (material.type !== "link" && material.file_url) {
    try {
      // file_url dạng "/uploads/materials/xxx.pdf" → cần bỏ "/" đầu
      const filePath = path.resolve(material.file_url.replace(/^\//, ""));
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (fsErr) {
      // Nếu file không tồn tại hoặc lỗi fs → vẫn tiếp tục xóa DB record
      console.warn(`Cảnh báo: Không thể xóa file vật lý: ${fsErr.message}`);
    }
  }

  await material.destroy();

  return { message: "Tài liệu đã được xóa thành công." };
};
