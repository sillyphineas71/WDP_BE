// src/routes/teacherRoutes.js
import express from "express";
import {
  getMyClasses,
  createQuiz,
  createAssignment,
  publishGrades,
  createEssayAssessment,
  getAssignmentsByClass,
  updateEssayAssessment,
  deleteAssessment,
  getSubmissionsByAssessment,
  getSubmissionForGrading,
  gradeSubmission,
  aiGradeSubmission
} from "../controllers/teacherController.js";
import { isAuth, authorize } from "../middleware/isAuth.js";
import { USER_ROLES } from "../constants/roles.js";
import * as scheduleCtrl from "../controllers/teacherScheduleController.js";
import * as materialCtrl from "../controllers/materialController.js";
import { uploadSingleFile } from "../middleware/uploadMiddleware.js";

const router = express.Router();

// -----------------------------------------------------------------
// Dev branch: Quiz & Assignment creation routes (nam-branch)
// -----------------------------------------------------------------

// UC_TEA_08: Teacher tạo quiz
router.post(
  "/classes/:classId/quizzes",
  isAuth,
  authorize(USER_ROLES.TEACHER),
  createQuiz,
);

// UC_TEA_10: Teacher tạo assignment (bài tập tự luận/nộp file)
router.post(
  "/classes/:classId/assignments",
  isAuth,
  authorize(USER_ROLES.TEACHER),
  createAssignment,
);

// UC_TEA_15: Công bố điểm (Publish grades)
router.put(
  "/classes/:classId/assessments/:assessmentId/grades/publish",
  isAuth,
  authorize(USER_ROLES.TEACHER),
  publishGrades,
);

// -----------------------------------------------------------------
// Minh-branch: Essay Assessment CRUD & Grading routes
// -----------------------------------------------------------------

// API lấy danh sách lớp của tôi (minh-branch)
router.get("/my-classes", isAuth, authorize(USER_ROLES.TEACHER), getMyClasses);

// Giữ thêm route cũ để không vỡ FE cũ nếu đang dùng
router.get("/classes", isAuth, authorize(USER_ROLES.TEACHER), getMyClasses);

// Thêm route /teacher/classes cho dev branch compatibility
router.get("/teacher/classes", isAuth, authorize(USER_ROLES.TEACHER), getMyClasses);

// API lấy danh sách bài tập của một lớp
router.get("/classes/:classId/assessments", isAuth, authorize(USER_ROLES.TEACHER), getAssignmentsByClass);

// API tạo bài tập essay (minh-branch)
router.post("/classes/:classId/assessments/essay", isAuth, authorize(USER_ROLES.TEACHER), createEssayAssessment);

// API cập nhật bài tập
router.put("/classes/:classId/assessments/essay/:assessmentId", isAuth, authorize(USER_ROLES.TEACHER), updateEssayAssessment);

// API xóa bài tập
router.delete("/classes/:classId/assessments/:assessmentId", isAuth, authorize(USER_ROLES.TEACHER), deleteAssessment);

// Route lấy danh sách bài nộp của một bài tập cụ thể
router.get("/assessments/:assessmentId/submissions", isAuth, authorize(USER_ROLES.TEACHER), getSubmissionsByAssessment);

// Grading routes
router.get('/submissions/:submissionId/grading', isAuth, authorize(USER_ROLES.TEACHER), getSubmissionForGrading);
router.post('/submissions/:submissionId/grade', isAuth, authorize(USER_ROLES.TEACHER), gradeSubmission);

// AI grading
router.post('/submissions/:submissionId/ai-grade', isAuth, authorize(USER_ROLES.TEACHER), aiGradeSubmission);

// -----------------------------------------------------------------
// Dev branch: Schedule & Material management
// -----------------------------------------------------------------

// Tất cả route dưới đây yêu cầu đăng nhập + role TEACHER
router.use(isAuth, authorize(USER_ROLES.TEACHER));

// ────────────── UC_TEA_06: Lịch dạy ──────────────

// Danh sách lớp của GV (cho dropdown lọc)
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