import { User } from "../models/User.js";
import { Role } from "../models/Role.js";
import { hashPassword, comparePassword } from "../utils/passwordUtils.js";
import {
  ConflictError,
  NotFoundError,
  UnauthorizedError,
} from "../errors/AppError.js";
import { ERROR_MESSAGES } from "../constants/messages.js";
import { USER_ROLES } from "../constants/roles.js";
import jwt from "jsonwebtoken";

const formatUserResponse = (user) => {
  return {
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    phone: user.phone,
    status: user.status,
    created_at: user.created_at,
  };
};

const generateToken = (user, role) => {
  const payload = {
    id: user.id,
    email: user.email,
    role: role.code,
  };

  const token = jwt.sign(payload, process.env.JWT_SECRET || "your-secret-key", {
    expiresIn: process.env.JWT_EXPIRE || "7d",
  });

  return token;
};

export const registerStudent = async (userData) => {
  // Check if email already exists
  const existingUser = await User.findOne({
    where: { email: userData.email },
  });

  if (existingUser) {
    throw new ConflictError(ERROR_MESSAGES.EMAIL_ALREADY_EXISTS);
  }

  // Get student role
  const studentRole = await Role.findOne({
    where: { code: "STUDENT" },
  });

  if (!studentRole) {
    throw new NotFoundError(ERROR_MESSAGES.STUDENT_ROLE_NOT_FOUND);
  }

  // Hash password
  const hashedPassword = await hashPassword(userData.password);

  // Create user
  const user = await User.create({
    email: userData.email,
    password_hash: hashedPassword,
    full_name: userData.full_name,
    phone: userData.phone || null,
    role_id: studentRole.id,
  });

  // Return user without password
  return formatUserResponse(user);
};

export const loginUser = async (userData) => {
  // Find user by email
  const user = await User.findOne({
    where: { email: userData.email },
    include: [
      {
        model: Role,
        as: "role",
        attributes: ["id", "code", "name"],
      },
    ],
  });

  // Check if user exists
  if (!user) {
    throw new UnauthorizedError(ERROR_MESSAGES.EMAIL_NOT_FOUND);
  }

  // Check if user is blocked
  if (user.status === "blocked") {
    throw new UnauthorizedError(ERROR_MESSAGES.USER_BLOCKED);
  }

  // Compare password
  const passwordMatch = await comparePassword(
    userData.password,
    user.password_hash,
  );
  if (!passwordMatch) {
    throw new UnauthorizedError(ERROR_MESSAGES.INVALID_PASSWORD);
  }

  // Generate JWT token
  const token = generateToken(user, user.role);

  // Return token and user info
  return {
    token,
    user: formatUserResponse(user),
  };
};
