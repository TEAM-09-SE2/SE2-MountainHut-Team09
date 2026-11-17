import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Calendar,
  Clock,
  Users,
  UserPlus,
  AlertCircle,
  Loader2,
  ShieldAlert,
  Utensils,
  Phone,
  Mail,
  Globe,
  UserCheck,
  FileText,
} from "lucide-react";
import Navbar from "../components/common/Navbar";
import {
  fetchStaffReservations,
  fetchSlotsByDate,
} from "../services/reservationApi";
import {
  todayAtHut,
  formatLongDate,
  formatTimeRange,
  bookingReference,
  peopleLabel,
} from "../utils/bookingFormat";

export default function StaffBookings() {
  const [date, setDate] = useState(todayAtHut);
  const [slotId, setSlotId] = useState("");
  const [slots, setSlots] = useState([]);
  const [status, setStatus] = useState("all");

  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load slots for the selected date so staff can narrow down by meal shift
  useEffect(() => {
    setSlotId("");
    if (!date) {
      setSlots([]);
      return;
    }

    let cancelled = false;
    fetchSlotsByDate(date)
      .then((data) => {
        if (!cancelled) {
          setSlots(Array.isArray(data) ? data : []);
        }
      })
      .catch(() => {
        if (!cancelled) setSlots([]);
      });

    return () => {
      cancelled = true;
    };
  }, [date]);

  useEffect(() => {
    let cancelled = false;

    const loadBookings = async () => {
      setLoading(true);
      setError(null);
      try {
        const filters = {};
        if (date) filters.date = date;
        if (slotId) filters.slotId = slotId;
        if (status !== "all") filters.status = status;

        const data = await fetchStaffReservations(filters);
        if (!cancelled) {
          setBookings(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Could not load reservations.");
          setBookings([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadBookings();
    return () => {
      cancelled = true;
    };
  }, [date, slotId, status]);

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <span className="inline-block bg-emerald-50 text-emerald-700 border border-emerald-200/60 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-2">
              Staff Desk
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Hut reservations
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              View bookings, dietary requirements, temporary guests, and who entered each reservation.
            </p>
          </div>

          <Link
            to="/staff/reserve"
            className="inline-flex items-center justify-center gap-2 py-2.5 px-4 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold rounded-lg shadow-xs transition-colors text-sm"
          >
            <UserPlus className="w-4 h-4" />
            <span>Reserve for a hiker</span>
          </Link>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl shadow-xs border border-gray-100 p-4 sm:p-5 mb-6 flex flex-col sm:flex-row flex-wrap gap-4 items-end">
          <label className="block w-full sm:w-auto">
            <span className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
              Date (hut time)
            </span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full sm:w-44 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
          </label>

          {date && slots.length > 0 && (
            <label className="block w-full sm:w-auto">
              <span className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                Time slot
              </span>
              <select
                value={slotId}
                onChange={(e) => setSlotId(e.target.value)}
                className="w-full sm:w-48 rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
              >
                <option value="">All slots</option>
                {slots.map((s) => (
                  <option key={s.id} value={s.id}>
                    {formatTimeRange(s.startAt, s.endAt)}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="block w-full sm:w-auto">
            <span className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
              Status
            </span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full sm:w-44 rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
            >
              <option value="all">All statuses</option>
              <option value="confirmed">Confirmed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>

          {date && (
            <button
              type="button"
              onClick={() => setDate("")}
              className="cursor-pointer text-xs font-semibold text-slate-600 hover:text-emerald-700 py-2 px-2"
            >
              Show all dates
            </button>
          )}
        </div>

        {error && (
          <div
            role="alert"
            className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-red-800 text-sm"
          >
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-slate-500 text-sm">
            <Loader2 className="w-5 h-5 animate-spin text-emerald-700" />
            <span>Loading reservations...</span>
          </div>
        ) : bookings.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
            No reservations found for the selected filters.
          </div>
        ) : (
          <ul className="space-y-4">
            {bookings.map((booking) => {
              const isTemporary = Boolean(booking.hiker?.isTemporary);
              const isCancelled = booking.status === "cancelled";

              return (
                <li
                  key={booking.id}
                  className={`bg-white rounded-2xl shadow-xs border p-5 sm:p-6 space-y-4 ${
                    isCancelled ? "border-slate-200 opacity-75" : "border-gray-100"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                          {bookingReference(booking.id)}
                        </span>
                        <span
                          className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${
                            isCancelled
                              ? "bg-slate-100 text-slate-700"
                              : "bg-emerald-100 text-emerald-800"
                          }`}
                        >
                          {isCancelled ? "Cancelled" : "Confirmed"}
                        </span>
                        {booking.hasAllergies && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-red-100 text-red-800">
                            <ShieldAlert className="w-3 h-3" />
                            Allergies
                          </span>
                        )}
                      </div>

                      <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                        <h2 className="text-lg font-bold text-slate-900">
                          {booking.hiker?.firstName} {booking.hiker?.lastName}
                        </h2>
                        {isTemporary && (
                          <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800">
                            Temporary hiker
                          </span>
                        )}
                      </div>

                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                        {booking.hiker?.email && (
                          <span className="inline-flex items-center gap-1">
                            <Mail className="w-3.5 h-3.5" />
                            {booking.hiker.email}
                          </span>
                        )}
                        {booking.hiker?.phone && (
                          <span className="inline-flex items-center gap-1">
                            <Phone className="w-3.5 h-3.5" />
                            {booking.hiker.phone}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Entered by (MH-07) */}
                    <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200/80 rounded-xl px-3 py-2 self-start">
                      {booking.createdBy ? (
                        <span className="inline-flex items-center gap-1.5">
                          <UserCheck className="w-3.5 h-3.5 text-emerald-700" />
                          <span>
                            Entered by{" "}
                            <strong className="text-slate-900">
                              {booking.createdBy.firstName} {booking.createdBy.lastName}
                            </strong>{" "}
                            <span className="capitalize text-slate-500">
                              ({booking.createdBy.role})
                            </span>
                          </span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5">
                          <Globe className="w-3.5 h-3.5 text-slate-500" />
                          <span>Booked via web</span>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-100 text-xs sm:text-sm">
                    <div className="flex items-center gap-2 text-slate-700">
                      <Calendar className="w-4 h-4 text-emerald-700 flex-shrink-0" />
                      <span>{formatLongDate(booking.slot.startAt)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-700">
                      <Clock className="w-4 h-4 text-emerald-700 flex-shrink-0" />
                      <span>
                        {formatTimeRange(booking.slot?.startAt, booking.slot?.endAt)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-700">
                      <Users className="w-4 h-4 text-emerald-700 flex-shrink-0" />
                      <span>
                        <strong>{peopleLabel(booking.partySize)}</strong>
                        {Array.isArray(booking.tables) && booking.tables.length > 0 && (
                          <span className="text-slate-500">
                            {" "}
                            · Tables {booking.tables.map((t) => `#${t.tableNumber}`).join(", ")}
                          </span>
                        )}
                      </span>
                    </div>
                  </div>

                  {booking.hiker?.notes && (
                    <div className="pt-2 border-t border-slate-100 flex items-start gap-1.5 text-xs text-slate-600">
                      <FileText className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 mt-0.5" />
                      <span>
                        <strong className="text-slate-700">Hiker notes:</strong>{" "}
                        {booking.hiker.notes}
                      </span>
                    </div>
                  )}

                  {Array.isArray(booking.requirements) && booking.requirements.length > 0 && (
                    <div className="pt-2 border-t border-slate-100">
                      <ul className="space-y-1 text-xs text-slate-700">
                        {booking.requirements.map((req) => (
                          <li key={req.id} className="flex items-center gap-1.5">
                            <Utensils className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                            <span>
                              <strong>{req.peopleCount} ×</strong>{" "}
                              {req.hasAllergies && (
                                <span className="font-semibold text-red-700">ALLERGY: </span>
                              )}
                              {req.description}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}