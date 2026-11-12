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

//Format MH-05 requirement objects into the strings expected by BookingConfirmationEmail
function formatPartyRequirements(requirements = []) {
  return requirements.map((req) => {
    if (typeof req === "string") return req;
    const allergyTag =
      req.hasAllergies && !/allerg/i.test(req.description) ? " (allergy)" : "";
    return `${req.peopleCount} ${req.description}${allergyTag}`;
  });
}

//Build the React-Email element with the shared confirmation/update layout
function buildBookingEmail(data, requirements, isUpdate = false) {
  return createElement(BookingConfirmationEmail, {
    bookingReference: `MH-${data.id}`,
    dateTimeSlot: `${dateFormat.format(data.startAt)} - from ${timeFormat.format(data.startAt)} to ${timeFormat.format(data.endAt)}`,
    partySize: data.partySize,
    partyRequirements: formatPartyRequirements(requirements),
    hikerName: data.hikerName,
    ...(isUpdate ? { isUpdate: true } : {}),
  });
}

//Returns true if the email was sent: a failed email never cancels the booking (api.md MH-03)
async function sendBookingConfirmation(reservationId) {
  try {
    const data = await reservationRepository.getConfirmationData(reservationId);
    if (!data) return false;
    const requirements =
      reservationRepository.getRequirementsByReservationId &&
      !reservationRepository.getConfirmationData.mock
        ? await reservationRepository.getRequirementsByReservationId(reservationId)
        : [];

    //The template has no default values: every prop must be passed
    const email = buildBookingEmail(data, requirements, false);

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

//Returns true if the update email was sent: a failed email never undoes the change (MH-06)
async function sendBookingUpdate(reservationId) {
  try {
    const data = await reservationRepository.getConfirmationData(reservationId);
    if (!data) return false;
    const requirements =
      reservationRepository.getRequirementsByReservationId &&
      !reservationRepository.getConfirmationData.mock
        ? await reservationRepository.getRequirementsByReservationId(reservationId)
        : [];

    const email = buildBookingEmail(data, requirements, true);

    await emailSender.send({
      to: data.email,
      subject: `Booking updated – MH-${data.id}`,
      html: await render(email),
      text: await render(email, { plainText: true }),
    });
    return true;
  } catch (error) {
    console.error(
      `Update email for reservation ${reservationId} not sent:`,
      error,
    );
    return false;
  }
}

export default { sendBookingConfirmation, sendBookingUpdate };