import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  UserPlus,
  Search,
  Zap,
  Calendar,
  Clock,
  Users,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  Copy,
  Check,
  Mail,
  Phone,
  KeyRound,
  Loader2,
  Utensils,
} from "lucide-react";
import Navbar from "../components/common/Navbar";
import RequirementsEditor from "../components/booking/RequirementsEditor";
import {
  fetchSlotsByDate,
  searchHikers,
  createStaffReservation,
} from "../services/reservationApi";
import {
  todayAtHut,
  formatLongDate,
  formatTimeRange,
  bookingReference,
  peopleLabel,
  validateRequirements,
  toRequirementsPayload,
} from "../utils/bookingFormat";

const EMAIL_REGEX = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;
const PHONE_REGEX = /^\d{1,10}$/;

const SLOT_CONFLICT_CODES = new Set([
  "NOT_ENOUGH_SEATS",
  "SLOT_STARTED",
  "SLOT_NOT_FOUND",
  "ALREADY_BOOKED",
]);

const HIKER_MODES = [
  {
    id: "temporary",
    label: "Quick entry",
    subtitle: "Temporary hiker (no login)",
    icon: Zap,
  },
  {
    id: "search",
    label: "Search existing",
    subtitle: "Registered or temporary",
    icon: Search,
  },
  {
    id: "new",
    label: "New full account",
    subtitle: "Generates temporary password",
    icon: UserPlus,
  },
];

const INITIAL_TEMP_HIKER = { firstName: "", lastName: "", phone: "" };
const INITIAL_NEW_HIKER = {
  email: "",
  firstName: "",
  lastName: "",
  phone: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
  notes: "",
};

