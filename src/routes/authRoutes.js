import express from "express";
import { login, logout } from "../controllers/authController.js";
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

export default router;
