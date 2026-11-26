import React from "react";
import { MailCheck, MailWarning } from "lucide-react";

//Full class names, so that Tailwind finds them
const TONES = {
  sent: "bg-emerald-50 border-emerald-100 text-emerald-800",
  failed: "bg-amber-50 border-amber-200 text-amber-800",
};

const ICONS = { sent: MailCheck, failed: MailWarning };

//MH-08: shown in the card of a booking the hiker just cancelled. It says whether the "booking cancelled"
//email was sent; a failed email never undoes the cancellation (MH-03 rules).
//`email` is the hiker's address, null when it is not known.
export default function CancelOutcome({
  id,
  emailSent,
  email,
  className = "px-5 sm:px-6",
}) {
  const kind = emailSent ? "sent" : "failed";
  const Icon = ICONS[kind];
  const address = email ? <strong className="wrap-anywhere">{email}</strong> : null;

  const message =
    kind === "sent" ? (
      <>
        A cancellation email has been sent to {address ?? "your email address"}.
      </>
    ) : (
      "We could not send you the cancellation email."
    );

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
