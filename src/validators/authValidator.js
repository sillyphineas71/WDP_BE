import Joi from "joi";
import { VALIDATION_MESSAGES } from "../constants/messages.js";



export const loginSchema = Joi.object({
  email: Joi.string().email().required().messages({
    "string.email": VALIDATION_MESSAGES.EMAIL_INVALID,
    "any.required": VALIDATION_MESSAGES.EMAIL_REQUIRED,
  }),
  password: Joi.string().required().messages({
    "any.required": VALIDATION_MESSAGES.PASSWORD_REQUIRED,
  }),
});



export const validateLogin = (data) => {
  return loginSchema.validate(data, { abortEarly: false });
};

export const verifyEmailSchema = Joi.object({
  email: Joi.string().email().required().messages({
    "string.email": VALIDATION_MESSAGES.EMAIL_INVALID,
    "any.required": VALIDATION_MESSAGES.EMAIL_REQUIRED,
  }),
  code: Joi.string()
    .pattern(/^[0-9]{6}$/)
    .required()
    .messages({
      "string.pattern.base": "Code must be 6 digits",
      "any.required": "Code is required",
    }),
});

export const resendVerifySchema = Joi.object({
  email: Joi.string().email().required().messages({
    "string.email": VALIDATION_MESSAGES.EMAIL_INVALID,
    "any.required": VALIDATION_MESSAGES.EMAIL_REQUIRED,
  }),
});

export const validateVerifyEmail = (data) =>
  verifyEmailSchema.validate(data, { abortEarly: false });

export const validateResendVerify = (data) =>
  resendVerifySchema.validate(data, { abortEarly: false });
