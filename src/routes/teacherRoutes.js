// src/routes/teacherRoutes.js
import express from "express";
// Gộp tất cả vào một dòng import duy nhất từ controller
import { 
  createEssayAssessment, 
  getAssignmentsByClass, 
  updateEssayAssessment, 
  getMyClasses,
  deleteAssessment,
  getSubmissionsByAssessment
} from "../controllers/teacherController.js";
import { getSubmissionForGrading, gradeSubmission } from '../controllers/teacherController.js';

import { isAuth, authorize } from "../middleware/isAuth.js";
import { USER_ROLES } from "../constants/roles.js";

const router = express.Router();

// 1. API lấy danh sách lớp của tôi
router.get("/my-classes", isAuth, authorize(USER_ROLES.TEACHER), getMyClasses);

// 2. API lấy danh sách bài tập của một lớp
router.get("/classes/:classId/assessments", isAuth, authorize(USER_ROLES.TEACHER), getAssignmentsByClass);

// 3. API tạo bài tập mới
router.post("/classes/:classId/assessments/essay", isAuth, authorize(USER_ROLES.TEACHER), createEssayAssessment);

// 4. API cập nhật bài tập
router.put("/classes/:classId/assessments/essay/:assessmentId", isAuth, authorize(USER_ROLES.TEACHER), updateEssayAssessment);

router.delete("/classes/:classId/assessments/:assessmentId", isAuth, authorize(USER_ROLES.TEACHER), deleteAssessment);

// Route lấy danh sách bài nộp của một bài tập cụ thể
router.get("/assessments/:assessmentId/submissions", isAuth, authorize(USER_ROLES.TEACHER), getSubmissionsByAssessment);

// Thêm 2 route này vào (Nhớ thêm middleware verifyToken/checkRole nếu có)
router.get('/submissions/:submissionId/grading', isAuth, authorize(USER_ROLES.TEACHER), getSubmissionForGrading);
router.post('/submissions/:submissionId/grade', isAuth, authorize(USER_ROLES.TEACHER), gradeSubmission);

export default router;