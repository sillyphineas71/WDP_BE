// src/routes/studentRoutes.js
import express from "express";
import {
    getDashboard,
    getMyClasses,
    getClassDetails,
    getAssignmentDetail,
    submitAssignment,
    startAttempt,
    getAttempt,
    saveAnswer,
    getSummary,
    submitAttempt
} from "../controllers/studentController.js";
import { isAuth, authorize } from "../middleware/isAuth.js";
import { USER_ROLES } from "../constants/roles.js";
import * as materialCtrl from "../controllers/studentMaterialController.js";

const router = express.Router();

// -----------------------------------------------------------------
// Dashboard / Classes (minh-branch style, using USER_ROLES constant)
// -----------------------------------------------------------------

// Student Dashboard View (UC_STU_06)
router.get("/dashboard", isAuth, authorize(USER_ROLES.STUDENT), getDashboard);

// My Classes View
router.get("/classes", isAuth, authorize(USER_ROLES.STUDENT), getMyClasses);

// Class Detail View (UC_STU_07)
router.get("/classes/:id", isAuth, authorize(USER_ROLES.STUDENT), getClassDetails);

// -----------------------------------------------------------------
// Assignment routes (minh-branch)
// -----------------------------------------------------------------

router.get("/assessments/:assessmentId", isAuth, authorize(USER_ROLES.STUDENT), getAssignmentDetail);
router.post("/assessments/:assessmentId/submit", isAuth, authorize(USER_ROLES.STUDENT), submitAssignment);

// -----------------------------------------------------------------
// Quiz Attempts (nam-branch / dev)
// -----------------------------------------------------------------

// UC_STU_09: Start or Resume quiz attempt
router.post(
    "/quizzes/:quizId/attempts/start",
    isAuth,
    authorize(USER_ROLES.STUDENT),
    startAttempt,
);

// Get specific attempt state
router.get(
    "/attempts/:submissionId",
    isAuth,
    authorize(USER_ROLES.STUDENT),
    getAttempt,
);

// Save specific answer in an attempt
router.put(
    "/attempts/:submissionId/questions/:questionId/answer",
    isAuth,
    authorize(USER_ROLES.STUDENT),
    saveAnswer,
);

// Get attempt summary (answered vs unanswered)
router.get(
    "/attempts/:submissionId/summary",
    isAuth,
    authorize(USER_ROLES.STUDENT),
    getSummary,
);

// Submit and finish the attempt
router.post(
    "/attempts/:submissionId/submit",
    isAuth,
    authorize(USER_ROLES.STUDENT),
    submitAttempt,
);

// -----------------------------------------------------------------
// UC_STU_08: Xem/Tải tài liệu
// -----------------------------------------------------------------

// Danh sách tài liệu của lớp (chỉ visible)
router.get("/classes/:classId/materials", isAuth, authorize(USER_ROLES.STUDENT), materialCtrl.getClassMaterials);

// Chi tiết tài liệu
router.get("/materials/:materialId", isAuth, authorize(USER_ROLES.STUDENT), materialCtrl.getMaterialDetail);

// Download / redirect URL
router.get("/materials/:materialId/download", isAuth, authorize(USER_ROLES.STUDENT), materialCtrl.downloadMaterial);

export default router;