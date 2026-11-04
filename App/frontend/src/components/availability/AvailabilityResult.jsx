import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, CalendarX2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

// Slot times come back in UTC, the hut works in Italian time
const HUT_TIME_ZONE = 'Europe/Rome';
// At or below this many free seats the badge turns orange ("Few seats")
const FEW_SEATS_LEFT = 5;

const formatTime = (iso) =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: HUT_TIME_ZONE });

const seatsLabel = (count) => `${count} ${count === 1 ? 'seat' : 'seats'}`;

const STATUS_STYLES = {
  available: { bar: 'bg-emerald-600', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-600' },
  limited: { bar: 'bg-orange-500', badge: 'bg-orange-50 text-orange-700 border-orange-200', dot: 'bg-orange-500' },
  unavailable: { bar: 'bg-slate-300', badge: 'bg-slate-100 text-slate-600 border-slate-200', dot: 'bg-slate-400' },
};

// BOOKING_CLOSED also covers slots that already started or ended today
function closedMessage(slot) {
  const now = Date.now();
  if (new Date(slot.endAt).getTime() <= now) return 'This slot is already over.';
  if (new Date(slot.startAt).getTime() <= now) return 'This slot has already started.';
  return 'Bookings close 2 hours before the slot starts.';
}

function describe(result) {
  const { available, reason, freeSeats, partySize, slot } = result;

  if (available && freeSeats <= FEW_SEATS_LEFT) {
    return { style: 'limited', badge: 'Few seats', message: `Only ${seatsLabel(freeSeats)} left in this slot.` };
  }
  if (available) {
    return { style: 'available', badge: 'Available', message: `${seatsLabel(freeSeats)} still free in this slot.` };
  }
  if (reason === 'BOOKING_CLOSED') {
    return { style: 'unavailable', badge: 'Booking closed', message: closedMessage(slot) };
  }
  if (reason === 'NOT_ENOUGH_SEATS') {
    if (freeSeats > 0) {
      return {
        style: 'unavailable',
        badge: 'Not enough seats',
        message: `Only ${seatsLabel(freeSeats)} left, not enough for ${partySize} people.`,
      };
    }
    return { style: 'unavailable', badge: 'Full', message: 'This slot is fully booked.' };
  }
  // A reason this page does not know yet
  return { style: 'unavailable', badge: 'Not available', message: 'This slot cannot be booked.' };
}

function BookAction({ result }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  // The search is in the URL, so login and registration can bring the user back to this result
  const location = useLocation();
  const from = location.pathname + location.search;

  if (!result.available) {
    return (
      <button
        type="button"
        disabled
        className="w-full sm:w-auto px-6 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-400 cursor-not-allowed"
      >
        Not available
      </button>
    );
  }

  // Booking is for hikers only (MH-01), visitors are sent to log in first
  if (!user) {
    return (
      <div className="flex flex-col items-stretch sm:items-end gap-1.5">
        <button
          type="button"
          onClick={() => navigate('/login', { state: { from } })}
          className="px-6 py-2.5 rounded-lg bg-emerald-700 text-white text-sm font-semibold hover:bg-emerald-800 transition-colors shadow-xs flex items-center justify-center gap-2"
        >
          Log in to book <ArrowRight className="w-4 h-4" />
        </button>
        <p className="text-xs text-slate-500 text-center sm:text-right">
          No account?{' '}
          <Link to="/register" state={{ from }} className="font-semibold text-emerald-700 hover:underline">
            Register
          </Link>
        </p>
      </div>
    );
  }

  // Staff accounts can check, but bookings belong to hikers
  if (user.role !== 'hiker') {
    return <p className="text-xs text-slate-500 text-center sm:text-right">Only hiker accounts can book.</p>;
  }

  return (
    <button
      type="button"
      onClick={() =>
        navigate('/book-table', {
          state: { date: result.date, slotId: result.slot.id, partySize: result.partySize },
        })
      }
      className="w-full sm:w-auto px-6 py-2.5 rounded-lg bg-emerald-700 text-white text-sm font-semibold hover:bg-emerald-800 transition-colors shadow-xs flex items-center justify-center gap-2"
    >
      Book this slot <ArrowRight className="w-4 h-4" />
    </button>
  );
}

// The professor asked for the split ("2 + 3 + 1 seats"), not for table numbers, and the design has none
function SeatingDetail({ allocation, partySize }) {
  const summary =
    allocation.length === 1
      ? `${partySize === 1 ? '1 person' : `All ${partySize} people`} at one table.`
      : `Split over ${allocation.length} tables: ${allocation.map((table) => table.seats).join(' + ')} seats.`;

  return (
    <div className="mt-5 pt-5 border-t border-slate-100">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">How your party would be seated</p>
      <p className="text-sm font-medium text-slate-800">{summary}</p>
      <p className="mt-3 text-xs text-slate-500">
        Tables can be shared with other parties. Seats are not held until you book.
      </p>
    </div>
  );
}

export default function AvailabilityResult({ result }) {
  if (result.reason === 'NO_SLOT') {
    return (
      <div className="flex flex-col items-center justify-center bg-white rounded-2xl border border-slate-100 text-center p-8">
        <CalendarX2 className="w-10 h-10 text-slate-400 mb-3" />
        <h3 className="text-lg font-bold text-slate-900 mb-1">No meal slot at this time</h3>
        <p className="text-slate-600 max-w-sm text-sm">
          The hut has no slot covering {result.time} on this day. Try a different date or time.
        </p>
      </div>
    );
  }

  const { style, badge, message } = describe(result);
  const styles = STATUS_STYLES[style];

  return (
    <article
      className={`relative overflow-hidden rounded-2xl border border-slate-100 shadow-xs ${
        result.available ? 'bg-white' : 'bg-slate-50'
      }`}
    >
      <div className={`absolute inset-y-0 left-0 w-1.5 ${styles.bar}`} />
      <div className="p-6 pl-8">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Meal slot</p>
            <p className={`text-3xl font-bold tracking-tight ${result.available ? 'text-slate-900' : 'text-slate-500'}`}>
              {formatTime(result.slot.startAt)} – {formatTime(result.slot.endAt)}
            </p>
            <p className="mt-1 text-sm text-slate-600">{message}</p>
          </div>

          <div className="flex flex-col items-stretch sm:items-end gap-3">
            <span
              className={`self-start sm:self-end inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${styles.badge}`}
            >
              <span className={`w-2 h-2 rounded-full ${styles.dot}`} />
              {badge}
            </span>
            <BookAction result={result} />
          </div>
        </div>

        {result.available && result.allocation && (
          <SeatingDetail allocation={result.allocation} partySize={result.partySize} />
        )}
      </div>
    </article>
  );
}
