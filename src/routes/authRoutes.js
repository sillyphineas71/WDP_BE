import express from "express";
import { register } from "../controllers/authController.js";

const router = express.Router();

/**
 * @route   POST /api/auth/register
 * @desc    Register a new student account
 * @access  Public
 * @body    {
 *   email: string (required, unique, valid email),
 *   password: string (required, min 6 chars),
 *   full_name: string (required, min 2 chars),
 *   phone: string (optional, 10-11 digits)
 * }
 * @return  {
 *   success: boolean,
 *   message: string,
 *   statusCode: number,
 *   data: {
 *     id: string,
 *     email: string,
 *     full_name: string,
 *     phone: string,
 *     status: string,
 *     created_at: datetime
 *   }
 * }
 */
router.post("/register", register);

export default router;
