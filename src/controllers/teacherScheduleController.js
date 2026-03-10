// src/controllers/teacherScheduleController.js
import * as service from "../services/teacherScheduleService.js";

/**
 * GET /api/teacher/schedule?from=...&to=...&class_id=...
 * Lấy lịch giảng dạy của giảng viên đang đăng nhập.
 */
export const getTeacherSchedule = async (req, res, next) => {
  try {
    const teacherId = req.user.id;
    const data = await service.getTeacherSchedule(teacherId, req.query);
    res.status(200).json({ message: "OK", data });
  } catch (e) {
    next(e);
  }
};

/**
 * GET /api/teacher/schedule/classes
 * Lấy danh sách lớp của GV (dùng cho dropdown lọc lịch).
 */
export const getTeacherClasses = async (req, res, next) => {
  try {
    const teacherId = req.user.id;
    const data = await service.getTeacherClasses(teacherId);
    res.status(200).json({ message: "OK", data });
  } catch (e) {
    next(e);
  }
};

/**
 * GET /api/teacher/schedule/:sessionId
 * Lấy chi tiết một buổi học (danh sách SV, điểm danh, tài liệu).
 */
export const getSessionDetail = async (req, res, next) => {
  try {
    const teacherId = req.user.id;
    const { sessionId } = req.params;
    const data = await service.getSessionDetail(teacherId, sessionId);
    res.status(200).json({ message: "OK", data });
  } catch (e) {
    next(e);
  }
};
