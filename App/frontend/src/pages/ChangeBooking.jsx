import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Loader2,
  Mail,
  Minus,
  Plus,
} from "lucide-react";
import Navbar from "../components/common/Navbar";
import Footer from "../components/common/Footer";
import RequirementsEditor from "../components/booking/RequirementsEditor";
import RequirementsList from "../components/booking/RequirementsList";
import {
  changeReservation,
  fetchMyReservations,
  fetchSlotsByDate,
} from "../services/reservationApi";
import {
  bookingReference,
  formatLongDate,
  formatTimeRange,
  peopleLabel,
  requirementsKey,
  toHutDate,
  todayAtHut,
  toRequirementsPayload,
  validateRequirements,
} from "../utils/bookingFormat";

const ERROR_MESSAGES = {
  CHANGE_CLOSED: "Changes close 48 hours before the slot, so this booking can no longer be changed.",
  BOOKING_CLOSED: "The new slot closes for bookings 2 hours before it starts.",
  ALREADY_BOOKED: "You already have a confirmed booking in the chosen slot.",
  RESERVATION_CANCELLED: "This booking is cancelled and cannot be changed.",
  RESERVATION_NOT_FOUND: "This booking does not exist.",
};

//Editable copy of the requirements: the description is always a string while typing
const toEditable = (requirements) =>
  (requirements ?? []).map(({ peopleCount, hasAllergies, description }) => ({
    peopleCount,
    hasAllergies,
    description,
  }));

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 flex flex-col">
      <Navbar />
      <main className="flex-1 w-full max-w-5xl mx-auto p-4 sm:p-6 lg:p-8">
        <Link
          to="/my-bookings"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-emerald-700 transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" /> My bookings
        </Link>
        {children}
      </main>
      <Footer />
    </div>
  );
}

