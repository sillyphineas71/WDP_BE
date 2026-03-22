import { loginUser, loginWithGoogle, forgotPassword, verifyOtpAndResetPassword } from "../services/authService.js";
import axios from "axios";
import { validateLogin } from "../validators/authValidator.js";
import { SUCCESS_MESSAGES } from "../constants/messages.js";

export const logout = async (req, res, next) => {
  try {
    // Optionally we could invalidate tokens in a redis blacklist here
    // but without one, we just tell the client to remove the token
    return res.status(200).json({
      success: true,
      message: SUCCESS_MESSAGES.LOGOUT_SUCCESS,
      statusCode: 200,
    });
  } catch (error) {
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    // Validate input
    const { error, value } = validateLogin(req.body);

    if (error) {
      const validationErrors = error.details.map((detail) => ({
        field: detail.path.join("."),
        message: detail.message,
      }));
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        statusCode: 400,
        error: {
          validationErrors,
        },
      });
    }

    // Login user
    const result = await loginUser(value);

    // Send success response
    return res.status(200).json({
      success: true,
      message: SUCCESS_MESSAGES.LOGIN_SUCCESS,
      statusCode: 200,
      data: {
        token: result.token,
        user: result.user,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const googleLogin = async (req, res, next) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ success: false, message: "Thiếu Google Token", statusCode: 400 });
    }
    
    // Verify token with Google
    const response = await axios.get(`https://www.googleapis.com/oauth2/v3/userinfo`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const { email } = response.data;
    
    if (!email) {
      return res.status(400).json({ success: false, message: "Không lấy được email từ Google", statusCode: 400 });
    }

    const result = await loginWithGoogle(email);

    return res.status(200).json({
      success: true,
      message: SUCCESS_MESSAGES.LOGIN_SUCCESS,
      statusCode: 200,
      data: {
        token: result.token,
        user: result.user,
      },
    });
  } catch (error) {
    if (error.response && (error.response.status === 400 || error.response.status === 401)) {
      return res.status(400).json({ success: false, message: "Google Token không hợp lệ", statusCode: 400 });
    }
    next(error);
  }
};

export const forgotPasswordController = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: "Email là bắt buộc" });

    const result = await forgotPassword(email);
    return res.status(200).json(result);
  } catch (error) {
    res.status(error.message.includes("không tồn tại") ? 404 : 400).json({
      success: false,
      message: error.message
    });
  }
};

export const resetPasswordController = async (req, res, next) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) {
      return res.status(400).json({ success: false, message: "Thiếu thông tin xác thực" });
    }

    const result = await verifyOtpAndResetPassword({ email, otp, newPassword });
    return res.status(200).json(result);
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};
