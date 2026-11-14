import { createElement } from "react";
import { render } from "react-email";
import BookingConfirmationEmail from "../emails/confirmationEmails.jsx";
import emailSender from "../emails/emailSender.js";
import reservationRepository from "../database/reservation.repository.js";

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "long",
  timeZone: "Europe/Rome",
});
const timeFormat = new Intl.DateTimeFormat("en-GB", {
  timeStyle: "short",
  timeZone: "Europe/Rome",
});

//Returns true if the email was sent: a failed email never cancels the booking (api.md MH-03)
async function sendBookingConfirmation(reservationId) {
  try {
    const data = await reservationRepository.getConfirmationData(reservationId);
    if (!data) return false;

    //The template has no default values: every prop must be passed
    const email = createElement(BookingConfirmationEmail, {
      bookingReference: `MH-${data.id}`,
      dateTimeSlot: `${dateFormat.format(data.startAt)} - from ${timeFormat.format(data.startAt)} to ${timeFormat.format(data.endAt)}`,
      partySize: data.partySize,
      partyRequirements: data.requirements.map(
        ({ peopleCount, hasAllergies, description }) =>
          `${hasAllergies ? "ALLERGY: " : ""}${peopleCount} × ${description}`,
      ),
      hikerName: data.hikerName,
    });

    await emailSender.send({
      to: data.email,
      subject: `Booking confirmed – MH-${data.id}`,
      html: await render(email),
      text: await render(email, { plainText: true }),
    });
  } catch (error) {
    console.error(
      `Confirmation email for reservation ${reservationId} not sent:`,
      error,
    );
    return false;
  }

  //The email already reached the hiker: if saving the timestamp fails we still answer true
  try {
    await reservationRepository.markConfirmationSent(reservationId);
  } catch (error) {
    console.error(
      `Confirmation email for reservation ${reservationId} sent, but confirmation_sent_at not saved:`,
      error,
    );
  }
  return true;
}

export default { sendBookingConfirmation };
