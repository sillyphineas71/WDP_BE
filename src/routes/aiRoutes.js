import express from "express";
import { chatWithClassAI } from "../controllers/aiController.js";
import { isAuth, authorize } from "../middleware/isAuth.js";
import { USER_ROLES } from "../constants/roles.js";

const router = express.Router();

// @route   POST /api/ai/class-chat/:classId
// @desc    Chat with AI Assistant using class context
// @access  Protected (Student only)
router.post("/class-chat/:classId", isAuth, authorize(USER_ROLES.STUDENT), chatWithClassAI);

export default router;
