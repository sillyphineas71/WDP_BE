import express from "express";
import {
    getProfile,
    updateProfile,
    changePassword,
} from "../controllers/userController.js";
import { isAuth } from "../middleware/isAuth.js";

const router = express.Router();

// All user routes require authentication
router.use(isAuth);

/**
 * @route   GET /api/users/profile
 * @desc    Get current user's profile
 * @access  Private
 */
router.get("/profile", getProfile);

/**
 * @route   PUT /api/users/profile
 * @desc    Update user's profile
 * @access  Private
 */
router.put("/profile", updateProfile);

/**
 * @route   PUT /api/users/password
 * @desc    Change user password
 * @access  Private
 */
router.put("/password", changePassword);

export default router;
