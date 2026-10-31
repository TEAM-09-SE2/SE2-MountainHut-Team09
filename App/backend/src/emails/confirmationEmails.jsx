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
} from '@react-email/components';

export function BookingConfirmationEmail({
  bookingReference = "MH-98042",
  dateTimeSlot = "June 15, 2026 - from 09:30 AM to 10:30 AM",
  partySize = 4,
  assignedTables = [
    { tableNumber: 4, seats: 2 },
    { tableNumber: 5, seats: 2 },
  ],
  hikerName = "Mario Rossi",
}) {
  // Validate the booking data before rendering the email.
  const requiredText = { bookingReference, dateTimeSlot, hikerName };
  const missingFields = Object.entries(requiredText)
    .filter(([, value]) => typeof value !== 'string' || value.trim() === '')
    .map(([field]) => field);

  if (missingFields.length > 0) {
    throw new Error(`Missing required booking confirmation fields: ${missingFields.join(', ')}`);
  }

  if (!Number.isInteger(partySize) || partySize < 1) {
    throw new Error('partySize must be a positive integer');
  }

  if (
    !Array.isArray(assignedTables) ||
    assignedTables.length === 0 ||
    assignedTables.some(
      (table) =>
        !table ||
        !Number.isInteger(table.tableNumber) ||
        table.tableNumber < 1 ||
        !Number.isInteger(table.seats) ||
        table.seats < 1,
    )
  ) {
    throw new Error('assignedTables must contain table numbers and positive seat counts');
  }

  return (
    <Html lang="en">
      <Head />
      <Preview>Your booking is confirmed. Reference: {bookingReference}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          {/* Brand header */}
          <Section style={styles.header}>
            <Text style={styles.logo}>Skyreach</Text>
          </Section>

          {/* Confirmation message and booking details */}
          <Section style={styles.mainContent}>
            <Heading as="h1" style={styles.greetingHeading}>
              Your reservation is confirmed
            </Heading>
            <Text style={styles.greetingText}>Hello, {hikerName}!</Text>
            <Text style={styles.subtext}>
              We look forward to welcoming you! Here are the details of your reservation:
            </Text>

            <Section style={styles.detailsCard}>
              <Row style={styles.detailRow}>
                <Column style={styles.labelCol}>
                  <Text style={styles.detailLabel}>Booking Reference</Text>
                </Column>
                <Column style={styles.valueCol}>
                  <Text style={styles.detailValueHighlight}>{bookingReference}</Text>
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

              <Row style={styles.detailRow}>
                <Column style={styles.labelCol}>
                  <Text style={styles.detailLabel}>Party size</Text>
                </Column>
                <Column style={styles.valueCol}>
                  <Text style={styles.detailValue}>
                    {partySize} {partySize === 1 ? 'person' : 'people'}
                  </Text>
                </Column>
              </Row>

              <Row style={styles.detailRowLast}>
                <Column style={styles.labelCol}>
                  <Text style={styles.detailLabel}>Seats per table</Text>
                </Column>
                <Column style={styles.valueCol}>
                  {assignedTables.map(({ tableNumber, seats }) => (
                    <Text key={tableNumber} style={styles.detailTableLine}>
                      Table {String(tableNumber).padStart(2, '0')}: {seats}{' '}
                      {seats === 1 ? 'seat' : 'seats'}
                    </Text>
                  ))}
                </Column>
              </Row>

            </Section>

            {/* Arrival reminder */}
            <Section style={styles.infoBox}>
              <Text style={styles.infoText}>
                <strong>Please note:</strong> Arrive 15 minutes before your time slot and have your booking reference ready.
              </Text>
            </Section>

          </Section>

          {/* Contact information and copyright */}
          <Section style={styles.footer}>
            <Text style={styles.footerText}>
              Need to change or cancel your booking? Contact the Skyreach team.
            </Text>
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
  // Email canvas and centered content container.
  body: {
    backgroundColor: '#F4F2EA',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    padding: '24px 12px',
    margin: '0',
  },
  container: {
    backgroundColor: '#FFFFFF',
    border: '1px solid #E1DEC5',
    borderRadius: '12px',
    maxWidth: '560px',
    width: '100%',
    margin: '0 auto',
    overflow: 'hidden',
  },
  // Brand header.
  header: {
    backgroundColor: '#2E5138',
    padding: '20px',
    textAlign: 'center',
  },
  logo: {
    color: '#F4F2EA',
    fontSize: '20px',
    fontWeight: 'bold',
    margin: '0',
    letterSpacing: '1px',
  },
  // Main message and booking details.
  mainContent: {
    padding: '0 24px 24px 24px',
  },
  greetingHeading: {
    color: '#2E5138',
    fontSize: '22px',
    fontWeight: '700',
    marginTop: '20px',
    marginBottom: '8px',
  },
  greetingText: {
    color: '#5C685A',
    fontSize: '15px',
    fontWeight: '500',
    margin: '0 0 8px',
  },
  subtext: {
    color: '#5C685A',
    fontSize: '15px',
    lineHeight: '22px',
    margin: '0 0 24px 0',
  },
  detailsCard: {
    border: '1px solid #EAE6DC',
    borderRadius: '8px',
    backgroundColor: '#FAF9F6',
    padding: '8px 16px',
    marginBottom: '24px',
  },
  detailRow: {
    borderBottom: '1px solid #EAE6DC',
    padding: '12px 0',
  },
   detailRowLast: {
    padding: '12px 0',
  },
  labelCol: {
    width: '40%',
  },
  valueCol: {
    width: '60%',
    textAlign: 'right',
    verticalAlign: 'top',
    wordBreak: 'break-word',
  },
  detailLabel: {
    color: '#5C685A',
    fontSize: '13px',
    textTransform: 'uppercase',
    fontWeight: 'bold',
    margin: '0',
  },
  detailValue: {
    color: '#2E5138',
    fontSize: '14px',
    fontWeight: '500',
    margin: '0',
  },
  detailValueHighlight: {
    color: '#2E5138',
    fontSize: '15px',
    fontWeight: 'bold',
    letterSpacing: '0.5px',
    margin: '0',
  },
  detailTableLine: {
    color: '#2E5138',
    fontSize: '14px',
    fontWeight: '500',
    lineHeight: '20px',
    margin: '0 0 4px',
    textAlign: 'right',
  },
  infoBox: {
    backgroundColor: '#F1EFE8',
    borderRadius: '6px',
    padding: '16px',
    borderLeft: '4px solid #2E5138',
  },
  infoText: {
    color: '#5C685A',
    fontSize: '13px',
    lineHeight: '18px',
    margin: '0',
  },
  // Footer content.
  footer: {
    backgroundColor: '#F4F2EA',
    borderTop: '1px solid #E1DEC5',
    padding: '24px',
    textAlign: 'center',
  },
  footerText: {
    color: '#5C685A',
    fontSize: '12px',
    lineHeight: '18px',
    margin: '0 0 12px 0',
  },
  footerBrand: {
    color: '#5C685A',
    fontSize: '11px',
    margin: '0',
  },
};