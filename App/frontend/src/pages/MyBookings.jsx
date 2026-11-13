import React, { useCallback, useEffect, useState } from "react";
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
} from "lucide-react";
import Navbar from "../components/common/Navbar";
import Footer from "../components/common/Footer";
import RequirementsList from "../components/booking/RequirementsList";
import { fetchMyReservations } from "../services/reservationApi";
import {
  bookingReference,
  formatLongDate,
  formatTimeRange,
  peopleLabel,
} from "../utils/bookingFormat";

function BookingCard({ booking }) {
  const cancelled = booking.status === "cancelled";

  return (
    <li
      data-testid={`booking-${booking.id}`}
      className={`rounded-2xl border bg-white shadow-xs overflow-hidden ${
        cancelled ? "border-slate-200 opacity-60" : "border-slate-200"
      }`}
    >
      <div className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              {formatLongDate(booking.slot.startAt)}
            </h2>
            <p className="text-sm text-slate-600 mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="inline-flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-emerald-700" />
                {formatTimeRange(booking.slot.startAt, booking.slot.endAt)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Users className="w-4 h-4 text-emerald-700" />
                {peopleLabel(booking.partySize)}
              </span>
              <span className="font-mono text-xs text-slate-500">
                {bookingReference(booking.id)}
              </span>
            </p>
          </div>
          <span
            className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
              cancelled
                ? "bg-slate-100 text-slate-600"
                : "bg-emerald-100 text-emerald-800"
            }`}
          >
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

      <div className="px-5 sm:px-6 py-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-sm">
        {cancelled ? (
          <p className="text-slate-500">
            Cancelled booking · no action available
          </p>
        ) : booking.changeable ? (
          <Link
            to={`/my-bookings/${booking.id}/change`}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-4 py-2 font-medium text-slate-800 hover:border-emerald-600 hover:text-emerald-800 transition-colors"
          >
            <Pencil className="w-4 h-4" /> Change
          </Link>
        ) : (
          <p className="inline-flex items-center gap-1.5 text-slate-500">
            <Lock className="w-4 h-4" /> Changes close 48 hours before the slot
          </p>
        )}
      </div>
    </li>
  );
}

//MH-06: the hiker's bookings, with the "Change" button only where the API says it is allowed
export default function MyBookings() {
  const [bookings, setBookings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setBookings(await fetchMyReservations());
    } catch (err) {
      setError(err.message || "Unable to load your bookings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const hasChangeClosed =
    bookings?.some((b) => b.status === "confirmed" && !b.changeable) ?? false;

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 flex flex-col">
      <Navbar />

      <main className="flex-1 w-full max-w-5xl mx-auto p-4 sm:p-6 lg:p-8">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">My bookings</h1>
            <p className="text-sm text-slate-600 mt-1">
              Your current and upcoming tables. Changes close 48 hours before the slot.
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
              onClick={load}
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
                Less than 48 hours to a slot: its booking can no longer be changed.
              </p>
            )}
            <ul className="space-y-4">
              {bookings.map((booking) => (
                <BookingCard key={booking.id} booking={booking} />
              ))}
            </ul>
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}