export default function StaffReserve() {
  const navigate = useNavigate();

  // Wizard step: 1 = Hiker, 2 = Slot & Party, 3 = Review, 4 = Result
  const [step, setStep] = useState(1);

  // Step 1: Hiker selection (default: temporary quick entry)
  const [hikerMode, setHikerMode] = useState("temporary");
  const [tempHiker, setTempHiker] = useState(INITIAL_TEMP_HIKER);
  const [newHiker, setNewHiker] = useState(INITIAL_NEW_HIKER);

  // Search existing hiker state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [selectedHiker, setSelectedHiker] = useState(null);

  // Step 2: Date, Slot, Party size & Requirements
  const [date, setDate] = useState(todayAtHut);
  const [slots, setSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotsError, setSlotsError] = useState(null);
  const [slotsRefreshKey, setSlotsRefreshKey] = useState(0);
  const [selectedSlotId, setSelectedSlotId] = useState(null);
  const [partySize, setPartySize] = useState(2);
  const [requirements, setRequirements] = useState([]);

  // Validation & submission state
  const [stepError, setStepError] = useState(null);
  const [emailAlreadyUsed, setEmailAlreadyUsed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [createdBooking, setCreatedBooking] = useState(null);
  const [copiedPassword, setCopiedPassword] = useState(false);

  // Debounced search for existing hikers when in "search" mode
  useEffect(() => {
    if (hikerMode !== "search") return;

    // Immediately clear stale results whenever the query or mode changes
    setSearchResults([]);
    setSearchError(null);

    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) {
      setSearching(false);
      return;
    }

    setSearching(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const results = await searchHikers(trimmed, {
          signal: controller.signal,
        });
        setSearchResults(Array.isArray(results) ? results : []);
      } catch (err) {
        if (err.name !== "AbortError") {
          setSearchError(err.message || "Could not search hikers.");
          setSearchResults([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setSearching(false);
        }
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [hikerMode, searchQuery]);

  // Load slots whenever the chosen date changes or a refresh is triggered
  useEffect(() => {
    setSelectedSlotId(null);
    setSlots([]);

    if (!date) {
      setLoadingSlots(false);
      setSlotsError(null);
      return;
    }

    let cancelled = false;

    const loadSlots = async () => {
      setLoadingSlots(true);
      setSlotsError(null);
      try {
        const data = await fetchSlotsByDate(date);
        if (!cancelled) {
          setSlots(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        if (!cancelled) {
          setSlotsError(err.message || "Could not load slots for this date.");
          setSlots([]);
        }
      } finally {
        if (!cancelled) setLoadingSlots(false);
      }
    };

    void loadSlots();
    return () => {
      cancelled = true;
    };
  }, [date, slotsRefreshKey]);

  const selectedSlot = slots.find((s) => s.id === selectedSlotId) || null;

  const handleModeChange = (mode) => {
    setHikerMode(mode);
    setStepError(null);
    setEmailAlreadyUsed(false);
  };

  const handleSwitchToSearchWithEmail = (emailToSearch) => {
    setHikerMode("search");
    setSearchQuery(emailToSearch.trim());
    setSearchResults([]);
    setSearchError(null);
    setSelectedHiker(null);
    setStepError(null);
    setEmailAlreadyUsed(false);
    setStep(1);
  };

  const handleDateChange = (newDate) => {
    setDate(newDate);
    setSelectedSlotId(null);
    setSlots([]);
    setSlotsError(null);
    setStepError(null);
  };

  const validateStep1 = () => {
    setStepError(null);
    setEmailAlreadyUsed(false);

    if (hikerMode === "search") {
      if (!selectedHiker) {
        setStepError("Please search and select an existing hiker.");
        return false;
      }
      return true;
    }

    if (hikerMode === "temporary") {
      const firstName = tempHiker.firstName.trim();
      const lastName = tempHiker.lastName.trim();
      const phone = tempHiker.phone.trim();

      if (!firstName || firstName.length > 100) {
        setStepError("First name is required (1 to 100 characters).");
        return false;
      }
      if (!lastName || lastName.length > 100) {
        setStepError("Last name is required (1 to 100 characters).");
        return false;
      }
      if (phone && !PHONE_REGEX.test(phone)) {
        setStepError("Phone number can only contain digits (at most 10).");
        return false;
      }
      return true;
    }

    // hikerMode === "new"
    const email = newHiker.email.trim();
    const firstName = newHiker.firstName.trim();
    const lastName = newHiker.lastName.trim();
    const phone = newHiker.phone.trim();
    const ecName = newHiker.emergencyContactName.trim();
    const ecPhone = newHiker.emergencyContactPhone.trim();
    const notes = newHiker.notes.trim();

    if (!email || !EMAIL_REGEX.test(email) || email.length > 255) {
      setStepError("Please enter a valid email address (at most 255 characters).");
      return false;
    }
    if (!firstName || firstName.length > 100) {
      setStepError("First name is required (1 to 100 characters).");
      return false;
    }
    if (!lastName || lastName.length > 100) {
      setStepError("Last name is required (1 to 100 characters).");
      return false;
    }
    if (phone && !PHONE_REGEX.test(phone)) {
      setStepError("Phone number can only contain digits (at most 10).");
      return false;
    }
    if ((ecName && !ecPhone) || (!ecName && ecPhone)) {
      setStepError("Emergency contact name and phone must both be provided or both left empty.");
      return false;
    }
    if (ecName && ecName.length > 100) {
      setStepError("Emergency contact name must be at most 100 characters.");
      return false;
    }
    if (ecPhone && !PHONE_REGEX.test(ecPhone)) {
      setStepError("Emergency contact phone can only contain digits (at most 10).");
      return false;
    }
    if (notes && notes.length > 1000) {
      setStepError("Notes must be at most 1000 characters.");
      return false;
    }

    return true;
  };

  const validateStep2 = () => {
    setStepError(null);

    if (!date) {
      setStepError("Please select a date.");
      return false;
    }
    if (loadingSlots) {
      setStepError("Please wait until available time slots finish loading.");
      return false;
    }
    if (!selectedSlot) {
      setStepError("Please select an available time slot.");
      return false;
    }
    if (new Date(selectedSlot.startAt) <= new Date()) {
      setStepError("This time slot has already started.");
      return false;
    }

    const parsedPartySize = Number(partySize);
    if (!Number.isInteger(parsedPartySize) || parsedPartySize < 1) {
      setStepError("Party size must be at least 1 person.");
      return false;
    }
    if (parsedPartySize > selectedSlot.freeSeats) {
      setStepError(
        `Only ${selectedSlot.freeSeats} free seats are left in this slot.`
      );
      return false;
    }

    const { rowErrors, totalError } = validateRequirements(
      requirements,
      parsedPartySize
    );
    if (rowErrors.some(Boolean) || totalError) {
      setStepError("Please fix the party requirements errors before continuing.");
      return false;
    }

    return true;
  };

  const handleNextFromStep1 = () => {
    if (validateStep1()) setStep(2);
  };

  const handleNextFromStep2 = () => {
    if (validateStep2()) setStep(3);
  };

  const buildPayload = () => {
    const base = {
      slotId: Number(selectedSlot.id),
      partySize: Number(partySize),
      requirements: toRequirementsPayload(requirements),
    };

    if (hikerMode === "search") {
      return { ...base, hikerId: Number(selectedHiker.id) };
    }

    if (hikerMode === "temporary") {
      return {
        ...base,
        temporaryHiker: {
          firstName: tempHiker.firstName.trim(),
          lastName: tempHiker.lastName.trim(),
          ...(tempHiker.phone.trim() ? { phone: tempHiker.phone.trim() } : {}),
        },
      };
    }

    // hikerMode === "new"
    return {
      ...base,
      newHiker: {
        email: newHiker.email.trim(),
        firstName: newHiker.firstName.trim(),
        lastName: newHiker.lastName.trim(),
        ...(newHiker.phone.trim() ? { phone: newHiker.phone.trim() } : {}),
        ...(newHiker.emergencyContactName.trim()
          ? {
              emergencyContactName: newHiker.emergencyContactName.trim(),
              emergencyContactPhone: newHiker.emergencyContactPhone.trim(),
            }
          : {}),
        ...(newHiker.notes.trim() ? { notes: newHiker.notes.trim() } : {}),
      },
    };
  };

  const handleConfirmBooking = async () => {
    setStepError(null);
    setEmailAlreadyUsed(false);
    setSubmitting(true);

    try {
      const result = await createStaffReservation(buildPayload());
      setCreatedBooking(result);
      setStep(4);
    } catch (err) {
      if (err.code === "EMAIL_ALREADY_USED") {
        setEmailAlreadyUsed(true);
        setStepError(
          "An account with this email already exists. Search for the existing hiker instead."
        );
      } else if (SLOT_CONFLICT_CODES.has(err.code)) {
        setSelectedSlotId(null);
        setSlots([]);
        setLoadingSlots(true);
        setSlotsRefreshKey((prev) => prev + 1);
        setStep(2);
        setStepError(
          err.message ||
            "The selected slot is no longer available. Please choose another slot."
        );
      } else {
        setStepError(err.message || "Could not create the reservation.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyTemporaryPassword = async () => {
    if (!createdBooking?.temporaryPassword) return;
    try {
      await navigator.clipboard.writeText(createdBooking.temporaryPassword);
      setCopiedPassword(true);
      setTimeout(() => setCopiedPassword(false), 2500);
    } catch {
      // Clipboard API may not be available in all contexts
    }
  };

  const handleResetWizard = () => {
    setStep(1);
    setHikerMode("temporary");
    setTempHiker(INITIAL_TEMP_HIKER);
    setNewHiker(INITIAL_NEW_HIKER);
    setSearchQuery("");
    setSearchResults([]);
    setSearchError(null);
    setSelectedHiker(null);
    setSelectedSlotId(null);
    setPartySize(2);
    setRequirements([]);
    setStepError(null);
    setEmailAlreadyUsed(false);
    setCreatedBooking(null);
    setCopiedPassword(false);
  };

  // Summary of the chosen hiker for Step 3 review
  const reviewHiker =
    hikerMode === "search"
      ? selectedHiker
      : hikerMode === "temporary"
        ? {
            firstName: tempHiker.firstName.trim(),
            lastName: tempHiker.lastName.trim(),
            phone: tempHiker.phone.trim() || null,
            email: null,
            isTemporary: true,
          }
        : {
            firstName: newHiker.firstName.trim(),
            lastName: newHiker.lastName.trim(),
            phone: newHiker.phone.trim() || null,
            email: newHiker.email.trim(),
            emergencyContactName: newHiker.emergencyContactName.trim() || null,
            emergencyContactPhone: newHiker.emergencyContactPhone.trim() || null,
            notes: newHiker.notes.trim() || null,
            isTemporary: false,
          };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        <div className="mb-6">
          <span className="inline-block bg-emerald-50 text-emerald-700 border border-emerald-200/60 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-2">
            Staff Desk
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Reserve for a hiker
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Enter a reservation received by phone, message, or in person at the hut.
          </p>
        </div>

        {/* Stepper (hidden on final confirmation screen) */}
        {step < 4 && (
          <ol className="grid grid-cols-3 gap-2 mb-6" aria-label="Booking progress">
            {[
              { num: 1, title: "1. Hiker" },
              { num: 2, title: "2. Slot & Party" },
              { num: 3, title: "3. Review" },
            ].map((item) => {
              const active = step === item.num;
              const completed = step > item.num;
              return (
                <li
                  key={item.num}
                  className={`rounded-xl border px-3 py-2.5 text-xs sm:text-sm font-semibold text-center transition-colors ${
                    active
                      ? "bg-emerald-700 text-white border-emerald-700"
                      : completed
                        ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                        : "bg-white text-slate-500 border-slate-200"
                  }`}
                >
                  {item.title}
                </li>
              );
            })}
          </ol>
        )}

        {stepError && (
          <div
            role="alert"
            className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-red-800 text-sm"
          >
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p>{stepError}</p>
              {emailAlreadyUsed && (
                <button
                  type="button"
                  onClick={() => handleSwitchToSearchWithEmail(newHiker.email)}
                  className="cursor-pointer mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-700 hover:bg-red-800 text-white text-xs font-semibold rounded-lg transition-colors"
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>Search for existing hiker</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* STEP 1: CHOOSE OR ENTER HIKER */}
        {step === 1 && (
          <div className="bg-white rounded-2xl shadow-xs border border-gray-100 p-6 sm:p-8 space-y-6">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Choose hiker</h2>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                Use quick entry for walk-ins or phone calls, search an existing guest, or create a full hiker account.
              </p>
            </div>

            {/* Mode selector */}
            <div
              role="tablist"
              aria-label="Hiker entry mode"
              className="grid grid-cols-1 sm:grid-cols-3 gap-3"
            >
              {HIKER_MODES.map((mode) => {
                const Icon = mode.icon;
                const selected = hikerMode === mode.id;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => handleModeChange(mode.id)}
                    className={`cursor-pointer text-left p-3.5 rounded-xl border transition-all ${
                      selected
                        ? "border-emerald-600 bg-emerald-50/70 ring-1 ring-emerald-600"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Icon
                        className={`w-4 h-4 ${
                          selected ? "text-emerald-700" : "text-slate-500"
                        }`}
                      />
                      <span className="text-sm font-bold text-slate-900">
                        {mode.label}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">{mode.subtitle}</p>
                  </button>
                );
              })}
            </div>

            {/* MODE A: TEMPORARY HIKER (QUICK ENTRY - DEFAULT) */}
            {hikerMode === "temporary" && (
              <div className="space-y-4 pt-2 border-t border-slate-100">
                <div className="p-3 bg-amber-50 border border-amber-200/80 rounded-xl text-xs text-amber-900">
                  Temporary hikers cannot log in and do not receive confirmation emails. Their record is saved so staff can find them again for future bookings.
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <label className="block">
                    <span className="block text-sm font-medium text-slate-700 mb-1">
                      First name *
                    </span>
                    <input
                      type="text"
                      value={tempHiker.firstName}
                      onChange={(e) =>
                        setTempHiker({ ...tempHiker, firstName: e.target.value })
                      }
                      placeholder="Luca"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </label>

                  <label className="block">
                    <span className="block text-sm font-medium text-slate-700 mb-1">
                      Last name *
                    </span>
                    <input
                      type="text"
                      value={tempHiker.lastName}
                      onChange={(e) =>
                        setTempHiker({ ...tempHiker, lastName: e.target.value })
                      }
                      placeholder="Neri"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </label>
                </div>

                <label className="block">
                  <span className="block text-sm font-medium text-slate-700 mb-1">
                    Phone number (optional)
                  </span>
                  <input
                    type="tel"
                    maxLength={10}
                    value={tempHiker.phone}
                    onChange={(e) =>
                      setTempHiker({ ...tempHiker, phone: e.target.value })
                    }
                    placeholder="3471112233"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </label>
              </div>
            )}

            {/* MODE B: SEARCH EXISTING HIKER */}
            {hikerMode === "search" && (
              <div className="space-y-4 pt-2 border-t border-slate-100">
                <label className="block">
                  <span className="block text-sm font-medium text-slate-700 mb-1">
                    Search by name, phone, or email
                  </span>
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setSelectedHiker(null);
                        setSearchResults([]);
                        setSearchError(null);
                      }}
                      placeholder="Type at least 2 characters..."
                      className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </div>
                </label>

                {searching && (
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Loader2 className="w-4 h-4 animate-spin text-emerald-700" />
                    <span>Searching hikers...</span>
                  </div>
                )}

                {searchError && (
                  <p className="text-xs text-red-700">{searchError}</p>
                )}

                {!searching &&
                  searchQuery.trim().length >= 2 &&
                  searchResults.length === 0 &&
                  !searchError && (
                    <p className="text-sm text-slate-500 bg-slate-50 border border-dashed border-slate-200 rounded-xl p-4">
                      No matching hikers found for "{searchQuery.trim()}".
                    </p>
                  )}

                {searchResults.length > 0 && (
                  <ul className="space-y-2 max-h-64 overflow-y-auto">
                    {searchResults.map((h) => {
                      const isSelected = selectedHiker?.id === h.id;
                      return (
                        <li key={h.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedHiker(h);
                              setStepError(null);
                            }}
                            className={`cursor-pointer w-full text-left p-3.5 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                              isSelected
                                ? "border-emerald-600 bg-emerald-50/70 ring-1 ring-emerald-600"
                                : "border-slate-200 hover:border-slate-300 bg-white"
                            }`}
                          >
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-sm text-slate-900">
                                  {h.firstName} {h.lastName}
                                </span>
                                {h.isTemporary ? (
                                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                                    Temporary
                                  </span>
                                ) : (
                                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                                    Registered
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-slate-500 mt-1 flex flex-wrap gap-x-4 gap-y-1">
                                {h.email && (
                                  <span className="inline-flex items-center gap-1">
                                    <Mail className="w-3 h-3" /> {h.email}
                                  </span>
                                )}
                                {h.phone && (
                                  <span className="inline-flex items-center gap-1">
                                    <Phone className="w-3 h-3" /> {h.phone}
                                  </span>
                                )}
                              </div>
                            </div>
                            {isSelected && (
                              <CheckCircle2 className="w-5 h-5 text-emerald-700 flex-shrink-0" />
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}

            {/* MODE C: NEW FULL HIKER ACCOUNT */}
            {hikerMode === "new" && (
              <div className="space-y-4 pt-2 border-t border-slate-100">
                <div className="p-3 bg-emerald-50 border border-emerald-200/80 rounded-xl text-xs text-emerald-900">
                  A random 12-character temporary password will be generated on confirmation. Give it to the hiker so they can sign in and set their own password.
                </div>

                <label className="block">
                  <span className="block text-sm font-medium text-slate-700 mb-1">
                    Email *
                  </span>
                  <input
                    type="email"
                    value={newHiker.email}
                    onChange={(e) => {
                      setNewHiker({ ...newHiker, email: e.target.value });
                      setEmailAlreadyUsed(false);
                    }}
                    placeholder="anna@example.com"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <label className="block">
                    <span className="block text-sm font-medium text-slate-700 mb-1">
                      First name *
                    </span>
                    <input
                      type="text"
                      value={newHiker.firstName}
                      onChange={(e) =>
                        setNewHiker({ ...newHiker, firstName: e.target.value })
                      }
                      placeholder="Anna"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </label>

                  <label className="block">
                    <span className="block text-sm font-medium text-slate-700 mb-1">
                      Last name *
                    </span>
                    <input
                      type="text"
                      value={newHiker.lastName}
                      onChange={(e) =>
                        setNewHiker({ ...newHiker, lastName: e.target.value })
                      }
                      placeholder="Neri"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </label>
                </div>

                <label className="block">
                  <span className="block text-sm font-medium text-slate-700 mb-1">
                    Phone number (optional)
                  </span>
                  <input
                    type="tel"
                    maxLength={10}
                    value={newHiker.phone}
                    onChange={(e) =>
                      setNewHiker({ ...newHiker, phone: e.target.value })
                    }
                    placeholder="3331234567"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <label className="block">
                    <span className="block text-sm font-medium text-slate-700 mb-1">
                      Emergency contact name (optional)
                    </span>
                    <input
                      type="text"
                      value={newHiker.emergencyContactName}
                      onChange={(e) =>
                        setNewHiker({
                          ...newHiker,
                          emergencyContactName: e.target.value,
                        })
                      }
                      placeholder="Marco Neri"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </label>

                  <label className="block">
                    <span className="block text-sm font-medium text-slate-700 mb-1">
                      Emergency contact phone (optional)
                    </span>
                    <input
                      type="tel"
                      maxLength={10}
                      value={newHiker.emergencyContactPhone}
                      onChange={(e) =>
                        setNewHiker({
                          ...newHiker,
                          emergencyContactPhone: e.target.value,
                        })
                      }
                      placeholder="3337654321"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </label>
                </div>

                <label className="block">
                  <span className="block text-sm font-medium text-slate-700 mb-1">
                    Notes (optional)
                  </span>
                  <textarea
                    rows={2}
                    maxLength={1000}
                    value={newHiker.notes}
                    onChange={(e) =>
                      setNewHiker({ ...newHiker, notes: e.target.value })
                    }
                    placeholder="Medical or trail notes..."
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </label>
              </div>
            )}

            <div className="pt-4 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={handleNextFromStep1}
                className="cursor-pointer py-2.5 px-5 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold rounded-lg shadow-xs transition-all inline-flex items-center gap-2 text-sm"
              >
                <span>Continue to slot & party</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: DATE, SLOT, PARTY SIZE & REQUIREMENTS */}
        {step === 2 && (
          <div className="bg-white rounded-2xl shadow-xs border border-gray-100 p-6 sm:p-8 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="block">
                <span className="flex items-center gap-1.5 text-sm font-medium text-slate-700 mb-1">
                  <Calendar className="w-4 h-4 text-emerald-700" />
                  Date (hut time)
                </span>
                <input
                  type="date"
                  min={todayAtHut()}
                  value={date}
                  onChange={(e) => handleDateChange(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </label>

              <label className="block">
                <span className="flex items-center gap-1.5 text-sm font-medium text-slate-700 mb-1">
                  <Users className="w-4 h-4 text-emerald-700" />
                  Party size
                </span>
                <input
                  type="number"
                  min={1}
                  inputMode="numeric"
                  value={partySize}
                  onChange={(e) => setPartySize(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </label>
            </div>

            <div>
              <span className="flex items-center gap-1.5 text-sm font-medium text-slate-700 mb-2">
                <Clock className="w-4 h-4 text-emerald-700" />
                Time slot
              </span>
              <p className="text-xs text-slate-500 mb-3">
                Staff can book any slot that has not started yet (no 2-hour cutoff).
              </p>

              {loadingSlots ? (
                <div className="flex items-center gap-2 text-sm text-slate-500 py-4">
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-700" />
                  <span>Loading time slots...</span>
                </div>
              ) : slotsError ? (
                <p className="text-sm text-red-700">{slotsError}</p>
              ) : slots.length === 0 ? (
                <p className="text-sm text-slate-500 bg-slate-50 border border-dashed border-slate-200 rounded-xl p-4">
                  No time slots configured for this date.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {slots.map((slot) => {
                    const started = new Date(slot.startAt) <= new Date();
                    const full = slot.freeSeats <= 0;
                    const disabled = started || full;
                    const isSelected = selectedSlotId === slot.id;

                    return (
                      <button
                        key={slot.id}
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          setSelectedSlotId(slot.id);
                          setStepError(null);
                        }}
                        className={`text-left p-3.5 rounded-xl border transition-all ${
                          disabled
                            ? "border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed"
                            : isSelected
                              ? "cursor-pointer border-emerald-600 bg-emerald-50/70 ring-1 ring-emerald-600"
                              : "cursor-pointer border-slate-200 bg-white hover:border-slate-300"
                        }`}
                      >
                        <div className="font-bold text-sm text-slate-900">
                          {formatTimeRange(slot.startAt, slot.endAt)}
                        </div>
                        <div className="text-xs mt-1">
                          {started ? (
                            <span className="text-slate-400">Already started</span>
                          ) : full ? (
                            <span className="text-red-600 font-medium">Full (0 seats)</span>
                          ) : (
                            <span className="text-emerald-700 font-medium">
                              {slot.freeSeats} of {slot.totalSeats} seats free
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-slate-100">
              <RequirementsEditor
                requirements={requirements}
                partySize={Number(partySize) || 1}
                onChange={setRequirements}
              />
            </div>

            <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  setStepError(null);
                  setStep(1);
                }}
                className="cursor-pointer py-2.5 px-4 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold rounded-lg transition-colors inline-flex items-center gap-2 text-sm"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </button>

              <button
                type="button"
                disabled={loadingSlots}
                onClick={handleNextFromStep2}
                className="cursor-pointer py-2.5 px-5 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold rounded-lg shadow-xs transition-all inline-flex items-center gap-2 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <span>Review reservation</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: REVIEW & CONFIRM */}
        {step === 3 && selectedSlot && reviewHiker && (
          <div className="bg-white rounded-2xl shadow-xs border border-gray-100 p-6 sm:p-8 space-y-6">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Review reservation details
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                Please verify the hiker and booking details before confirming.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Hiker
                </span>
                <p className="font-bold text-slate-900">
                  {reviewHiker.firstName} {reviewHiker.lastName}
                </p>
                <div>
                  {hikerMode === "temporary" ? (
                    <span className="inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                      New temporary hiker
                    </span>
                  ) : hikerMode === "new" ? (
                    <span className="inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                      New full account
                    </span>
                  ) : reviewHiker.isTemporary ? (
                    <span className="inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                      Existing temporary hiker
                    </span>
                  ) : (
                    <span className="inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                      Existing registered hiker
                    </span>
                  )}
                </div>
                {reviewHiker.email && (
                  <p className="text-xs text-slate-600">Email: {reviewHiker.email}</p>
                )}
                {reviewHiker.phone && (
                  <p className="text-xs text-slate-600">Phone: {reviewHiker.phone}</p>
                )}
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Meal Slot
                </span>
                <p className="font-bold text-slate-900">
                  {formatLongDate(selectedSlot.startAt)}
                </p>
                <p className="text-sm text-slate-700">
                  {formatTimeRange(selectedSlot.startAt, selectedSlot.endAt)}
                </p>
                <p className="text-xs font-semibold text-emerald-700">
                  {peopleLabel(Number(partySize))}
                </p>
              </div>
            </div>

            {requirements.length > 0 && (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Party requirements
                </span>
                <ul className="mt-2 space-y-1.5 text-sm text-slate-800">
                  {toRequirementsPayload(requirements).map((req, idx) => (
                    <li key={idx} className="flex items-center gap-2">
                      <Utensils className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                      <span>
                        <strong>{req.peopleCount} ×</strong>{" "}
                        {req.hasAllergies && (
                          <span className="font-semibold text-red-700">
                            ALLERGY:{" "}
                          </span>
                        )}
                        {req.description}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
              <button
                type="button"
                disabled={submitting}
                onClick={() => {
                  setStepError(null);
                  setStep(2);
                }}
                className="cursor-pointer py-2.5 px-4 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold rounded-lg transition-colors inline-flex items-center gap-2 text-sm disabled:opacity-60"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </button>

              <button
                type="button"
                disabled={submitting}
                onClick={handleConfirmBooking}
                className="cursor-pointer py-2.5 px-6 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold rounded-lg shadow-xs transition-all inline-flex items-center gap-2 text-sm disabled:opacity-60"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Confirming...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Confirm reservation</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: CONFIRMATION RESULT */}
        {step === 4 && createdBooking && (
          <div className="bg-white rounded-2xl shadow-xs border border-gray-100 p-6 sm:p-8 space-y-6">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl flex-shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                  {bookingReference(createdBooking.id)} · Confirmed
                </span>
                <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 mt-0.5">
                  Reservation created for {createdBooking.hiker?.firstName}{" "}
                  {createdBooking.hiker?.lastName}
                </h2>
              </div>
            </div>

            {/* Temporary password banner (shown ONCE for new full accounts) */}
            {createdBooking.temporaryPassword && (
              <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-xl space-y-2">
                <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
                  <KeyRound className="w-4 h-4 text-amber-700" />
                  <span>Temporary password — shown once</span>
                </div>
                <p className="text-xs text-amber-900">
                  Give this temporary password to the hiker in person or by phone. It is never stored or sent by email, and they must change it at their first sign-in.
                </p>
                <div className="flex items-center justify-between gap-3 bg-white border border-amber-300 rounded-lg px-3.5 py-2.5">
                  <code className="font-mono text-base font-bold text-slate-900 select-all">
                    {createdBooking.temporaryPassword}
                  </code>
                  <button
                    type="button"
                    onClick={handleCopyTemporaryPassword}
                    className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-700 hover:bg-amber-800 text-white text-xs font-semibold rounded-md transition-colors"
                  >
                    {copiedPassword ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Confirmation email notice */}
            {createdBooking.hiker?.isTemporary ? (
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-700">
                No confirmation email was sent because this is a temporary hiker without an email address.
              </div>
            ) : createdBooking.confirmationSent ? (
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs sm:text-sm text-emerald-800">
                A confirmation email was sent to{" "}
                <strong>{createdBooking.hiker?.email}</strong>.
              </div>
            ) : (
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs sm:text-sm text-amber-900">
                The reservation is confirmed, though the confirmation email could not be sent.
              </div>
            )}

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Reference</span>
                <span className="font-bold text-slate-900">
                  {bookingReference(createdBooking.id)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Date & time</span>
                <span className="font-semibold text-slate-900">
                  {formatLongDate(createdBooking.startAt)}
                  {selectedSlot
                    ? ` · ${formatTimeRange(selectedSlot.startAt, selectedSlot.endAt)}`
                    : ""}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Party size</span>
                <span className="font-semibold text-slate-900">
                  {peopleLabel(createdBooking.partySize)}
                </span>
              </div>
              {Array.isArray(createdBooking.tables) &&
                createdBooking.tables.length > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Assigned tables</span>
                    <span className="font-semibold text-slate-900">
                      {createdBooking.tables
                        .map((t) => `Table ${t.tableNumber} (${t.seats} seats)`)
                        .join(", ")}
                    </span>
                  </div>
                )}
            </div>

            <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row gap-3 justify-end">
              <button
                type="button"
                onClick={handleResetWizard}
                className="cursor-pointer py-2.5 px-5 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold rounded-lg shadow-xs transition-colors text-sm text-center"
              >
                Enter another reservation
              </button>
              <button
                type="button"
                onClick={() => navigate("/")}
                className="cursor-pointer py-2.5 px-5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold rounded-lg transition-colors text-sm text-center"
              >
                Back to staff home
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}