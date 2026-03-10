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
