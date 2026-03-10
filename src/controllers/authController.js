import { loginUser } from "../services/authService.js";
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
