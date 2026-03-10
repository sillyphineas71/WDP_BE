// src/controllers/materialController.js
import * as service from "../services/materialService.js";

/**
 * GET /api/teacher/classes/:classId/materials
 * Lấy tất cả tài liệu của lớp, nhóm theo "Chung" + từng buổi.
 */
export const getClassMaterials = async (req, res, next) => {
  try {
    const teacherId = req.user.id;
    const { classId } = req.params;
    const data = await service.getClassMaterials(teacherId, classId);
    res.status(200).json({ message: "OK", data });
  } catch (e) {
    next(e);
  }
};

/**
 * GET /api/teacher/classes/:classId/materials/session/:sessionId
 * Lấy tài liệu theo buổi học cụ thể.
 */
export const getMaterialsBySession = async (req, res, next) => {
  try {
    const teacherId = req.user.id;
    const { classId, sessionId } = req.params;
    const data = await service.getMaterialsBySession(teacherId, classId, sessionId);
    res.status(200).json({ message: "OK", data });
  } catch (e) {
    next(e);
  }
};

/**
 * POST /api/teacher/classes/:classId/materials
 * Upload tài liệu (file hoặc URL).
 * Sử dụng multipart/form-data nếu upload file.
 */
export const uploadMaterial = async (req, res, next) => {
  try {
    const teacherId = req.user.id;
    const { classId } = req.params;
    const data = await service.uploadMaterial(teacherId, classId, req.body, req.file);
    res.status(201).json({ message: "Tải lên tài liệu thành công.", data });
  } catch (e) {
    next(e);
  }
};

/**
 * PUT /api/teacher/materials/:materialId
 * Chỉnh sửa tài liệu (đổi tên, mô tả, URL).
 */
export const updateMaterial = async (req, res, next) => {
  try {
    const teacherId = req.user.id;
    const { materialId } = req.params;
    const data = await service.updateMaterial(teacherId, materialId, req.body);
    res.status(200).json({ message: "Cập nhật tài liệu thành công.", data });
  } catch (e) {
    next(e);
  }
};

/**
 * PATCH /api/teacher/materials/:materialId/visibility
 * Bật/tắt hiển thị tài liệu.
 */
export const toggleVisibility = async (req, res, next) => {
  try {
    const teacherId = req.user.id;
    const { materialId } = req.params;
    const data = await service.toggleVisibility(teacherId, materialId);
    res.status(200).json({ message: data.message, data });
  } catch (e) {
    next(e);
  }
};

/**
 * DELETE /api/teacher/materials/:materialId
 * Xóa tài liệu (file trên disk + record DB).
 */
export const deleteMaterial = async (req, res, next) => {
  try {
    const teacherId = req.user.id;
    const { materialId } = req.params;
    const data = await service.deleteMaterial(teacherId, materialId);
    res.status(200).json({ message: data.message });
  } catch (e) {
    next(e);
  }
};
