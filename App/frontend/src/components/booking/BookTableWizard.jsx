import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Calendar, Clock, Users, CheckCircle2, AlertTriangle, ArrowRight, ArrowLeft, Loader2, Table, Mail, ShieldAlert, ClipboardList } from 'lucide-react';
import { fetchSlotsByDate, createReservation } from '../../services/reservationApi';
import { useAuth } from '../../context/AuthContext';
import BackToHomeLink from '../common/BackToHomeLink';
import RequirementsEditor from './RequirementsEditor';
import RequirementsList from './RequirementsList';
import { toRequirementsPayload, validateRequirements } from '../../utils/bookingFormat';

//Slots are at the hut: dates and times are shown in hut time, whatever the browser's time zone
const HUT_TIME_ZONE = 'Europe/Rome';
const todayAtHut = () => new Date().toLocaleDateString('en-CA', { timeZone: HUT_TIME_ZONE });

//Step numbers: requirements (MH-05) are an optional step before the summary
const STEP = { SLOT: 1, GUESTS: 2, ASSIGNMENT: 3, REQUIREMENTS: 4, CONFIRM: 5 };

export default function BookTableWizard() {
  const location = useLocation();
  const prefill = location.state || {};
  const hikerEmail = useAuth()?.user?.email;

  // Initialize state with prefilled values if available
  const [date, setDate] = useState(prefill.date || todayAtHut());
  const [partySize, setPartySize] = useState(prefill.partySize ? Number(prefill.partySize) : 2);
  //What the hiker is typing: it can be empty for a moment, partySize always stays a valid number
  const [partySizeInput, setPartySizeInput] = useState(String(partySize));
  const isPartySizeValid = Number(partySizeInput) >= 1;

  const changePartySize = (value) => {
    setPartySize(value);
    setPartySizeInput(String(value));
  };

  const handlePartySizeTyping = (e) => {
    const value = e.target.value;
    //Digits only, so no signs, decimals or exponents
    if (!/^\d*$/.test(value)) return;
    setPartySizeInput(value);
    if (Number(value) >= 1) setPartySize(Number(value));
  };
  const [selectedSlot, setSelectedSlot] = useState(null);

  //Party requirements (MH-05): optional, the people they cover cannot exceed the party size
  const [requirements, setRequirements] = useState([]);
  const requirementsCheck = validateRequirements(requirements, partySize);
  const areRequirementsValid =
    !requirementsCheck.totalError && requirementsCheck.rowErrors.every((rowError) => rowError === null);
  const allergyCount = requirements.filter((row) => row.hasAllergies).length;

  // Jump to the assignment step if coming from Availability with a slot pre-selected
  const [step, setStep] = useState(prefill.slotId ? STEP.ASSIGNMENT : STEP.SLOT);

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
      const result = await createReservation(selectedSlot.id, partySize, toRequirementsPayload(requirements));
      setBookingResult(result);
      setBookingSuccess(true);
    } catch (err) {
      if (err.code === "ALREADY_BOOKED") {
        setError("You already have a confirmed booking for this slot.");
      } else if (err.code === "BOOKING_CLOSED" || err.status === 422) {
        setError("Bookings close 2 hours before the slot starts.");
      } else if (err.code === "NOT_ENOUGH_SEATS") {
        setError("Not enough free seats for the requested party size.");
      } else if (err.code === "INVALID_INPUT") {
        setError("Some party requirements are not valid. Go back to the requirements step and check them.");
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
    //Same booking reference as in the confirmation email (MH-03)
    const bookingReference = `MH-${bookingResult.id}`;
    return (
      <div className="max-w-xl mx-auto my-12">
      {/* Always visible, so the hiker can leave the wizard at any step */}
      <BackToHomeLink className="mb-6" />
      <div className="p-8 bg-white rounded-2xl border border-emerald-100 text-center shadow-xs">
        <CheckCircle2 className="w-16 h-16 text-emerald-600 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-slate-900">Booking Confirmed!</h2>
        <p className="text-slate-600 mt-2 text-sm">
          Reservation <strong>{bookingReference}</strong> confirmed for <strong>{partySize} guests</strong>.
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

        {bookingResult.requirements?.length > 0 && (
          <div className="mt-4 p-4 bg-white rounded-xl border border-slate-200 text-left">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Party requirements</p>
            <RequirementsList requirements={bookingResult.requirements} />
          </div>
        )}

        {/* MH-03: the booking stays valid even when the confirmation email could not be sent */}
        {bookingResult.confirmationSent ? (
          <div className="mt-4 p-4 bg-emerald-50 border border-emerald-100 rounded-xl flex items-start gap-3 text-left text-emerald-800 text-sm">
            <Mail className="w-5 h-5 flex-shrink-0" />
            <span>
              A confirmation email with your booking details has been sent to{' '}
              {hikerEmail ? <strong>{hikerEmail}</strong> : 'your email address'}.
            </span>
          </div>
        ) : (
          <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3 text-left text-amber-800 text-sm">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <span>
              Your booking is confirmed, but we could not send the confirmation email. Please keep your booking reference{' '}
              <strong>{bookingReference}</strong>.
            </span>
          </div>
        )}
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
          { num: STEP.SLOT, label: "Date & Time" },
          { num: STEP.GUESTS, label: "Guests" },
          { num: STEP.ASSIGNMENT, label: "Assignment" },
          { num: STEP.REQUIREMENTS, label: "Requirements" },
          { num: STEP.CONFIRM, label: "Confirm" }
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
        {/* On the last step the card is already the summary, so it takes the full width */}
        <div
          className={`bg-white p-6 rounded-2xl border border-slate-100 shadow-xs ${
            step === STEP.CONFIRM ? 'lg:col-span-3 w-full max-w-2xl mx-auto' : 'lg:col-span-2'
          }`}
        >
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3 text-red-700 text-sm">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* STEP 1: Date & Time Picker */}
          {step === STEP.SLOT && (
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
                            isDisabled ? 'cursor-not-allowed' : 'cursor-pointer'
                          } ${
                            selectedSlot?.id === s.id
                              ? 'bg-emerald-700 text-white border-emerald-700 shadow-xs'
                              : isDisabled
                              ? 'bg-slate-200 text-slate-500 border-slate-300 border-dashed'
                              : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-emerald-600'
                          }`}
                        >
                          <div className={`font-bold ${isDisabled ? 'line-through decoration-slate-500' : ''}`}>
                            {formatTime(s.startAt)}
                          </div>
                          {isDisabled && (
                            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-600 mt-0.5">
                              Not available
                            </div>
                          )}
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
                onClick={() => setStep(STEP.GUESTS)}
                className="cursor-pointer mt-8 w-full py-3 bg-emerald-700 text-white font-semibold rounded-xl hover:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
              >
                <span>Continue to party size</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* STEP 2: Party Size Stepper */}
          {step === STEP.GUESTS && (
            <div>
              <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                <Users className="w-5 h-5 text-emerald-700" /> Select Party Size
              </h3>

              <div className="flex items-center justify-center gap-6 my-8 py-6 bg-slate-50 rounded-2xl border border-slate-100">
                <button
                  type="button"
                  onClick={() => changePartySize(Math.max(1, partySize - 1))}
                  aria-label="Remove one guest"
                  className="cursor-pointer w-12 h-12 rounded-xl bg-white border border-slate-200 font-bold text-xl text-slate-700 hover:bg-slate-100 flex items-center justify-center"
                >
                  -
                </button>
                <div className="text-center">
                  <input
                    id="partySizeInput"
                    type="text"
                    inputMode="numeric"
                    maxLength={3}
                    value={partySizeInput}
                    onChange={handlePartySizeTyping}
                    //Leaving the field empty or at 0 puts back the last valid number
                    onBlur={() => setPartySizeInput(String(partySize))}
                    aria-label="Number of guests"
                    className="w-24 text-center text-4xl font-extrabold text-slate-900 bg-white border border-slate-200 rounded-xl py-1 focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                  />
                  <label htmlFor="partySizeInput" className="block text-xs font-medium text-slate-500 mt-1">guests</label>
                </div>
                <button
                  type="button"
                  onClick={() => changePartySize(partySize + 1)}
                  aria-label="Add one guest"
                  className="cursor-pointer w-12 h-12 rounded-xl bg-white border border-slate-200 font-bold text-xl text-slate-700 hover:bg-slate-100 flex items-center justify-center"
                >
                  +
                </button>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(STEP.SLOT)}
                  className="cursor-pointer w-1/3 py-3 border border-slate-200 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 flex items-center justify-center gap-1 text-sm"
                >
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
                <button
                  onClick={() => setStep(STEP.ASSIGNMENT)}
                  disabled={!isPartySizeValid}
                  className="cursor-pointer w-2/3 py-3 bg-emerald-700 text-white font-semibold rounded-xl hover:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
                >
                  <span>Check Table Assignment</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Automatic Table Assignment Preview */}
          {step === STEP.ASSIGNMENT && (
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
                      onClick={() => setStep(STEP.GUESTS)}
                      className="cursor-pointer w-1/3 py-3 border border-slate-200 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 flex items-center justify-center gap-1 text-sm"
                    >
                      <ArrowLeft className="w-4 h-4" /> Modify
                    </button>
                    <button
                      onClick={() => setStep(STEP.REQUIREMENTS)}
                      className="cursor-pointer w-2/3 py-3 bg-emerald-700 text-white font-semibold rounded-xl hover:bg-emerald-800 flex items-center justify-center gap-2 text-sm"
                    >
                      Continue to requirements <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-6">
                  <p className="text-red-600 font-semibold text-sm">
                    {loading ? "Verifying availability..." : `Not enough free seats in this slot for ${partySize} people (${selectedSlot?.freeSeats || 0} available).`}
                  </p>
                  <button onClick={() => setStep(STEP.SLOT)} className="cursor-pointer mt-4 px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-sm font-medium">
                    Change Date or Slot
                  </button>
                </div>
              )}
            </div>
          )}

          {/* STEP 4: Party requirements (MH-05), optional */}
          {step === STEP.REQUIREMENTS && (
            <div>
              <h3 className="text-lg font-bold text-slate-900 mb-1 flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-emerald-700" /> Dietary restrictions and allergies
              </h3>
              <p className="text-sm text-slate-600 mb-5">
                Tell the hut about diets or allergies in your party, so the kitchen can prepare
                suitable meals. Tick "Allergy or intolerance" when special care is needed. You can
                skip this step.
              </p>

              <RequirementsEditor
                requirements={requirements}
                partySize={partySize}
                onChange={setRequirements}
              />

              <div className="flex gap-3 pt-6">
                <button
                  onClick={() => setStep(STEP.ASSIGNMENT)}
                  className="cursor-pointer w-1/3 py-3 border border-slate-200 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 flex items-center justify-center gap-1 text-sm"
                >
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
                <button
                  onClick={() => setStep(STEP.CONFIRM)}
                  disabled={!areRequirementsValid}
                  className="cursor-pointer w-2/3 py-3 bg-emerald-700 text-white font-semibold rounded-xl hover:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
                >
                  {requirements.length === 0 ? 'Skip and review' : 'Proceed to summary'} <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 5: Review & Confirm */}
          {step === STEP.CONFIRM && (
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
                <div className="py-2 border-b border-slate-100">
                  <span className="block text-slate-500 mb-1.5">Requirements:</span>
                  <RequirementsList requirements={toRequirementsPayload(requirements)} />
                </div>
              </div>

              {allergyCount > 0 && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-red-800 text-sm">
                  <ShieldAlert className="w-5 h-5 flex-shrink-0" />
                  <span>
                    {allergyCount === 1 ? '1 requirement reports' : `${allergyCount} requirements report`} an
                    allergy or intolerance: the hut will take special care when preparing the meal.
                  </span>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(STEP.REQUIREMENTS)}
                  className="cursor-pointer w-1/3 py-3 border border-slate-200 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 flex items-center justify-center gap-1 text-sm"
                >
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
                <button
                  onClick={handleConfirmBooking}
                  disabled={submitting}
                  className="cursor-pointer w-2/3 py-3 bg-emerald-700 text-white font-semibold rounded-xl hover:bg-emerald-800 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
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

        {/* Sticky Booking Summary Panel, hidden on the confirm step where the card shows the same details */}
        {step !== STEP.CONFIRM && (
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
              <div className="flex items-center gap-3">
                <ClipboardList className="w-4 h-4 text-slate-400" />
                <span>
                  {requirements.length === 0
                    ? 'No requirements'
                    : `${requirements.length} ${requirements.length === 1 ? 'requirement' : 'requirements'}`}
                  {allergyCount > 0 && <span className="text-red-300 font-semibold"> · {allergyCount} with allergies</span>}
                </span>
              </div>
            </div>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}