// src/routes/studentRoutes.js
import express from "express";
import {
  getDashboard,
  getMyClasses,
  getClassDetails,
  getAssignmentDetail,
  submitAssignment
} from "../controllers/studentController.js";
import { isAuth, authorize } from "../middleware/isAuth.js";
import { USER_ROLES } from "../constants/roles.js";

const router = express.Router();

// --- ĐÃ THÊM isAuth và authorize CHO TẤT CẢ ---

// Student Dashboard View 
router.get("/dashboard", isAuth, authorize(USER_ROLES.STUDENT), getDashboard);

// My Classes View
router.get("/classes", isAuth, authorize(USER_ROLES.STUDENT), getMyClasses);

// Class Detail View 
router.get("/classes/:id", isAuth, authorize(USER_ROLES.STUDENT), getClassDetails);

// --- CÁC ROUTE BÀI TẬP ---

router.get("/assessments/:assessmentId", isAuth, authorize(USER_ROLES.STUDENT), getAssignmentDetail);
router.post("/assessments/:assessmentId/submit", isAuth, authorize(USER_ROLES.STUDENT), submitAssignment);

export default router;