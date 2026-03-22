import express from "express";
import { login, logout, googleLogin, forgotPasswordController, resetPasswordController } from "../controllers/authController.js";
import { isAuth } from "../middleware/isAuth.js";

const router = express.Router();

/**
 * @route   POST /api/auth/login
 * @desc    Login user and return JWT token
 * @access  Public
 * @body    {
 *   email: string (required, valid email),
 *   password: string (required)
 * }
 * @return  {
 *   success: boolean,
 *   message: string,
 *   statusCode: number,
 *   data: {
 *     token: string,
 *     user: {
 *       id: string,
 *       email: string,
 *       full_name: string,
 *       phone: string,
 *       status: string,
 *       created_at: datetime
 *     }
 *   }
 * }
 */
router.post("/login", login);

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user
 * @access  Private
 */
router.post("/logout", isAuth, logout);

/**
 * @route   POST /api/auth/google
 * @desc    Login user with Google token
 * @access  Public
 */
router.post("/google", googleLogin);

/**
 * @route   POST /api/auth/forgot-password
 * @desc    Send OTP to email for password reset
 * @access  Public
 */
router.post("/forgot-password", forgotPasswordController);

/**
 * @route   POST /api/auth/reset-password
 * @desc    Verify OTP and update new password
 * @access  Public
 */
router.post("/reset-password", resetPasswordController);

export default router;
