import { registerStudent } from "../services/authService.js";
import { validateRegister } from "../validators/authValidator.js";
import { SUCCESS_MESSAGES } from "../constants/messages.js";

export const register = async (req, res, next) => {
  try {
    // Validate input
    const { error, value } = validateRegister(req.body);

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

    // Register student
    const user = await registerStudent(value);

    // Send success response
    return res.status(201).json({
      success: true,
      message: SUCCESS_MESSAGES.REGISTRATION_SUCCESS,
      statusCode: 201,
      data: user,
    });
  } catch (error) {
    next(error);
  }
};
