import { User } from "../models/User.js";
import { Role } from "../models/Role.js";
import { comparePassword } from "../utils/passwordUtils.js";
import { UnauthorizedError } from "../errors/AppError.js";
import { ERROR_MESSAGES } from "../constants/messages.js";
import { USER_ROLES } from "../constants/roles.js";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { sendEmail } from "./emailService.js";

const formatUserResponse = (user) => {
  return {
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    phone: user.phone,
    status: user.status,
    email_verified_at: user.email_verified_at,
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

const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

const generateOtp6 = () => {
  // Node >= 14 có crypto.randomInt
  const n = crypto.randomInt(0, 1000000);
  return String(n).padStart(6, "0");
};

const getOtpTtlMs = () => {
  const mins = Number(process.env.EMAIL_VERIFY_CODE_TTL_MINUTES || 10);
  return mins * 60 * 1000;
};

const sendVerifyCodeEmail = async ({ toEmail, fullName, code }) => {
  const subject = "Your verification code";
  const text = `Hi ${fullName || ""}\n\nYour verification code is: ${code}\nThis code expires in ${process.env.EMAIL_VERIFY_CODE_TTL_MINUTES || 10} minutes.`;
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6">
      <h2>Email Verification</h2>
      <p>Hi ${fullName || ""},</p>
      <p>Your verification code is:</p>
      <div style="font-size:28px;font-weight:700;letter-spacing:4px;margin:12px 0">${code}</div>
      <p style="color:#666;font-size:12px">
        This code expires in ${process.env.EMAIL_VERIFY_CODE_TTL_MINUTES || 10} minutes.
      </p>
    </div>
  `;

  await sendEmail({
    toEmail,
    toName: fullName,
    subject,
    text,
    html,
  });
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

  // Create user (status defaults to "active", but email_verified_at is null - controls verification)
  const user = await User.create({
    email: userData.email,
    password_hash: hashedPassword,
    full_name: userData.full_name,
    phone: userData.phone || null,
    role_id: studentRole.id,
  });

  // Return user without password
  // Generate OTP code and store hash + expiry on user
  const code = generateOtp6();
  user.email_verify_code_hash = sha256(code);
  user.email_verify_code_expires_at = new Date(Date.now() + getOtpTtlMs());
  user.email_verified_at = null;
  await user.save();

  // Send email (best-effort: nếu lỗi mail, vẫn cho đăng ký nhưng báo flag)
  let verification_email_sent = false;
  try {
    await sendVerifyCodeEmail({
      toEmail: user.email,
      fullName: user.full_name,
      code,
    });
    verification_email_sent = true;
  } catch (e) {
    console.warn("[Mailjet] Failed to send verify code:", e.message);
  }

  return { ...formatUserResponse(user), verification_email_sent };
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

  if (user.role?.code === "STUDENT" && !user.email_verified_at) {
    throw new UnauthorizedError(ERROR_MESSAGES.EMAIL_NOT_VERIFIED);
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

export const verifyEmailCode = async ({ email, code }) => {
  const user = await User.findOne({ where: { email } });
  if (!user) throw new UnauthorizedError(ERROR_MESSAGES.EMAIL_NOT_FOUND);

  if (user.email_verified_at) {
    throw new ConflictError(ERROR_MESSAGES.EMAIL_ALREADY_VERIFIED);
  }

  if (!user.email_verify_code_hash || !user.email_verify_code_expires_at) {
    throw new UnauthorizedError(ERROR_MESSAGES.INVALID_VERIFY_CODE);
  }

  if (new Date(user.email_verify_code_expires_at).getTime() < Date.now()) {
    throw new UnauthorizedError(ERROR_MESSAGES.INVALID_VERIFY_CODE);
  }

  const ok = sha256(code) === user.email_verify_code_hash;
  if (!ok) throw new UnauthorizedError(ERROR_MESSAGES.INVALID_VERIFY_CODE);

  user.email_verified_at = new Date();
  user.email_verify_code_hash = null;
  user.email_verify_code_expires_at = null;
  await user.save();

  return formatUserResponse(user);
};

export const resendVerifyCode = async ({ email }) => {
  const user = await User.findOne({ where: { email } });
  if (!user) throw new UnauthorizedError(ERROR_MESSAGES.EMAIL_NOT_FOUND);
  if (user.email_verified_at) {
    throw new ConflictError(ERROR_MESSAGES.EMAIL_ALREADY_VERIFIED);
  }

  const code = generateOtp6();
  user.email_verify_code_hash = sha256(code);
  user.email_verify_code_expires_at = new Date(Date.now() + getOtpTtlMs());
  await user.save();

  await sendVerifyCodeEmail({
    toEmail: user.email,
    fullName: user.full_name,
    code,
  });

  return { sent: true };
};
