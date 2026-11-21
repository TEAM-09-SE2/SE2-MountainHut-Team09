import nodemailer from "nodemailer";

let transporter;

//EmailSender (api.md MH-03): the rest of the code only calls send(),
//so the email provider can be changed here without touching the API
function getTransporter() {
  transporter ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 1025),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined,
    //Fail fast: the booking response waits for the email
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 10000,
  });
  return transporter;
}

async function send({ to, subject, html, text }) {
  await getTransporter().sendMail({
    from: process.env.MAIL_FROM,
    to,
    subject,
    html,
    text,
  });
}

export default { send };
