import nodemailer from "nodemailer";

let transporter;

export const isMailerConfigured = () => {
  return Boolean(
    process.env.BREVO_SMTP_USER &&
      process.env.BREVO_SMTP_PASS &&
      process.env.MAIL_FROM,
  );
};

export const getMailerTransporter = () => {
  if (!isMailerConfigured()) {
    throw new Error("Brevo SMTP is not configured");
  }

  if (transporter) {
    return transporter;
  }

  transporter = nodemailer.createTransport({
    host: process.env.BREVO_SMTP_HOST || "smtp-relay.brevo.com",
    port: Number(process.env.BREVO_SMTP_PORT || 587),
    secure: process.env.BREVO_SMTP_SECURE === "true",
    auth: {
      user: process.env.BREVO_SMTP_USER,
      pass: process.env.BREVO_SMTP_PASS,
    },
  });

  return transporter;
};
