import express from "express";
import { studentController } from "../controllers/studentController.js";
import { isAuth, authorize } from "../middleware/isAuth.js";

const router = express.Router();

// UC_STU_09
router.post(
    "/quizzes/:quizId/attempts/start",
    isAuth,
    authorize("STUDENT"),
    studentController.startAttempt,
);

router.get(
    "/attempts/:submissionId",
    isAuth,
    authorize("STUDENT"),
    studentController.getAttempt,
);

router.put(
    "/attempts/:submissionId/questions/:questionId/answer",
    isAuth,
    authorize("STUDENT"),
    studentController.saveAnswer,
);

router.get(
    "/attempts/:submissionId/summary",
    isAuth,
    authorize("STUDENT"),
    studentController.getSummary,
);

router.post(
    "/attempts/:submissionId/submit",
    isAuth,
    authorize("STUDENT"),
    studentController.submitAttempt,
);

export default router;