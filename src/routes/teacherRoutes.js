// src/routes/teacherRoutes.js
import express from "express";
import { isAuth, authorize } from "../middleware/isAuth.js";
import * as scheduleCtrl from "../controllers/teacherScheduleController.js";
import * as materialCtrl from "../controllers/materialController.js";
import { uploadSingleFile } from "../middleware/uploadMiddleware.js";

const router = express.Router();

// Tất cả route dưới đây yêu cầu đăng nhập + role TEACHER
router.use(isAuth, authorize("TEACHER"));

// ────────────── UC_TEA_06: Lịch dạy ──────────────

// Danh sách lớp của GV (cho dropdown lọc) — đặt trước /:sessionId để tránh xung đột
router.get("/schedule/classes", scheduleCtrl.getTeacherClasses);

// Lịch giảng dạy (Calendar)
router.get("/schedule", scheduleCtrl.getTeacherSchedule);

// Chi tiết buổi học
router.get("/schedule/:sessionId", scheduleCtrl.getSessionDetail);

// ────────────── UC_TEA_07: Quản lý học liệu ──────────────

// Lấy tất cả tài liệu của lớp (nhóm theo chung + buổi)
router.get("/classes/:classId/materials", materialCtrl.getClassMaterials);

// Lấy tài liệu theo buổi cụ thể
router.get(
  "/classes/:classId/materials/session/:sessionId",
  materialCtrl.getMaterialsBySession,
);

// Upload tài liệu (multipart/form-data cho file, hoặc JSON cho URL)
router.post(
  "/classes/:classId/materials",
  uploadSingleFile,
  materialCtrl.uploadMaterial,
);

// Chỉnh sửa tài liệu (đổi tên, mô tả, URL)
router.put("/materials/:materialId", materialCtrl.updateMaterial);

// Bật/tắt hiển thị tài liệu
router.patch("/materials/:materialId/visibility", materialCtrl.toggleVisibility);

// Xóa tài liệu
router.delete("/materials/:materialId", materialCtrl.deleteMaterial);

export default router;
