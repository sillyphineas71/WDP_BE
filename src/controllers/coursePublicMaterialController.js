import * as service from "../services/coursePublicMaterialService.js";

export const getAdminCoursePublicMaterials = async (req, res, next) => {
  try {
    const { courseId } = req.params;
    const data = await service.getAdminCoursePublicMaterials(courseId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

export const createCoursePublicMaterial = async (req, res, next) => {
  try {
    const adminId = req.user.id;
    const { courseId } = req.params;
    const data = await service.createCoursePublicMaterial(adminId, courseId, req.body, req.file);
    res.status(201).json({
      success: true,
      message: "Tao tai lieu cong khai thanh cong.",
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const updateCoursePublicMaterial = async (req, res, next) => {
  try {
    const adminId = req.user.id;
    const { materialId } = req.params;
    const data = await service.updateCoursePublicMaterial(adminId, materialId, req.body);
    res.status(200).json({
      success: true,
      message: "Cap nhat tai lieu cong khai thanh cong.",
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteCoursePublicMaterial = async (req, res, next) => {
  try {
    const { materialId } = req.params;
    const data = await service.deleteCoursePublicMaterial(materialId);
    res.status(200).json({
      success: true,
      message: data.message,
    });
  } catch (error) {
    next(error);
  }
};

export const toggleCoursePublicMaterialVisibility = async (req, res, next) => {
  try {
    const { materialId } = req.params;
    const data = await service.toggleCoursePublicMaterialVisibility(materialId);
    res.status(200).json({
      success: true,
      message: data.message,
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const searchPublicMaterialsByCourseCode = async (req, res, next) => {
  try {
    const data = await service.searchPublicMaterialsByCourseCode(
      req.query.course_code,
      req.user.role,
    );
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};
