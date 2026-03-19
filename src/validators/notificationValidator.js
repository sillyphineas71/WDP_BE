import Joi from "joi";

export const validateRegisterDeviceToken = (payload) => {
  const schema = Joi.object({
    token: Joi.string().trim().required(),
    platform: Joi.string().trim().valid("web", "android", "ios").default("web"),
  });

  return schema.validate(payload, { abortEarly: false });
};

export const validateRemoveDeviceToken = (payload) => {
  const schema = Joi.object({
    token: Joi.string().trim().required(),
  });

  return schema.validate(payload, { abortEarly: false });
};

export const validateTestEmail = (payload) => {
  const schema = Joi.object({
    to: Joi.string().email().optional(),
    subject: Joi.string().trim().default("Brevo SMTP test email"),
    html: Joi.string()
      .default("<h1>Brevo SMTP is working</h1><p>Your email queue is ready.</p>"),
    text: Joi.string()
      .default("Brevo SMTP is working. Your email queue is ready."),
  });

  return schema.validate(payload, { abortEarly: false });
};

export const validateTestPush = (payload) => {
  const schema = Joi.object({
    title: Joi.string().trim().default("Firebase FCM test"),
    body: Joi.string()
      .trim()
      .default("Your push notification pipeline is working."),
    data: Joi.object()
      .pattern(
        Joi.string(),
        Joi.alternatives(Joi.string(), Joi.number(), Joi.boolean()),
      )
      .default({}),
  });

  return schema.validate(payload, { abortEarly: false });
};

export const validateGetNotifications = (payload) => {
  const schema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    is_read: Joi.boolean().optional(),
  });

  return schema.validate(payload, { abortEarly: false });
};

export const validateNotificationId = (payload) => {
  const schema = Joi.object({
    id: Joi.string().uuid().required(),
  });

  return schema.validate(payload, { abortEarly: false });
};
