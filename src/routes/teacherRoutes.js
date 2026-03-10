import express from "express";
import { teacherController } from "../controllers/teacherController.js";
import { isAuth, authorize } from "../middleware/isAuth.js";

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

router.get(
    "/classes",
    // authorize("TEACHER"),
    isAuth,
    authorize("TEACHER"),
    teacherController.getMyClasses
);

// UC_TEA_15: Công bố điểm (Publish grades)
router.put(
    "/classes/:classId/assessments/:assessmentId/grades/publish",
    isAuth,
    authorize("TEACHER"),
    teacherController.publishGrades
);

export default router;