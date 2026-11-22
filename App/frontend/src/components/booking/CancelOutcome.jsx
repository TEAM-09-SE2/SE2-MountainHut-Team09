import React from "react";
import { MailCheck, MailWarning, MailX } from "lucide-react";

//Full class names, so that Tailwind finds them
const TONES = {
  sent: "bg-emerald-50 border-emerald-100 text-emerald-800",
  noEmail: "bg-white border-slate-200 text-slate-700",
  failed: "bg-amber-50 border-amber-200 text-amber-800",
};

const ICONS = { sent: MailCheck, noEmail: MailX, failed: MailWarning };

//MH-08: shown in the card of a booking just cancelled. It says whether the "booking cancelled"
//email was sent; a failed email never undoes the cancellation (MH-03 rules).
//`email` is the hiker's address, null for a temporary hiker (MH-07), who gets no email.
export default function CancelOutcome({
  id,
  emailSent,
  email,
  forStaff = false,
  className = "px-5 sm:px-6",
}) {
  const kind = emailSent ? "sent" : forStaff && !email ? "noEmail" : "failed";
  const Icon = ICONS[kind];
  const address = email ? <strong className="wrap-anywhere">{email}</strong> : null;

  let message;
  if (kind === "sent") {
    message = (
      <>
        A cancellation email has been sent to{" "}
        {address ?? (forStaff ? "the hiker" : "your email address")}.
      </>
    );
  } else if (kind === "noEmail") {
    message = "No email was sent: the hiker has no email address.";
  } else if (forStaff) {
    message = address ? (
      <>The cancellation email to {address} could not be sent.</>
    ) : (
      "The cancellation email could not be sent."
    );
  } else {
    message = "We could not send you the cancellation email.";
  }

  return (
    <div
      id={id}
      tabIndex={-1}
      className={`flex items-start gap-2 border-t py-3 text-sm outline-none ${className} ${TONES[kind]}`}
    >
      <Icon className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
      <p>
        <strong>Booking cancelled.</strong> {message}
      </p>
    </div>
  );
}
