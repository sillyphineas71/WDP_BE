import express from "express";
import {
  getDashboard,
  getMyClasses,
  getClassDetails,
} from "../controllers/studentController.js";

const router = express.Router();

// Student Dashboard View (UC_STU_06)
router.get("/dashboard", getDashboard);

// My Classes View
router.get("/classes", getMyClasses);

// Class Detail View (UC_STU_07)
router.get("/classes/:id", getClassDetails);

export default router;
