import { Body, Head, Html, Preview, Text } from "react-email";

//TODO: improve the email template
export function PasswordResetEmail({ firstName, resetUrl }) {
  return (
    <Html lang="en">
      <Head />
      <Preview>Reset your Mountain Hut password</Preview>
      <Body>
        <Text>Hello, {firstName}.</Text>
        <Text>
          We received a request to reset the password for your account.
          Use this link within 24 hours to choose a new password:
        </Text>
        <Text>
          <a href={resetUrl}>{resetUrl}</a>
        </Text>
        <Text>If you did not request this, you can ignore this email.</Text>
      </Body>
    </Html>
  );
}

export default PasswordResetEmail;