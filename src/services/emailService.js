import { getMailerTransporter, isMailerConfigured } from "../config/mailer.js";
import { InternalServerError } from "../errors/AppError.js";

export const sendEmail = async ({
  to,
  subject,
  html,
  text,
  from = process.env.MAIL_FROM,
}) => {
  if (!isMailerConfigured()) {
    throw new InternalServerError(
      "Brevo SMTP configuration is missing. Please set BREVO_SMTP_* and MAIL_FROM.",
    );
  }

  const transporter = getMailerTransporter();

  return transporter.sendMail({
    from,
    to,
    subject,
    html,
    text,
  });
};
