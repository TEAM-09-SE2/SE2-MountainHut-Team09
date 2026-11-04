import { createElement } from "react";
import { render } from "@react-email/render";
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

    //Pass every prop: the template has demo default values for the missing ones
    const email = createElement(BookingConfirmationEmail, {
      bookingReference: `MH-${data.id}`,
      dateTimeSlot: `${dateFormat.format(data.startAt)} - from ${timeFormat.format(data.startAt)} to ${timeFormat.format(data.endAt)}`,
      partySize: data.partySize,
      assignedTables: data.tables,
      hikerName: data.hikerName,
    });

    await emailSender.send({
      to: data.email,
      subject: `Booking confirmed – MH-${data.id}`,
      html: await render(email),
      text: await render(email, { plainText: true }),
    });
    await reservationRepository.markConfirmationSent(reservationId);
    return true;
  } catch (error) {
    console.error(
      `Confirmation email for reservation ${reservationId} not sent:`,
      error,
    );
    return false;
  }
}

export default { sendBookingConfirmation };
