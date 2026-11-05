import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Calendar, Clock, Users, CheckCircle2, AlertTriangle, ArrowRight, ArrowLeft, Loader2, Table } from 'lucide-react';
import { fetchSlotsByDate, createReservation } from '../../services/reservationApi';
import BackToHomeLink from '../common/BackToHomeLink';

//Slots are at the hut: dates and times are shown in hut time, whatever the browser's time zone
const HUT_TIME_ZONE = 'Europe/Rome';
const todayAtHut = () => new Date().toLocaleDateString('en-CA', { timeZone: HUT_TIME_ZONE });

export default function BookTableWizard() {
  const location = useLocation();
  const prefill = location.state || {};

  // Initialize state with prefilled values if available
  const [date, setDate] = useState(prefill.date || todayAtHut());
  const [partySize, setPartySize] = useState(prefill.partySize ? Number(prefill.partySize) : 2);
  const [selectedSlot, setSelectedSlot] = useState(null);

  // Jump to Step 3 if coming from Availability with a slot pre-selected
  const [step, setStep] = useState(prefill.slotId ? 3 : 1);

  // API state & result
  const [slots, setSlots] = useState([]);
  const [bookingResult, setBookingResult] = useState(null);
  
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [bookingSuccess, setBookingSuccess] = useState(false);

  // Load available slots on date change
  useEffect(() => {
    async function loadSlots() {
      try {
        setLoading(true);
        setError(null);
        const data = await fetchSlotsByDate(date);
        const fetchedSlots = data || [];
        setSlots(fetchedSlots);

        // Auto-select slot if slotId was passed via location.state
        if (prefill.slotId) {
          const matchedSlot = fetchedSlots.find((s) => s.id === Number(prefill.slotId));
          if (matchedSlot) {
            setSelectedSlot(matchedSlot);
          }
        }
      } catch (err) {
        setError("Unable to fetch available time slots for the selected date.");
      } finally {
        setLoading(false);
      }
    }
    loadSlots();
  }, [date]);

  const handleConfirmBooking = async () => {
    if (!selectedSlot) return;

    setSubmitting(true);
    setError(null);

    try {
      const result = await createReservation(selectedSlot.id, partySize);
      setBookingResult(result);
      setBookingSuccess(true);
    } catch (err) {
      if (err.code === "ALREADY_BOOKED") {
        setError("You already have a confirmed booking for this slot.");
      } else if (err.code === "BOOKING_CLOSED" || err.status === 422) {
        setError("Bookings close 2 hours before the slot starts.");
      } else if (err.code === "NOT_ENOUGH_SEATS") {
        setError("Not enough free seats for the requested party size.");
      } else {
        setError(err.message || "An error occurred while creating the reservation.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const formatTime = (isoString) => {
    if (!isoString) return '';
    return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: HUT_TIME_ZONE });
  };

  if (bookingSuccess && bookingResult) {
    //Table numbers are not shown to the hiker: the staff assigns the seats at the hut
    return (
      <div className="max-w-xl mx-auto my-12">
      {/* Always visible, so the hiker can leave the wizard at any step */}
      <BackToHomeLink className="mb-6" />
      <div className="p-8 bg-white rounded-2xl border border-emerald-100 text-center shadow-xs">
        <CheckCircle2 className="w-16 h-16 text-emerald-600 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-slate-900">Booking Confirmed!</h2>
        <p className="text-slate-600 mt-2 text-sm">
          Reservation <strong>#{bookingResult.id}</strong> confirmed for <strong>{partySize} guests</strong>.
        </p>

        <div className="mt-6 p-4 bg-slate-50 rounded-xl border border-slate-200 text-sm text-slate-700 flex items-center justify-center gap-4">
          <span className="flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-emerald-700" />
            {new Date(bookingResult.startAt).toLocaleDateString([], { timeZone: HUT_TIME_ZONE })}
          </span>
          <span className="flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-emerald-700" />
            {formatTime(selectedSlot?.startAt ?? bookingResult.startAt)} – {formatTime(selectedSlot?.endAt)}
          </span>
        </div>
      </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
      {/* Always visible, so the hiker can leave the wizard at any step */}
      <BackToHomeLink className="mb-6" />

      {/* Wizard Header Stepper */}
      <div className="flex items-center justify-between mb-8 border-b border-slate-200 pb-4">
        {[
          { num: 1, label: "Date & Time" },
          { num: 2, label: "Guests" },
          { num: 3, label: "Assignment" },
          { num: 4, label: "Confirm" }
        ].map((s) => (
          <div key={s.num} className={`flex items-center gap-2 ${step === s.num ? 'text-emerald-700 font-bold' : step > s.num ? 'text-slate-900 font-medium' : 'text-slate-400'}`}>
            <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs ${step === s.num ? 'bg-emerald-700 text-white' : step > s.num ? 'bg-slate-200 text-slate-800' : 'bg-slate-100 text-slate-400'}`}>
              {s.num}
            </span>
            <span className="hidden sm:inline text-sm">{s.label}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-100 shadow-xs">
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3 text-red-700 text-sm">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* STEP 1: Date & Time Picker */}
          {step === 1 && (
            <div>
              <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-emerald-700" /> Select Date & Time
              </h3>

              <div className="mb-6">
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-2">Meal Date</label>
                <input
                  type="date"
                  value={date}
                  min={todayAtHut()}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-600 focus:outline-none text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-2">Available Time Slots</label>
                {loading ? (
                  <div className="flex items-center gap-2 text-slate-500 py-4 text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading slots...
                  </div>
                ) : slots.length === 0 ? (
                  <p className="text-sm text-slate-500">No available slots for this date.</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {slots.map((s) => {
                      const isDisabled = !s.bookable || s.freeSeats < 1;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          disabled={isDisabled}
                          onClick={() => setSelectedSlot(s)}
                          className={`p-3 text-sm font-semibold rounded-xl border text-center transition-all ${
                            selectedSlot?.id === s.id
                              ? 'bg-emerald-700 text-white border-emerald-700 shadow-xs'
                              : isDisabled
                              ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                              : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-emerald-600'
                          }`}
                        >
                          <div className="font-bold">{formatTime(s.startAt)}</div>
                          <div className="text-[11px] opacity-80 mt-0.5">
                            {!s.bookable ? "Closed (<2h)" : `${s.freeSeats} seats free`}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <button
                disabled={!selectedSlot}
                onClick={() => setStep(2)}
                className="mt-8 w-full py-3 bg-emerald-700 text-white font-semibold rounded-xl hover:bg-emerald-800 disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
              >
                <span>Continue to party size</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* STEP 2: Party Size Stepper */}
          {step === 2 && (
            <div>
              <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                <Users className="w-5 h-5 text-emerald-700" /> Select Party Size
              </h3>

              <div className="flex items-center justify-center gap-6 my-8 py-6 bg-slate-50 rounded-2xl border border-slate-100">
                <button
                  type="button"
                  onClick={() => setPartySize(Math.max(1, partySize - 1))}
                  className="w-12 h-12 rounded-xl bg-white border border-slate-200 font-bold text-xl text-slate-700 hover:bg-slate-100 flex items-center justify-center"
                >
                  -
                </button>
                <div className="text-center">
                  <span className="text-4xl font-extrabold text-slate-900">{partySize}</span>
                  <span className="block text-xs font-medium text-slate-500 mt-1">guests</span>
                </div>
                <button
                  type="button"
                  onClick={() => setPartySize(partySize + 1)}
                  className="w-12 h-12 rounded-xl bg-white border border-slate-200 font-bold text-xl text-slate-700 hover:bg-slate-100 flex items-center justify-center"
                >
                  +
                </button>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(1)}
                  className="w-1/3 py-3 border border-slate-200 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 flex items-center justify-center gap-1 text-sm"
                >
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
                <button
                  onClick={() => setStep(3)}
                  className="w-2/3 py-3 bg-emerald-700 text-white font-semibold rounded-xl hover:bg-emerald-800 flex items-center justify-center gap-2 text-sm"
                >
                  <span>Check Table Assignment</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Automatic Table Assignment Preview */}
          {step === 3 && (
            <div>
              <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                <Table className="w-5 h-5 text-emerald-700" /> Assignment Verification
              </h3>

              {selectedSlot && selectedSlot.freeSeats >= partySize ? (
                <div className="space-y-4">
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
                    <span className="text-sm font-semibold text-emerald-800">Seat Availability:</span>
                    <span className="px-3 py-1 bg-emerald-600 text-white text-xs font-bold rounded-full uppercase">
                      Valid ({selectedSlot.freeSeats} free seats)
                    </span>
                  </div>

                  {partySize > 6 && (
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3 text-amber-800 text-xs">
                      <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
                      <div>
                        <span className="font-bold block text-sm">Multi-table allocation</span>
                        For large groups of {partySize} people, the system will automatically allocate multiple adjacent tables upon confirmation.
                      </div>
                    </div>
                  )}

                  <div className="flex gap-3 pt-4">
                    <button
                      onClick={() => setStep(2)}
                      className="w-1/3 py-3 border border-slate-200 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 flex items-center justify-center gap-1 text-sm"
                    >
                      <ArrowLeft className="w-4 h-4" /> Modify
                    </button>
                    <button
                      onClick={() => setStep(4)}
                      className="w-2/3 py-3 bg-emerald-700 text-white font-semibold rounded-xl hover:bg-emerald-800 flex items-center justify-center gap-2 text-sm"
                    >
                      Proceed to summary <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-6">
                  <p className="text-red-600 font-semibold text-sm">
                    {loading ? "Verifying availability..." : `Not enough free seats in this slot for ${partySize} people (${selectedSlot?.freeSeats || 0} available).`}
                  </p>
                  <button onClick={() => setStep(1)} className="mt-4 px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-sm font-medium">
                    Change Date or Slot
                  </button>
                </div>
              )}
            </div>
          )}

          {/* STEP 4: Review & Confirm */}
          {step === 4 && (
            <div>
              <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-700" /> Summary & Confirmation
              </h3>

              <div className="space-y-3 mb-6 text-sm text-slate-700">
                <div className="flex justify-between py-2 border-b border-slate-100">
                  <span className="text-slate-500">Date:</span>
                  <span className="font-semibold">{date}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-100">
                  <span className="text-slate-500">Time:</span>
                  <span className="font-semibold">{formatTime(selectedSlot?.startAt)}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-100">
                  <span className="text-slate-500">Guests:</span>
                  <span className="font-semibold">{partySize} guests</span>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(3)}
                  className="w-1/3 py-3 border border-slate-200 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 flex items-center justify-center gap-1 text-sm"
                >
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
                <button
                  onClick={handleConfirmBooking}
                  disabled={submitting}
                  className="w-2/3 py-3 bg-emerald-700 text-white font-semibold rounded-xl hover:bg-emerald-800 disabled:opacity-60 flex items-center justify-center gap-2 text-sm"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Processing...</span>
                    </>
                  ) : (
                    <span>Confirm Reservation</span>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Sticky Booking Summary Panel */}
        <div className="lg:col-span-1">
          <div className="sticky top-24 bg-slate-900 text-white p-6 rounded-2xl shadow-md">
            <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 mb-4">
              Booking Summary
            </h4>

            <div className="space-y-4 text-sm">
              <div className="flex items-center gap-3">
                <Calendar className="w-4 h-4 text-slate-400" />
                <span>{date}</span>
              </div>
              <div className="flex items-center gap-3">
                <Clock className="w-4 h-4 text-slate-400" />
                <span>{selectedSlot ? formatTime(selectedSlot.startAt) : "Time to be selected"}</span>
              </div>
              <div className="flex items-center gap-3">
                <Users className="w-4 h-4 text-slate-400" />
                <span>{partySize} guests</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}