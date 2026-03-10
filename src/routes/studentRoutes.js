import express from "express";
import { studentController } from "../controllers/studentController.js";
import { isAuth, authorize } from "../middleware/isAuth.js";

const router = express.Router();

// -----------------------------------------------------------------
// HEAD functionalities (Dashboard / Classes)
// Applied standard authentication middlewares mapping to the branch design
// -----------------------------------------------------------------

// Student Dashboard View (UC_STU_06)
router.get("/dashboard", isAuth, authorize("STUDENT"), studentController.getDashboard);

// My Classes View
router.get("/classes", isAuth, authorize("STUDENT"), studentController.getMyClasses);

// Class Detail View (UC_STU_07)
router.get("/classes/:id", isAuth, authorize("STUDENT"), studentController.getClassDetails);


// -----------------------------------------------------------------
// nam-branch functionalities (Quiz Attempts)
// -----------------------------------------------------------------

// UC_STU_09: Start or Resume quiz attempt
router.post(
    "/quizzes/:quizId/attempts/start",
    isAuth,
    authorize("STUDENT"),
    studentController.startAttempt,
);

// Get specific attempt state
router.get(
    "/attempts/:submissionId",
    isAuth,
    authorize("STUDENT"),
    studentController.getAttempt,
);

// Save specific answer in an attempt
router.put(
    "/attempts/:submissionId/questions/:questionId/answer",
    isAuth,
    authorize("STUDENT"),
    studentController.saveAnswer,
);

// Get attempt summary (answered vs unanswered)
router.get(
    "/attempts/:submissionId/summary",
    isAuth,
    authorize("STUDENT"),
    studentController.getSummary,
);

// Submit and finish the attempt
router.post(
    "/attempts/:submissionId/submit",
    isAuth,
    authorize("STUDENT"),
    studentController.submitAttempt,
);

export default router;
