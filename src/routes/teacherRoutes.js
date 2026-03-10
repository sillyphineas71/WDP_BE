import express from "express";
import { teacherController } from "../controllers/teacherController.js";
import { isAuth, authorize } from "../middleware/isAuth.js";
import * as scheduleCtrl from "../controllers/teacherScheduleController.js";
import * as materialCtrl from "../controllers/materialController.js";
import { uploadSingleFile } from "../middleware/uploadMiddleware.js";

const router = express.Router();

// UC_TEA_08: Teacher tạo quiz
router.post(
  "/classes/:classId/quizzes",
  isAuth,
  authorize("TEACHER"),
  teacherController.createQuiz,
);

// UC_TEA_10: Teacher tạo assignment (bài tập tự luận/nộp file)
router.post(
  "/classes/:classId/assignments",
  isAuth,
  authorize("TEACHER"),
  teacherController.createAssignment,
);

// Lấy danh sách lớp của giáo viên
router.get(
  "/teacher/classes",
  isAuth,
  authorize("TEACHER"),
  teacherController.getMyClasses,
);

// Giữ thêm route cũ để không mất code / không vỡ FE cũ nếu đang dùng
router.get(
  "/classes",
  isAuth,
  authorize("TEACHER"),
  teacherController.getMyClasses,
);

// UC_TEA_15: Công bố điểm (Publish grades)
router.put(
  "/classes/:classId/assessments/:assessmentId/grades/publish",
  isAuth,
  authorize("TEACHER"),
  teacherController.publishGrades,
);

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