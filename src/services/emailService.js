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
    console.log("=== EMAIL SIMULATION ===");
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(`Content: ${text || html}`);
    console.log("=========================");
    return { success: true, simulated: true };
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
