import Mailjet from "node-mailjet";

let mailjetClient = null;

function getMailjetClient() {
  if (mailjetClient) return mailjetClient;

  const apiKey = process.env.MAILJET_API_KEY;
  const apiSecret = process.env.MAILJET_SECRET_KEY;

  if (!apiKey) throw new Error("MAILJET_API_KEY is missing");
  if (!apiSecret) throw new Error("MAILJET_SECRET_KEY is missing");

  mailjetClient = new Mailjet({ apiKey, apiSecret });
  return mailjetClient;
}

export async function sendEmail({ toEmail, toName, subject, text, html }) {
  const fromEmail = process.env.MAILJET_FROM_EMAIL;
  const fromName = process.env.MAILJET_FROM_NAME || "Smart Edu LMS";
  if (!fromEmail) throw new Error("MAILJET_FROM_EMAIL is missing");

  const mailjet = getMailjetClient();
  return mailjet.post("send", { version: "v3.1" }).request({
    Messages: [
      {
        From: { Email: fromEmail, Name: fromName },
        To: [{ Email: toEmail, Name: toName || toEmail }],
        Subject: subject,
        TextPart: text,
        HTMLPart: html,
      },
    ],
  });
}
