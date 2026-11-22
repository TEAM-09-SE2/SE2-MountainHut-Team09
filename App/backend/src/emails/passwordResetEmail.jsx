import {
  Html,
  Head,
  Body,
  Container,
  Preview,
  Section,
  Heading,
  Text,
} from "react-email";
import { emailStyles } from "./emailStyles.js";

export function PasswordResetEmail({ firstName, resetUrl }) {
  const missingFields = Object.entries({ firstName, resetUrl })
    .filter(([, value]) => typeof value !== "string" || !value.trim())
    .map(([field]) => field);
  if (missingFields.length > 0) {
    throw new Error(`Missing required password reset email fields: ${missingFields.join(", ")}`);
  }

  return (
    <Html lang="en">
      <Head />
      <Preview>Reset your Skyreach password</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          {/* Brand header */}
          <Section style={styles.header}>
            <Text style={styles.logo}>Skyreach</Text>
          </Section>

          {/* Main content */}
          <Section style={styles.mainContent}>
            <Heading as="h1" style={styles.greetingHeading}>
              Reset your password
            </Heading>
            <Text style={styles.greetingText}>Hello, {firstName}!</Text>
            <Text style={styles.subtext}>
              We received a request to reset the password for your Skyreach
              account. Click the button below to choose a new password. For your
              security, this link expires in <strong>24 hours</strong> and can
              only be used once.
            </Text>

            <Section style={styles.buttonWrapper}>
              <a href={resetUrl} style={styles.button}>
                Reset password
              </a>
            </Section>

            <Section style={styles.fallbackCard}>
              <Text style={styles.fallbackLabel}>
                If the button above does not work, copy and paste this link into
                your browser:
              </Text>
              <Text style={styles.fallbackLinkText}>
                <a href={resetUrl} style={styles.fallbackLink}>
                  {resetUrl}
                </a>
              </Text>
            </Section>

            <Text style={styles.securityNote}>
              If you did not request a password reset, you can safely ignore
              this email—your current password will remain unchanged.
            </Text>
          </Section>

          {/* Footer */}
          <Section style={styles.footer}>
            <Text style={styles.footerBrand}>
              © {new Date().getFullYear()} Skyreach. All rights reserved.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export default PasswordResetEmail;

const styles = {
  ...emailStyles,
  buttonWrapper: {
    textAlign: "center",
    marginBottom: "24px",
  },
  button: {
    backgroundColor: "#2E5138",
    color: "#F4F2EA",
    fontSize: "15px",
    fontWeight: "600",
    textDecoration: "none",
    padding: "12px 28px",
    borderRadius: "8px",
    display: "inline-block",
  },
  fallbackCard: {
    border: "1px solid #EAE6DC",
    borderRadius: "8px",
    backgroundColor: "#FAF9F6",
    padding: "12px 16px",
    marginBottom: "20px",
  },
  fallbackLabel: {
    color: "#5C685A",
    fontSize: "12px",
    lineHeight: "18px",
    margin: "0 0 6px 0",
  },
  fallbackLinkText: {
    margin: "0",
    wordBreak: "break-all",
  },
  fallbackLink: {
    color: "#2E5138",
    fontSize: "12px",
    lineHeight: "18px",
    textDecoration: "underline",
  },
  securityNote: {
    color: "#5C685A",
    fontSize: "13px",
    lineHeight: "20px",
    borderTop: "1px solid #EAE6DC",
    paddingTop: "16px",
    margin: "0",
  },
};
