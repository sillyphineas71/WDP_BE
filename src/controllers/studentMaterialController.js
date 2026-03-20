// src/controllers/studentMaterialController.js
import * as service from "../services/studentMaterialService.js";

/**
 * GET /api/student/classes/:classId/materials
 * Danh sách tài liệu visible nhóm theo "Chung" + buổi.
 */
export const getClassMaterials = async (req, res, next) => {
  try {
    const studentId = req.user.id;
    const { classId } = req.params;
    const data = await service.getClassMaterials(studentId, classId);
    res.status(200).json({ message: "OK", data });
  } catch (e) {
    next(e);
  }
};

/**
 * GET /api/student/materials/:materialId
 * Chi tiết 1 tài liệu.
 */
export const getMaterialDetail = async (req, res, next) => {
  try {
    const studentId = req.user.id;
    const { materialId } = req.params;
    const data = await service.getMaterialDetail(studentId, materialId);
    res.status(200).json({ message: "OK", data });
  } catch (e) {
    next(e);
  }
};

/**
 * GET /api/student/materials/:materialId/download
 * Trả URL để FE download hoặc mở.
 */
export const downloadMaterial = async (req, res, next) => {
  try {
    const studentId = req.user.id;
    const { materialId } = req.params;
    const result = await service.downloadMaterial(studentId, materialId);
    return res.status(200).json({ message: "OK", data: result });
  } catch (e) {
    next(e);
  }
};
