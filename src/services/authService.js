// src/services/authService.js
import { User } from "../models/User.js";
import { Role } from "../models/Role.js";
import { comparePassword, hashPassword } from "../utils/passwordUtils.js";
import { UnauthorizedError } from "../errors/AppError.js";
import { ERROR_MESSAGES } from "../constants/messages.js";
import { USER_ROLES } from "../constants/roles.js";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { PasswordResetToken } from "../models/PasswordResetToken.js";
import { sendEmail } from "./emailService.js";


const formatUserResponse = (user) => {
  return {
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    phone: user.phone,
    role: user.role?.code?.toLowerCase(),
    status: user.status,
    must_change_password: user.must_change_password,
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

  // Return token and user info (ĐÃ FIX: Bơm thêm role vào đây)
  return {
    token,
    user: {
      ...formatUserResponse(user),
      role: user.role.code,
    },
  };
};

export const loginWithGoogle = async (email) => {
  const user = await User.findOne({
    where: { email },
    include: [
      {
        model: Role,
        as: "role",
        attributes: ["id", "code", "name"],
      },
    ],
  });

  if (!user) {
    throw new UnauthorizedError("Tài khoản chưa được đăng ký trong hệ thống.");
  }

  if (user.status === "blocked") {
    throw new UnauthorizedError(ERROR_MESSAGES.USER_BLOCKED);
  }

  const token = generateToken(user, user.role);

  return {
    token,
    user: {
      ...formatUserResponse(user),
      role: user.role.code,
      must_change_password: false,
    },
  };
};

export const forgotPassword = async (email) => {
  const user = await User.findOne({ where: { email } });
  if (!user) {
    throw new Error("Tài khoản không tồn tại trong hệ thống");
  }

  // Tạo mã OTP 6 số
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // Hết hạn sau 10 phút

  // Mã hóa OTP lưu DB
  const otpHash = await hashPassword(otp);

  await PasswordResetToken.create({
    user_id: user.id,
    token_hash: otpHash,
    expires_at: expiresAt,
  });

  // Gửi Mail
  await sendEmail({
    to: email,
    subject: "[SmartEdu] Mã OTP Khôi Phục Mật Khẩu",
    html: `<p>Mã OTP khôi phục mật khẩu của bạn là: <b style="font-size: 18px; color: #2563eb;">${otp}</b></p><p>Mã này có hiệu lực trong 10 phút.</p>`,
    text: `Mã OTP khôi phục mật khẩu của bạn là: ${otp}. Mã này có hiệu lực trong 10 phút.`,
  });

  return { success: true, message: "Mã OTP đã được gửi về Email của bạn." };
};

export const verifyOtpAndResetPassword = async ({ email, otp, newPassword }) => {
  const user = await User.findOne({ where: { email } });
  if (!user) {
    throw new Error("Thao tác không hợp lệ.");
  }

  const tokenRecord = await PasswordResetToken.findOne({
    where: { user_id: user.id, used_at: null },
    order: [["created_at", "DESC"]],
  });

  if (!tokenRecord) {
    throw new Error("Mã OTP không tồn tại hoặc đã sử dụng.");
  }

  if (new Date() > new Date(tokenRecord.expires_at)) {
    throw new Error("Mã OTP đã hết hạn.");
  }

  const isMatch = await comparePassword(otp, tokenRecord.token_hash);
  if (!isMatch) {
    throw new Error("Mã OTP không chính xác.");
  }

  // Cập nhật mật khẩu mới
  const passwordHash = await hashPassword(newPassword);
  await user.update({ password_hash: passwordHash });

  // Đánh dấu mã đã dùng
  await tokenRecord.update({ used_at: new Date() });

  return { success: true, message: "Đặt lại mật khẩu thành công." };
};