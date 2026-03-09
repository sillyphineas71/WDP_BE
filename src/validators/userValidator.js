import Joi from "joi";
import { VALIDATION_MESSAGES } from "../constants/messages.js";

export const updateProfileSchema = Joi.object({
    full_name: Joi.string().min(2).optional().messages({
        "string.min": VALIDATION_MESSAGES.FULL_NAME_MIN_LENGTH,
    }),
    phone: Joi.string()
        .pattern(/^[0-9]{10,11}$/)
        .optional()
        .messages({
            "string.pattern.base": VALIDATION_MESSAGES.PHONE_INVALID,
        }),
    avatar_url: Joi.string().uri().optional(),
    bio: Joi.string().max(500).optional(),
});

export const changePasswordSchema = Joi.object({
    old_password: Joi.string().required().messages({
        "any.required": "Old password is required",
    }),
    new_password: Joi.string().min(6).required().messages({
        "string.min": VALIDATION_MESSAGES.PASSWORD_MIN_LENGTH,
        "any.required": "New password is required",
    }),
});

export const validateUpdateProfile = (data) => {
    return updateProfileSchema.validate(data, { abortEarly: false });
};

export const validateChangePassword = (data) => {
    return changePasswordSchema.validate(data, { abortEarly: false });
};