function BookingSummaryCard({ title, slot, partySize, requirements }) {
  return (
    <aside className="bg-emerald-900 text-emerald-50 rounded-2xl p-6 h-fit">
      <p className="text-[11px] font-semibold tracking-wide uppercase text-emerald-200">
        {title}
      </p>
      <p className="text-xl font-bold mt-2">{formatLongDate(slot.startAt)}</p>
      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-emerald-200">Time</dt>
          <dd>{formatTimeRange(slot.startAt, slot.endAt)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-emerald-200">Party</dt>
          <dd>{peopleLabel(partySize)}</dd>
        </div>
        {requirements && (
          <div className="flex justify-between gap-4">
            <dt className="text-emerald-200">Requirements</dt>
            <dd>{requirements.length === 0 ? "None" : requirements.length}</dd>
          </div>
        )}
      </dl>
      <p className="mt-4 pt-4 border-t border-emerald-700 text-xs text-emerald-200">
        Tables are assigned automatically.
      </p>
    </aside>
  );
}

//MH-06: the form starts with the current booking and only sends what the hiker changed
export default function ChangeBooking() {
  const { id } = useParams();

  const [booking, setBooking] = useState(null);
  const [loadError, setLoadError] = useState(null);

  const [date, setDate] = useState("");
  const [slotId, setSlotId] = useState(null);
  const [partySize, setPartySize] = useState(1);
  const [requirements, setRequirements] = useState([]);

  const [slots, setSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [outcome, setOutcome] = useState(null); // { type: 'updated' | 'no-seats', ... }

  useEffect(() => {
    let active = true;
    fetchMyReservations()
      .then((bookings) => {
        if (!active) return;
        const found = bookings.find((b) => String(b.id) === String(id));
        if (!found) {
          setLoadError("We could not find this booking.");
          return;
        }
        setBooking(found);
        setDate(toHutDate(found.slot.startAt));
        setSlotId(found.slot.id);
        setPartySize(found.partySize);
        setRequirements(toEditable(found.requirements));
      })
      .catch((err) => {
        if (active) setLoadError(err.message || "Unable to load your booking.");
      });
    return () => {
      active = false;
    };
  }, [id]);

  useEffect(() => {
    if (!date) return undefined;
    let active = true;
    setSlotsLoading(true);
    setSlotsError(null);
    fetchSlotsByDate(date)
      .then((data) => active && setSlots(data || []))
      .catch(() => {
        if (active) {
          setSlots([]);
          setSlotsError("Unable to load the time slots for this date.");
        }
      })
      .finally(() => active && setSlotsLoading(false));
    return () => {
      active = false;
    };
  }, [date]);

  const selectedSlot = slots.find((s) => s.id === slotId) ?? null;
  const validation = validateRequirements(requirements, partySize);
  const requirementsValid =
    !validation.totalError && validation.rowErrors.every((e) => e === null);

  const changes = useMemo(() => {
    if (!booking) return {};
    const result = {};
    if (slotId !== booking.slot.id) result.slotId = slotId;
    if (partySize !== booking.partySize) result.partySize = partySize;
    if (requirementsKey(requirements) !== requirementsKey(toEditable(booking.requirements))) {
      result.requirements = toRequirementsPayload(requirements);
    }
    return result;
  }, [booking, slotId, partySize, requirements]);

  const hasChanges = Object.keys(changes).length > 0;
  const hasValidSlot = selectedSlot && toHutDate(selectedSlot.startAt) === date;
  const canSave =
    hasChanges && requirementsValid && hasValidSlot && partySize >= 1 &&
    !slotsLoading && !slotsError && !submitting;

  const handleDateChange = (value) => {
    if (value === date) return;
    setDate(value);
    setSlots([]);
    setSlotsLoading(Boolean(value));
    setSlotsError(null);
    //A slot of another day is not valid for the new date: choose again
    setSlotId(value === toHutDate(booking.slot.startAt) ? booking.slot.id : null);
    setError(null);
  };

  const handleSave = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const updated = await changeReservation(booking.id, changes);
      setOutcome({
        type: "updated",
        booking: updated,
        slot: selectedSlot ?? booking.slot,
      });
    } catch (err) {
      if (err.code === "NOT_ENOUGH_SEATS") {
        setOutcome({ type: "no-seats" });
      } else {
        setError(
          ERROR_MESSAGES[err.code] ||
            err.message ||
            "An error occurred while changing the booking.",
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loadError) {
    return (
      <Shell>
        <div role="alert" className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3 text-red-700 text-sm">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" /> {loadError}
        </div>
      </Shell>
    );
  }

  if (!booking) {
    return (
      <Shell>
        <div role="status" className="flex items-center justify-center gap-2 py-16 text-slate-500">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading your booking…
        </div>
      </Shell>
    );
  }

  if (!booking.changeable && outcome?.type !== "updated") {
    return (
      <Shell>
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center max-w-lg mx-auto">
          <AlertTriangle className="w-10 h-10 text-amber-600 mx-auto mb-3" />
          <h1 className="text-xl font-bold">This booking cannot be changed</h1>
          <p className="text-sm text-slate-600 mt-2 mb-5">
            {booking.status === "cancelled"
              ? "A cancelled booking cannot be changed."
              : "Changes close 48 hours before the slot."}
          </p>
          <Link to="/my-bookings" className="inline-flex rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-800 transition-colors">
            Back to my bookings
          </Link>
        </div>
      </Shell>
    );
  }

  if (outcome?.type === "updated") {
    const { booking: updated, slot } = outcome;
    return (
      <Shell>
        <h1 className="text-3xl font-extrabold tracking-tight mb-1">Booking updated</h1>
        <p className="text-sm text-slate-600 mb-6">Outcome of the change and status of the email.</p>

        <div className="max-w-2xl bg-white border border-emerald-100 rounded-2xl p-6 shadow-xs">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-8 h-8 text-emerald-600 flex-shrink-0" />
            <div>
              <h2 className="text-lg font-bold">Change confirmed</h2>
              <p className="text-sm text-slate-600">Your booking has been updated.</p>
            </div>
          </div>

          <dl className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-[11px] font-semibold tracking-wide uppercase text-slate-500">Booking</dt>
              <dd className="font-medium">{bookingReference(updated.id)} · Confirmed</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold tracking-wide uppercase text-slate-500">Date</dt>
              <dd className="font-medium">{formatLongDate(slot.startAt)}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold tracking-wide uppercase text-slate-500">Time</dt>
              <dd className="font-medium">{formatTimeRange(slot.startAt, slot.endAt)}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold tracking-wide uppercase text-slate-500">Party</dt>
              <dd className="font-medium">{peopleLabel(updated.partySize)}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-[11px] font-semibold tracking-wide uppercase text-slate-500 mb-1">Requirements</dt>
              <dd><RequirementsList requirements={updated.requirements} /></dd>
            </div>
          </dl>

          {/* The change stays valid even when the email could not be sent */}
          {updated.confirmationSent ? (
            <div className="mt-5 p-4 bg-emerald-50 border border-emerald-100 rounded-xl flex items-start gap-3 text-emerald-800 text-sm">
              <Mail className="w-5 h-5 flex-shrink-0" />
              <span>An update email has been sent.</span>
            </div>
          ) : (
            <div className="mt-5 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3 text-amber-800 text-sm">
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
              <span>
                Your booking is updated, but we could not send the update email. Keep your
                booking reference <strong>{bookingReference(updated.id)}</strong>.
              </span>
            </div>
          )}

          <Link to="/my-bookings" className="mt-6 inline-flex rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-800 transition-colors">
            My bookings
          </Link>
        </div>
      </Shell>
    );
  }

  if (outcome?.type === "no-seats") {
    return (
      <Shell>
        <div role="alert" className="max-w-2xl bg-white border border-amber-200 rounded-2xl p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-8 h-8 text-amber-600 flex-shrink-0" />
            <div>
              <h1 className="text-lg font-bold">Change refused</h1>
              <p className="text-sm text-slate-700 mt-1">
                There are not enough seats in the chosen slot. Your original booking is unchanged.
              </p>
              <p className="text-sm text-slate-600 mt-1">
                Choose another slot or go back to your bookings.
              </p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setOutcome(null)}
              className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-800 transition-colors"
            >
              Choose another slot
            </button>
            <Link to="/my-bookings" className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-800 hover:border-emerald-600 transition-colors">
              Back to my bookings
            </Link>
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="text-3xl font-extrabold tracking-tight">Change booking</h1>
      <p className="text-sm text-slate-600 mt-1 mb-6">
        {bookingReference(booking.id)} · change the slot, the party size or the requirements.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <form
          className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-100 shadow-xs space-y-8"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSave) handleSave();
          }}
        >
          {error && (
            <div role="alert" className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3 text-red-700 text-sm">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <section className="space-y-4">
            <h2 className="text-base font-bold">Date and time</h2>
            <label className="block max-w-xs">
              <span className="block text-xs font-medium text-slate-600 mb-1">Date</span>
              <input
                type="date"
                value={date}
                min={todayAtHut()}
                onChange={(e) => handleDateChange(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </label>

            <fieldset>
              <legend className="block text-xs font-medium text-slate-600 mb-2">Time slot</legend>
              {slotsLoading && (
                <p role="status" className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading slots…
                </p>
              )}
              {slotsError && <p role="alert" className="text-sm text-red-700">{slotsError}</p>}
              {!slotsLoading && !slotsError && slots.length === 0 && (
                <p className="text-sm text-slate-500">No slots on this date.</p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {slots.map((slot) => {
                  const isCurrent = slot.id === booking.slot.id;
                  //The seats of the current slot include the ones of this booking, so the API decides
                  const full = !isCurrent && slot.freeSeats < partySize;
                  const disabled = !slot.bookable || full;
                  const selected = slot.id === slotId;
                  return (
                    <button
                      key={slot.id}
                      type="button"
                      disabled={disabled}
                      aria-pressed={selected}
                      onClick={() => {
                        setSlotId(slot.id);
                        setError(null);
                      }}
                      className={`text-left rounded-xl border p-3 transition-colors ${
                        selected
                          ? "border-emerald-600 bg-emerald-50 ring-1 ring-emerald-600"
                          : "border-slate-200 bg-white hover:border-emerald-400"
                      } disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-slate-200`}
                    >
                      <span className="flex items-center gap-1.5 text-sm font-semibold">
                        <Clock className="w-4 h-4 text-emerald-700" />
                        {formatTimeRange(slot.startAt, slot.endAt)}
                      </span>
                      <span className="block text-xs text-slate-600 mt-1">
                        {!slot.bookable
                          ? "Closed for booking"
                          : full
                            ? "Not enough seats"
                            : isCurrent
                              ? "Current slot"
                              : `${slot.freeSeats} seats free`}
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
          </section>

          <section>
            <h2 className="text-base font-bold mb-3">Party size</h2>
            <div className="inline-flex items-center gap-3">
              <button
                type="button"
                aria-label="Decrease party size"
                disabled={partySize <= 1}
                onClick={() => setPartySize((n) => n - 1)}
                className="w-9 h-9 rounded-lg border border-slate-300 flex items-center justify-center hover:border-emerald-600 disabled:opacity-40"
              >
                <Minus className="w-4 h-4" />
              </button>
              <span aria-live="polite" className="w-24 text-center text-sm font-semibold">
                {peopleLabel(partySize)}
              </span>
              <button
                type="button"
                aria-label="Increase party size"
                onClick={() => setPartySize((n) => n + 1)}
                className="w-9 h-9 rounded-lg border border-slate-300 flex items-center justify-center hover:border-emerald-600"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </section>

          <RequirementsEditor
            requirements={requirements}
            partySize={partySize}
            onChange={setRequirements}
          />

          <div className="border-t border-slate-100 pt-5">
            <h2 className="text-base font-bold mb-2">Summary of the changes</h2>
            {hasChanges ? (
              <ul className="text-sm text-slate-700 space-y-1 mb-4">
                {"slotId" in changes && (
                  <li>
                    Slot: {formatLongDate(booking.slot.startAt)}, {formatTimeRange(booking.slot.startAt, booking.slot.endAt)}
                    {" → "}
                    {selectedSlot
                      ? `${formatLongDate(selectedSlot.startAt)}, ${formatTimeRange(selectedSlot.startAt, selectedSlot.endAt)}`
                      : "choose a slot"}
                  </li>
                )}
                {"partySize" in changes && (
                  <li>Party: {peopleLabel(booking.partySize)} → {peopleLabel(partySize)}</li>
                )}
                {"requirements" in changes && (
                  <li>
                    Requirements: {booking.requirements.length} → {requirements.length}
                  </li>
                )}
              </ul>
            ) : (
              <p className="text-sm text-slate-500 mb-4">No changes yet.</p>
            )}

            <div className="flex flex-wrap justify-end gap-3">
              <Link to="/my-bookings" className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-800 hover:border-slate-400 transition-colors">
                Cancel
              </Link>
              <button
                type="submit"
                disabled={!canSave}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Save changes
              </button>
            </div>
          </div>
        </form>

        <div className="space-y-4">
          <BookingSummaryCard
            title="Current booking"
            slot={booking.slot}
            partySize={booking.partySize}
            requirements={booking.requirements}
          />
          <div className="bg-slate-100 rounded-2xl p-5 text-sm text-slate-700 space-y-3">
            <p>
              <strong>Before saving.</strong> Availability is checked again. If there are not enough
              seats, your current booking stays unchanged.
            </p>
            <p>
              <strong>Deadline.</strong> Changes close 48 hours before the start of the current slot.
            </p>
          </div>
        </div>
      </div>
    </Shell>
  );
}
