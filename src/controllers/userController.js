import {
    getUserProfile,
    updateUserProfile,
    changeUserPassword,
} from "../services/userService.js";
import {
    validateUpdateProfile,
    validateChangePassword,
} from "../validators/userValidator.js";
import { SUCCESS_MESSAGES } from "../constants/messages.js";

export const getProfile = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const profile = await getUserProfile(userId);

        return res.status(200).json({
            success: true,
            statusCode: 200,
            data: profile,
        });
    } catch (error) {
        next(error);
    }
};

export const updateProfile = async (req, res, next) => {
    try {
        const userId = req.user.id;

        // Validate input
        const { error, value } = validateUpdateProfile(req.body);

        if (error) {
            const validationErrors = error.details.map((detail) => ({
                field: detail.path.join("."),
                message: detail.message,
            }));
            return res.status(400).json({
                success: false,
                message: "Validation failed",
                statusCode: 400,
                error: { validationErrors },
            });
        }

        // Update user profile
        const updatedProfile = await updateUserProfile(userId, value);

        return res.status(200).json({
            success: true,
            message: SUCCESS_MESSAGES.PROFILE_UPDATED,
            statusCode: 200,
            data: updatedProfile,
        });
    } catch (error) {
        next(error);
    }
};

export const changePassword = async (req, res, next) => {
    try {
        const userId = req.user.id;

        // Validate input
        const { error, value } = validateChangePassword(req.body);

        if (error) {
            const validationErrors = error.details.map((detail) => ({
                field: detail.path.join("."),
                message: detail.message,
            }));
            return res.status(400).json({
                success: false,
                message: "Validation failed",
                statusCode: 400,
                error: { validationErrors },
            });
        }

        // Change password
        await changeUserPassword(userId, value.old_password, value.new_password);

        return res.status(200).json({
            success: true,
            message: SUCCESS_MESSAGES.PASSWORD_CHANGED,
            statusCode: 200,
        });
    } catch (error) {
        next(error);
    }
};
