import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CalendarSearch,
  Clock,
  Loader2,
  Mail,
  Phone,
  RefreshCcw,
  ShieldAlert,
  Table,
  UserPlus,
  Users,
  XCircle,
} from "lucide-react";
import Navbar from "../components/common/Navbar";
import Footer from "../components/common/Footer";
import BackToHomeLink from "../components/common/BackToHomeLink";
import RequirementsList from "../components/booking/RequirementsList";
import {
  fetchSlotsByDate,
  fetchStaffReservations,
} from "../services/reservationApi";
import {
  bookingReference,
  formatLongDate,
  formatTime,
  formatTimeRange,
  peopleLabel,
  todayAtHut,
} from "../utils/bookingFormat";

const STATUS_OPTIONS = [
  { value: "", label: "All" },
  { value: "confirmed", label: "Confirmed" },
  { value: "cancelled", label: "Cancelled" },
];

const fullName = (person) => `${person.firstName} ${person.lastName}`;

//One booking for the staff: who, how many, where they sit and what they cannot eat
function BookingCard({ booking }) {
  const cancelled = booking.status === "cancelled";
  const { hiker } = booking;

  return (
    <li
      data-testid={`staff-booking-${booking.id}`}
      className={`rounded-xl border bg-white shadow-xs overflow-hidden ${
        booking.hasAllergies && !cancelled
          ? "border-red-300 border-l-8 border-l-red-600"
          : "border-slate-200"
      } ${cancelled ? "opacity-70" : ""}`}
    >
      {/* Allergies are announced in words and with an icon, not only with the colour */}
      {booking.hasAllergies && !cancelled && (
        <p className="flex items-center gap-2 bg-red-50 text-red-800 text-xs font-bold uppercase tracking-wider px-4 py-2 border-b border-red-200">
          <ShieldAlert className="w-4 h-4" aria-hidden="true" />
          Allergies · special care needed
        </p>
      )}

      <div className="p-4 sm:p-5 grid grid-cols-1 md:grid-cols-[1.3fr_1fr_1.4fr] gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">
              {bookingReference(booking.id)}
            </span>
            {cancelled ? (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                <XCircle className="w-3 h-3" aria-hidden="true" /> Cancelled
              </span>
            ) : (
              <span className="text-xs font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full">
                Confirmed
              </span>
            )}
          </div>
          <p className="mt-1 text-base font-bold text-slate-900">
            {fullName(hiker)}
            {hiker.isTemporary && (
              <span className="ml-2 align-middle text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                Temporary
              </span>
            )}
          </p>
          <ul className="mt-1 space-y-0.5 text-sm text-slate-600">
            {hiker.phone && (
              <li className="flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5" aria-hidden="true" />{" "}
                {hiker.phone}
              </li>
            )}
            {hiker.email && (
              <li className="flex items-center gap-1.5 break-all">
                <Mail
                  className="w-3.5 h-3.5 flex-shrink-0"
                  aria-hidden="true"
                />{" "}
                {hiker.email}
              </li>
            )}
          </ul>
          {booking.createdBy && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
              <UserPlus className="w-3.5 h-3.5" aria-hidden="true" />
              Entered by {fullName(booking.createdBy)}
            </p>
          )}
          {cancelled && booking.cancelledAt && (
            <p className="mt-1 text-xs text-slate-500">
              Cancelled on {formatLongDate(booking.cancelledAt)} at{" "}
              {formatTime(booking.cancelledAt)}
              {booking.cancelledBy && ` by ${fullName(booking.cancelledBy)}`}
            </p>
          )}
        </div>

        <dl className="text-sm space-y-2">
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Party
            </dt>
            <dd className="flex items-center gap-1.5 font-semibold text-slate-900">
              <Users className="w-4 h-4 text-emerald-700" aria-hidden="true" />
              {peopleLabel(booking.partySize)}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Tables
            </dt>
            <dd className="text-slate-800">
              {booking.tables.length === 0 ? (
                <span className="text-slate-500">None</span>
              ) : (
                <ul className="flex flex-wrap gap-1.5 mt-0.5">
                  {booking.tables.map((table) => (
                    <li
                      key={table.tableNumber}
                      className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium"
                    >
                      <Table className="w-3 h-3" aria-hidden="true" />
                      Table {table.tableNumber} · {table.seats}{" "}
                      {table.seats === 1 ? "seat" : "seats"}
                    </li>
                  ))}
                </ul>
              )}
            </dd>
          </div>
        </dl>

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
            Requirements
          </p>
          <RequirementsList requirements={booking.requirements} />
          {hiker.notes && (
            <p className="mt-2 text-xs text-slate-600">
              <span className="font-semibold">Hiker notes:</span> {hiker.notes}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}

//MH-05: the staff choose a day (and optionally a slot or a status) and see the bookings
export default function StaffBookings() {
  const [date, setDate] = useState(todayAtHut());
  const [slotId, setSlotId] = useState("");
  const [status, setStatus] = useState("");

  const [slots, setSlots] = useState([]);
  const [bookings, setBookings] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  //The slots of the chosen day, for the optional slot filter
  useEffect(() => {
    if (!date) return undefined;
    let active = true;
    fetchSlotsByDate(date)
      .then((data) => active && setSlots(data || []))
      .catch(() => active && setSlots([]));
    return () => {
      active = false;
    };
  }, [date]);

  const loadBookings = useCallback(async () => {
    if (!date) return;
    setLoading(true);
    setError(null);
    try {
      setBookings(await fetchStaffReservations({ date, slotId, status }));
    } catch (err) {
      setBookings(null);
      setError(err.message || "Unable to load the bookings.");
    } finally {
      setLoading(false);
    }
  }, [date, slotId, status]);

  useEffect(() => {
    loadBookings();
  }, [loadBookings]);

  const handleDateChange = (value) => {
    setDate(value);
    //A slot belongs to one day: choosing another day clears it
    setSlotId("");
  };

  //Bookings grouped by slot, in the order the API returns them (by slot start)
  const groups = useMemo(() => {
    const bySlot = new Map();
    for (const booking of bookings ?? []) {
      const group = bySlot.get(booking.slot.id) ?? {
        slot: booking.slot,
        bookings: [],
      };
      group.bookings.push(booking);
      bySlot.set(booking.slot.id, group);
    }
    return [...bySlot.values()];
  }, [bookings]);

  const confirmed = (bookings ?? []).filter(
    (booking) => booking.status === "confirmed",
  );
  const peopleCount = confirmed.reduce(
    (total, booking) => total + booking.partySize,
    0,
  );
  const allergyCount = confirmed.filter(
    (booking) => booking.hasAllergies,
  ).length;

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 flex flex-col">
      <Navbar />

      <main className="flex-1 w-full max-w-6xl mx-auto p-4 sm:p-6 lg:p-8">
        <BackToHomeLink className="mb-6" />
        <h1 className="text-3xl font-extrabold tracking-tight">Bookings</h1>
        <p className="text-sm text-slate-600 mt-1 mb-6">
          Choose a day to see who is coming, where they sit and their dietary
          requirements.
        </p>

        <form
          className="bg-white rounded-2xl border border-slate-100 shadow-xs p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6"
          onSubmit={(e) => e.preventDefault()}
        >
          <label className="block">
            <span className="block text-xs font-semibold text-slate-600 uppercase mb-1">
              Day
            </span>
            <input
              type="date"
              value={date}
              onChange={(e) => handleDateChange(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-semibold text-slate-600 uppercase mb-1">
              Slot
            </span>
            <select
              value={slotId}
              onChange={(e) => setSlotId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
            >
              <option value="">All slots</option>
              {slots.map((slot) => (
                <option key={slot.id} value={slot.id}>
                  {formatTimeRange(slot.startAt, slot.endAt)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs font-semibold text-slate-600 uppercase mb-1">
              Status
            </span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </form>

        {!date ? (
          <p className="text-sm text-slate-500">
            Choose a day to see its bookings.
          </p>
        ) : loading ? (
          <p
            role="status"
            className="flex items-center justify-center gap-2 py-16 text-slate-500"
          >
            <Loader2 className="w-5 h-5 animate-spin" /> Loading bookings…
          </p>
        ) : error ? (
          <div
            role="alert"
            className="p-4 bg-red-50 border border-red-100 rounded-xl flex flex-wrap items-center gap-3 text-red-700 text-sm"
          >
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span className="flex-1">{error}</span>
            <button
              type="button"
              onClick={loadBookings}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 font-medium hover:bg-red-50"
            >
              <RefreshCcw className="w-4 h-4" /> Retry
            </button>
          </div>
        ) : bookings && bookings.length === 0 ? (
          <div className="flex flex-col items-center text-center bg-white rounded-2xl border border-slate-100 p-10">
            <CalendarSearch className="w-10 h-10 text-slate-400 mb-3" />
            <p className="font-semibold">
              No bookings for {formatLongDate(`${date}T12:00:00`)}
            </p>
            <p className="text-sm text-slate-500 mt-1">
              Try another day, slot or status.
            </p>
          </div>
        ) : bookings ? (
          <>
            <div
              className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-5 text-sm"
              aria-live="polite"
            >
              <span className="font-semibold">
                {bookings.length}{" "}
                {bookings.length === 1 ? "booking" : "bookings"}
              </span>
              <span className="text-slate-600">
                {peopleLabel(peopleCount)} confirmed
              </span>
              {allergyCount > 0 ? (
                <span className="inline-flex items-center gap-1.5 font-bold text-red-700">
                  <ShieldAlert className="w-4 h-4" aria-hidden="true" />
                  {allergyCount} {allergyCount === 1 ? "booking" : "bookings"}{" "}
                  with allergies
                </span>
              ) : (
                <span className="text-slate-600">No allergies</span>
              )}
            </div>

            <div className="space-y-8">
              {groups.map(({ slot, bookings: slotBookings }) => (
                <section key={slot.id} aria-labelledby={`slot-${slot.id}`}>
                  <h2
                    id={`slot-${slot.id}`}
                    className="flex items-center gap-2 text-base font-bold text-slate-900 mb-3"
                  >
                    <Clock
                      className="w-4 h-4 text-emerald-700"
                      aria-hidden="true"
                    />
                    {formatTimeRange(slot.startAt, slot.endAt)}
                    <span className="text-sm font-normal text-slate-500">
                      · {slotBookings.length}{" "}
                      {slotBookings.length === 1 ? "booking" : "bookings"}
                    </span>
                  </h2>
                  <ul className="space-y-3">
                    {slotBookings.map((booking) => (
                      <BookingCard key={booking.id} booking={booking} />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </>
        ) : null}
      </main>

      <Footer />
    </div>
  );
}
