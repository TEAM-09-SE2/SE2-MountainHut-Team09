import React, { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";
import { AlertCircle, Loader2, XCircle } from "lucide-react";
import {
  bookingReference,
  formatLongDate,
  formatTimeRange,
  peopleLabel,
} from "../../utils/bookingFormat";

//Answers after which trying again cannot work: the page reloads its list to show the real state
const REFUSALS = {
  RESERVATION_CANCELLED: (reference) =>
    `Booking ${reference} has already been cancelled.`,
  SLOT_ENDED: (reference) =>
    `Booking ${reference} can no longer be cancelled: its slot has already ended.`,
  RESERVATION_NOT_FOUND: (reference) =>
    `Booking ${reference} could not be found.`,
};

const describeError = (err, reference) => {
  const refusal = REFUSALS[err.code];
  if (refusal) return { message: refusal(reference), final: true };
  if (err.status === 401) {
    return {
      message: "Your session has expired. Log in again to cancel the booking.",
      final: true,
      login: true,
    };
  }
  //No HTTP status: the request never reached the API
  if (err.status === undefined) {
    return {
      message:
        "We could not reach the server. Check your connection and try again.",
    };
  }
  if (err.status >= 500) {
    return { message: "Something went wrong on our side. Please try again." };
  }
  return {
    message:
      err.message || "The booking could not be cancelled. Please try again.",
  };
};

//MH-08: asks for confirmation before cancelling, so a single click never cancels a booking.
//The focus starts on "Keep booking" and stays in the dialog; Escape or a click outside keeps the booking.
export default function CancelBookingDialog({
  booking,
  cancelBooking,
  onCancelled,
  onRefused,
  onClose,
  returnFocusRef,
}) {
  const reference = bookingReference(booking.id);
  const titleId = useId();
  const summaryId = useId();
  const warningId = useId();
  const location = useLocation();
  const panelRef = useRef(null);
  const keepRef = useRef(null);
  const mountedRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    mountedRef.current = true;
    const opener = document.activeElement;
    const appRoot = document.getElementById("root");
    const { overflow, paddingRight } = document.body.style;
    const scrollbarWidth =
      window.innerWidth - document.documentElement.clientWidth;

    //The page behind can't be scrolled, clicked or reached with Tab or a screen reader
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
    appRoot?.setAttribute("inert", "");
    keepRef.current?.focus();

    return () => {
      mountedRef.current = false;
      appRoot?.removeAttribute("inert");
      document.body.style.overflow = overflow;
      document.body.style.paddingRight = paddingRight;
      //Back to the "Cancel" button, or to the page title when the button is gone
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
      else returnFocusRef?.current?.focus();
    };
  }, [returnFocusRef]);

  //After an error the focus goes back to the first button ("Keep booking" or "Close")
  useEffect(() => {
    if (error) keepRef.current?.focus();
  }, [error]);

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await cancelBooking(booking.id);
      if (mountedRef.current) onCancelled(booking, result);
    } catch (err) {
      if (!mountedRef.current) return;
      const problem = describeError(err, reference);
      setBusy(false);
      setError(problem);
      //The list on the page is out of date: it is reloaded behind the dialog
      if (problem.final && !problem.login) onRefused?.(booking);
    }
  };

  //While the request runs the dialog can't be closed, so its answer is never lost
  const close = () => {
    if (!busy) onClose();
  };

  const handleKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab") return;

    //Tab and Shift+Tab go round the dialog's own buttons and links
    const focusable = [
      ...panelRef.current.querySelectorAll("a[href], button:not([disabled])"),
    ];
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const inside = panelRef.current.contains(document.activeElement);
    if (event.shiftKey && (!inside || document.activeElement === first)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (!inside || document.activeElement === last)) {
      event.preventDefault();
      first.focus();
    }
  };

  const final = Boolean(error?.final);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      onKeyDown={handleKeyDown}
    >
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={final ? summaryId : `${summaryId} ${warningId}`}
        aria-busy={busy}
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-red-50 text-red-700">
            <XCircle className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-bold text-slate-900">
              Cancel booking {reference}?
            </h2>
            {/* Date, time and party each stay on one line, so the text wraps at the dots */}
            <p id={summaryId} className="mt-1 text-sm text-slate-600 wrap-anywhere">
              {[
                formatLongDate(booking.slot.startAt),
                formatTimeRange(booking.slot.startAt, booking.slot.endAt),
                peopleLabel(booking.partySize),
              ].map((part, index) => (
                <React.Fragment key={index}>
                  {index > 0 && " · "}
                  <span className="whitespace-nowrap">{part}</span>
                </React.Fragment>
              ))}
            </p>
          </div>
        </div>

        {!final && (
          <p
            id={warningId}
            className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
          >
            The seats will be released for other guests. This cannot be undone.
          </p>
        )}

        {error && (
          <div
            role="alert"
            className="mt-4 flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700"
          >
            <AlertCircle className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
            <p>
              {error.message}
              {error.login && (
                <>
                  {" "}
                  <Link
                    to="/login"
                    state={{ from: location.pathname + location.search }}
                    className="font-semibold underline"
                  >
                    Log in
                  </Link>
                </>
              )}
            </p>
          </div>
        )}

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            ref={keepRef}
            type="button"
            onClick={close}
            disabled={busy}
            className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 transition-colors"
          >
            {final ? "Close" : "Keep booking"}
          </button>
          {!final && (
            <button
              type="button"
              onClick={confirm}
              disabled={busy}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-800 disabled:cursor-wait disabled:opacity-80 transition-colors"
            >
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Cancelling…
                </>
              ) : (
                "Cancel booking"
              )}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
