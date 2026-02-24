import { User } from "../models/User.js";
import { Role } from "../models/Role.js";
import { hashPassword } from "../utils/passwordUtils.js";
import { ConflictError, NotFoundError } from "../errors/AppError.js";
import { ERROR_MESSAGES } from "../constants/messages.js";
import { USER_ROLES } from "../constants/roles.js";

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
