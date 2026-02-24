import Joi from "joi";
import { VALIDATION_MESSAGES } from "../constants/messages.js";

export const registerSchema = Joi.object({
  email: Joi.string().email().required().messages({
    "string.email": VALIDATION_MESSAGES.EMAIL_INVALID,
    "any.required": VALIDATION_MESSAGES.EMAIL_REQUIRED,
  }),
  password: Joi.string().min(6).required().messages({
    "string.min": VALIDATION_MESSAGES.PASSWORD_MIN_LENGTH,
    "any.required": VALIDATION_MESSAGES.PASSWORD_REQUIRED,
  }),
  full_name: Joi.string().min(2).required().messages({
    "string.min": VALIDATION_MESSAGES.FULL_NAME_MIN_LENGTH,
    "any.required": VALIDATION_MESSAGES.FULL_NAME_REQUIRED,
  }),
  phone: Joi.string()
    .pattern(/^[0-9]{10,11}$/)
    .optional()
    .messages({
      "string.pattern.base": VALIDATION_MESSAGES.PHONE_INVALID,
    }),
});

export const validateRegister = (data) => {
  return registerSchema.validate(data, { abortEarly: false });
};
