import { createElement } from "react";
import { render } from "react-email";
import PasswordResetEmail from "../emails/passwordResetEmail.jsx";
import emailSender from "../emails/emailSender.js";

// Build a frontend reset link using CLIENT_URL as the base URL.
function buildPasswordResetUrl(token) {
  if (!process.env.CLIENT_URL) {
    throw new Error("CLIENT_URL environment variable is not defined");
  }

  const baseUrl = process.env.CLIENT_URL.endsWith("/")
    ? process.env.CLIENT_URL
    : `${process.env.CLIENT_URL}/`;
  const resetUrl = new URL("reset-password", baseUrl);
  resetUrl.searchParams.set("token", token);
  return resetUrl.toString();
}

// Send the reset link; email failures are logged and do not change the API response.
async function sendPasswordResetEmail(user, token) {
  try {
    const resetUrl = buildPasswordResetUrl(token);
    const email = createElement(PasswordResetEmail, {
      firstName: user.firstName,
      resetUrl,
    });

    await emailSender.send({
      to: user.email,
      subject: "Reset your password",
      html: await render(email),
      text: await render(email, { plainText: true }),
    });
    return true;
  } catch (error) {
    console.error(
      `Password reset email for user ${user.id} not sent:`,
      error,
    );
    return false;
  }
}

export default { sendPasswordResetEmail };
