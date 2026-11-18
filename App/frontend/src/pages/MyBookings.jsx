import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  Calendar,
  Clock,
  Loader2,
  Lock,
  Pencil,
  RefreshCcw,
  Users,
  XCircle,
} from "lucide-react";
import Navbar from "../components/common/Navbar";
import Footer from "../components/common/Footer";
import RequirementsList from "../components/booking/RequirementsList";
import CancelBookingDialog from "../components/booking/CancelBookingDialog";
import CancelOutcome from "../components/booking/CancelOutcome";
import { useAuth } from "../context/AuthContext";
import {
  cancelReservation,
  fetchMyReservations,
} from "../services/reservationApi";
import {
  bookingReference,
  formatLongDate,
  formatTimeRange,
  peopleLabel,
} from "../utils/bookingFormat";

//A cancelled booking stays in the list, greyed out: grey card and text, but still readable
function BookingCard({ booking, outcome, email, onCancel }) {
  const cancelled = booking.status === "cancelled";
  const iconTone = cancelled ? "text-slate-400" : "text-emerald-700";

  return (
    <li
      data-testid={`booking-${booking.id}`}
      className={`rounded-2xl border border-slate-200 overflow-hidden ${
        cancelled ? "bg-slate-100" : "bg-white shadow-xs"
      }`}
    >
      <div className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2
              className={`text-lg font-bold ${
                cancelled ? "text-slate-600" : "text-slate-900"
              }`}
            >
              {formatLongDate(booking.slot.startAt)}
            </h2>
            <p className="text-sm text-slate-600 mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="inline-flex items-center gap-1.5">
                <Clock className={`w-4 h-4 ${iconTone}`} aria-hidden="true" />
                {formatTimeRange(booking.slot.startAt, booking.slot.endAt)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Users className={`w-4 h-4 ${iconTone}`} aria-hidden="true" />
                {peopleLabel(booking.partySize)}
              </span>
              <span
                className={`font-mono text-xs ${
                  cancelled ? "text-slate-600" : "text-slate-500"
                }`}
              >
                {bookingReference(booking.id)}
              </span>
            </p>
          </div>
          <span
            className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${
              cancelled
                ? "bg-slate-200 text-slate-700"
                : "bg-emerald-100 text-emerald-800"
            }`}
          >
            {cancelled && <XCircle className="w-3.5 h-3.5" aria-hidden="true" />}
            {cancelled ? "Cancelled" : "Confirmed"}
          </span>
        </div>

        {!cancelled && (
          <div className="mt-4 rounded-xl bg-slate-50 border border-slate-100 p-3">
            <p className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase mb-1.5">
              Requirements
            </p>
            <RequirementsList requirements={booking.requirements} />
          </div>
        )}
      </div>

      {/* Right after a cancellation the card says whether the email was sent */}
      {outcome ? (
        <CancelOutcome
          id={`cancel-outcome-${booking.id}`}
          emailSent={outcome.emailSent}
          email={email}
        />
      ) : (
        <div
          className={`px-5 sm:px-6 py-3 border-t flex flex-wrap items-center justify-between gap-3 text-sm ${
            cancelled ? "border-slate-200" : "border-slate-100"
          }`}
        >
          {cancelled ? (
            <p className="text-slate-600">
              Cancelled booking · no action available
            </p>
          ) : (
            <>
              {!booking.changeable && (
                <p className="inline-flex items-center gap-1.5 text-slate-500">
                  <Lock className="w-4 h-4" aria-hidden="true" /> Changes close
                  48 hours before the slot
                </p>
              )}
              {(booking.changeable || booking.cancellable) && (
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  {booking.changeable && (
                    <Link
                      to={`/my-bookings/${booking.id}/change`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-4 py-2 font-medium text-slate-800 hover:border-emerald-600 hover:text-emerald-800 transition-colors"
                    >
                      <Pencil className="w-4 h-4" aria-hidden="true" /> Change
                    </Link>
                  )}
                  {/* MH-08: possible until the slot ends, the API says when with `cancellable` */}
                  {booking.cancellable && (
                    <button
                      type="button"
                      onClick={() => onCancel(booking)}
                      aria-label={`Cancel booking ${bookingReference(booking.id)}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-4 py-2 font-medium text-red-700 hover:border-red-300 hover:bg-red-100 transition-colors"
                    >
                      <XCircle className="w-4 h-4" aria-hidden="true" /> Cancel
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </li>
  );
}

//MH-06 + MH-08: the hiker's bookings, with "Change" and "Cancel" only where the API allows them
export default function MyBookings() {
  const email = useAuth()?.user?.email ?? null;
  const [bookings, setBookings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  //The booking whose cancellation is being confirmed
  const [toCancel, setToCancel] = useState(null);
  //Bookings cancelled from this page: id -> { emailSent }
  const [outcomes, setOutcomes] = useState({});
  const [focusId, setFocusId] = useState(null);
  const titleRef = useRef(null);

  //`silent` reloads the list without the loading state, e.g. behind the cancel dialog
  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
      setError(null);
      setOutcomes({});
    }
    try {
      setBookings(await fetchMyReservations());
    } catch (err) {
      //A failed silent reload keeps the list as it is
      if (!silent) setError(err.message || "Unable to load your bookings.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  //After a cancellation the focus moves to the result in the card, as its button is gone
  useEffect(() => {
    if (!focusId) return;
    document.getElementById(focusId)?.focus();
    setFocusId(null);
  }, [focusId]);

  const handleCancelled = (booking, result) => {
    setBookings((current) =>
      current.map((b) =>
        b.id === booking.id
          ? {
              ...b,
              status: "cancelled",
              cancelledAt: result.cancelledAt,
              changeable: false,
              cancellable: false,
            }
          : b,
      ),
    );
    setOutcomes((current) => ({
      ...current,
      [booking.id]: { emailSent: Boolean(result.confirmationSent) },
    }));
    setToCancel(null);
    setFocusId(`cancel-outcome-${booking.id}`);
  };

  const hasChangeClosed =
    bookings?.some((b) => b.status === "confirmed" && !b.changeable) ?? false;

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 flex flex-col">
      <Navbar />

      <main className="flex-1 w-full max-w-5xl mx-auto p-4 sm:p-6 lg:p-8">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <h1
              ref={titleRef}
              tabIndex={-1}
              className="text-3xl font-extrabold tracking-tight outline-none"
            >
              My bookings
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Your current and upcoming tables. Changes close 48 hours before
              the slot; you can cancel a booking until its slot ends.
            </p>
          </div>
          <Link
            to="/book-table"
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-800 transition-colors"
          >
            Book another table
          </Link>
        </div>

        {loading && (
          <div
            role="status"
            className="flex items-center justify-center gap-2 py-16 text-slate-500"
          >
            <Loader2 className="w-5 h-5 animate-spin" /> Loading your bookings…
          </div>
        )}

        {!loading && error && (
          <div
            role="alert"
            className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-center justify-between gap-3 text-red-700 text-sm"
          >
            <span className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 flex-shrink-0" /> {error}
            </span>
            <button
              type="button"
              onClick={() => load()}
              className="inline-flex items-center gap-1.5 font-medium hover:underline"
            >
              <RefreshCcw className="w-4 h-4" /> Retry
            </button>
          </div>
        )}

        {!loading && !error && bookings?.length === 0 && (
          <div className="text-center bg-white border border-slate-200 rounded-2xl p-10">
            <Calendar className="w-10 h-10 text-emerald-700 mx-auto mb-3" />
            <h2 className="text-lg font-bold">No upcoming bookings</h2>
            <p className="text-sm text-slate-600 mt-1 mb-5">
              When you book a table it appears here.
            </p>
            <Link
              to="/book-table"
              className="inline-flex rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-800 transition-colors"
            >
              Book a table
            </Link>
          </div>
        )}

        {!loading && !error && bookings?.length > 0 && (
          <>
            {hasChangeClosed && (
              <p className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-800">
                Less than 48 hours to a slot: its booking can no longer be
                changed, but you can still cancel it.
              </p>
            )}
            <ul className="space-y-4">
              {bookings.map((booking) => (
                <BookingCard
                  key={booking.id}
                  booking={booking}
                  outcome={outcomes[booking.id]}
                  email={email}
                  onCancel={setToCancel}
                />
              ))}
            </ul>
          </>
        )}
      </main>

      <Footer />

      {toCancel && (
        <CancelBookingDialog
          booking={toCancel}
          cancelBooking={cancelReservation}
          onCancelled={handleCancelled}
          onRefused={() => load({ silent: true })}
          onClose={() => setToCancel(null)}
          returnFocusRef={titleRef}
        />
      )}
    </div>
  );
}
