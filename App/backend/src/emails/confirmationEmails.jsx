import {
  Html,
  Head,
  Body,
  Container,
  Preview,
  Section,
  Heading,
  Text,
  Row,
  Column,
} from "react-email";
import { emailStyles } from "./emailStyles.js";

export function BookingConfirmationEmail({
  bookingReference,
  dateTimeSlot,
  partySize,
  hikerName,
  // Party requirements (MH-05), e.g. "2 vegetarian", "1 nut allergy". Optional: the row is
  // shown only when there are some. Table numbers are not shown to the hiker (issue 24).
  partyRequirements = [],
  isUpdate = false,
  isCancelled = false,
}) {
  // Validate the booking data before rendering the email.
  const requiredText = { bookingReference, dateTimeSlot, hikerName };
  const missingFields = Object.entries(requiredText)
    .filter(([, value]) => typeof value !== "string" || value.trim() === "")
    .map(([field]) => field);

  if (missingFields.length > 0) {
    throw new Error(
      `Missing required booking confirmation fields: ${missingFields.join(", ")}`,
    );
  }

  if (!Number.isInteger(partySize) || partySize < 1) {
    throw new Error("partySize must be a positive integer");
  }

  if (
    !Array.isArray(partyRequirements) ||
    partyRequirements.some(
      (requirement) =>
        typeof requirement !== "string" || requirement.trim() === "",
    )
  ) {
    throw new Error("partyRequirements must be a list of non-empty strings");
  }

  const hasRequirements = partyRequirements.length > 0;

  return (
    <Html lang="en">
      <Head />
      <Preview>
        {isCancelled
          ? `Your booking has been cancelled. Reference: ${bookingReference}`
          : isUpdate
            ? `Your booking has been updated. Reference: ${bookingReference}`
            : `Your booking is confirmed. Reference: ${bookingReference}`}
      </Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          {/* Brand header */}
          <Section style={styles.header}>
            <Text style={styles.logo}>Skyreach</Text>
          </Section>

          {/* Confirmation / update message and booking details */}
          <Section style={styles.mainContent}>
            <Heading as="h1" style={styles.greetingHeading}>
              {isCancelled
                ? "Your reservation has been cancelled"
                : isUpdate
                  ? "Your reservation has been updated"
                  : "Your reservation is confirmed"}
            </Heading>
            <Text style={styles.greetingText}>Hello, {hikerName}!</Text>
            <Text style={styles.subtext}>
              {isCancelled
                ? "Your reservation has been cancelled and the seats have been released. Here are the details of the cancelled reservation:"
                : isUpdate
                  ? "Here are the updated details of your reservation:"
                  : "We look forward to welcoming you! Here are the details of your reservation:"}
            </Text>

            <Section style={styles.detailsCard}>
              <Row style={styles.detailRow}>
                <Column style={styles.labelCol}>
                  <Text style={styles.detailLabel}>Booking Reference</Text>
                </Column>
                <Column style={styles.valueCol}>
                  <Text style={styles.detailValueHighlight}>
                    {bookingReference}
                  </Text>
                </Column>
              </Row>

              <Row style={styles.detailRow}>
                <Column style={styles.labelCol}>
                  <Text style={styles.detailLabel}>Hiker</Text>
                </Column>
                <Column style={styles.valueCol}>
                  <Text style={styles.detailValue}>{hikerName}</Text>
                </Column>
              </Row>

              <Row style={styles.detailRow}>
                <Column style={styles.labelCol}>
                  <Text style={styles.detailLabel}>Date & Time</Text>
                </Column>
                <Column style={styles.valueCol}>
                  <Text style={styles.detailValue}>{dateTimeSlot}</Text>
                </Column>
              </Row>

              <Row
                style={
                  hasRequirements ? styles.detailRow : styles.detailRowLast
                }
              >
                <Column style={styles.labelCol}>
                  <Text style={styles.detailLabel}>Party size</Text>
                </Column>
                <Column style={styles.valueCol}>
                  <Text style={styles.detailValue}>
                    {partySize} {partySize === 1 ? "person" : "people"}
                  </Text>
                </Column>
              </Row>

              {hasRequirements && (
                <Row style={styles.detailRowLast}>
                  <Column style={styles.labelCol}>
                    <Text style={styles.detailLabel}>Party requirements</Text>
                  </Column>
                  <Column style={styles.valueCol}>
                    {partyRequirements.map((requirement, index) => (
                      <Text key={index} style={styles.detailListLine}>
                        {requirement}
                      </Text>
                    ))}
                  </Column>
                </Row>
              )}
            </Section>
          </Section>

          {/* Copyright */}
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

export default BookingConfirmationEmail;

const styles = {
  ...emailStyles,
  detailsCard: {
    border: "1px solid #EAE6DC",
    borderRadius: "8px",
    backgroundColor: "#FAF9F6",
    padding: "8px 16px",
    marginBottom: "24px",
  },
  detailRow: {
    borderBottom: "1px solid #EAE6DC",
    padding: "12px 0",
  },
  detailRowLast: {
    padding: "12px 0",
  },
  labelCol: {
    width: "40%",
  },
  valueCol: {
    width: "60%",
    textAlign: "right",
    verticalAlign: "top",
    wordBreak: "break-word",
  },
  detailLabel: {
    color: "#5C685A",
    fontSize: "13px",
    textTransform: "uppercase",
    fontWeight: "bold",
    margin: "0",
  },
  detailValue: {
    color: "#2E5138",
    fontSize: "14px",
    fontWeight: "500",
    margin: "0",
  },
  detailValueHighlight: {
    color: "#2E5138",
    fontSize: "15px",
    fontWeight: "bold",
    letterSpacing: "0.5px",
    margin: "0",
  },
  detailListLine: {
    color: "#2E5138",
    fontSize: "14px",
    fontWeight: "500",
    lineHeight: "20px",
    margin: "0 0 4px",
    textAlign: "right",
  },
};
