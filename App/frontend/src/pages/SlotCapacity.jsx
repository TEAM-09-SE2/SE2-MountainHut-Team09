import React, { useEffect, useRef, useState } from "react";
import {
  Mountain,
  Calendar,
  Clock,
  Users,
  Plus,
  Trash2,
  Copy,
  Save,
  Loader2,
  AlertCircle,
  RefreshCcw,
  LayoutGrid,
  CheckCircle2,
  ChevronRight,
} from "lucide-react";
import Toast from "../components/Toast";
import { getSlotsByDate, getSlot, createSlot } from "../api";

// --- Helpers ---
const formatTime = (iso) =>
  new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
const formatDate = (d) =>
  new Date(`${d}T00:00`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
const toMinutes = (time) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};
const fromMinutes = (min) =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
// Inputs keep the raw string so the field can be cleared while typing
const isPositiveInt = (value) =>
  /^\d+$/.test(String(value)) && Number(value) >= 1;

let keySeq = 0;
const nextKey = () => keySeq++;
const newTableType = (seats = 4, count = 1) => ({ key: nextKey(), seats, count });

// API tables [{ tableNumber, seats }] -> table types [{ seats, count }]
const groupTables = (tables) => {
  const counts = {};
  tables.forEach((t) => {
    counts[t.seats] = (counts[t.seats] || 0) + 1;
  });
  return Object.entries(counts)
    .map(([seats, count]) => newTableType(Number(seats), count))
    .sort((a, b) => a.seats - b.seats);
};
// Table types -> API tables, numbered 1..n
const expandTableTypes = (types) => {
  let tableNumber = 1;
  return types.flatMap((t) =>
    Array.from({ length: Number(t.count) }, () => ({
      tableNumber: tableNumber++,
      seats: Number(t.seats),
    })),
  );
};
const countTables = (types) =>
  types.reduce((sum, t) => sum + (Number(t.count) || 0), 0);
const countSeats = (types) =>
  types.reduce(
    (sum, t) => sum + (Number(t.seats) || 0) * (Number(t.count) || 0),
    0,
  );

const inputClass =
  "w-full min-w-0 border border-slate-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500";

// --- Step card wrapper ---
const StepCard = ({ step, title, subtitle, children, action }) => (
  <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
    <div className="flex justify-between items-start gap-4 mb-5">
      <div className="flex items-start gap-3">
        <span className="w-8 h-8 flex-shrink-0 rounded-full bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center">
          {step}
        </span>
        <div>
          <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
          {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
    {children}
  </div>
);

export default function SlotCapacity() {
  const [toastConfig, setToastConfig] = useState({
    visible: false,
    message: "",
  });

  // Step 1: day
  const [date, setDate] = useState("2026-11-01"); // date of the fake data, switch to today later

  // Step 2: slots of the day (saved ones come from the API, drafts are local until saved)
  const [savedSlots, setSavedSlots] = useState([]);
  const [savedSlotsState, setSavedSlotsState] = useState("loading"); // 'success' | 'loading' | 'error'
  const [drafts, setDrafts] = useState([]); // [{ key, startTime, endTime, tableTypes }]

  // Step 3: tables of the selected slot
  const [selectedId, setSelectedId] = useState(null); // 'saved-<id>' | 'draft-<key>'
  const [savedTables, setSavedTables] = useState({ state: "idle", types: [] });
  const [saving, setSaving] = useState(false);

  // Reuse tables from another slot
  const [copyDate, setCopyDate] = useState("2026-11-01");
  const [copySlots, setCopySlots] = useState([]);
  const [copySource, setCopySource] = useState("");

  const handleAction = (message) => {
    setToastConfig({ visible: true, message });
    setTimeout(
      () => setToastConfig((prev) => ({ ...prev, visible: false })),
      3000,
    );
  };

  // --- Loading ---
  // Ignore responses of requests made for a date that is no longer selected
  const savedSlotsRequest = useRef(0);
  const loadSavedSlots = async (d) => {
    const requestId = ++savedSlotsRequest.current;
    setSavedSlotsState("loading");
    try {
      const data = await getSlotsByDate(d);
      if (requestId !== savedSlotsRequest.current) return;
      setSavedSlots(data);
      setSavedSlotsState("success");
    } catch {
      if (requestId === savedSlotsRequest.current) setSavedSlotsState("error");
    }
  };

  const copySlotsRequest = useRef(0);
  const loadCopySlots = (d) => {
    const requestId = ++copySlotsRequest.current;
    setCopySource("");
    getSlotsByDate(d)
      .then((data) => requestId === copySlotsRequest.current && setCopySlots(data))
      .catch(() => requestId === copySlotsRequest.current && setCopySlots([]));
  };

  useEffect(() => {
    loadSavedSlots(date);
  }, [date]);

  useEffect(() => {
    loadCopySlots(copyDate);
  }, [copyDate]);

  // Tables of a saved slot are read from GET /slots/:id
  useEffect(() => {
    if (!selectedId?.startsWith("saved-")) return;
    let active = true;
    setSavedTables({ state: "loading", types: [] });
    getSlot(Number(selectedId.slice("saved-".length)))
      .then((s) => active && setSavedTables({ state: "success", types: groupTables(s.tables) }))
      .catch(() => active && setSavedTables({ state: "error", types: [] }));
    return () => {
      active = false;
    };
  }, [selectedId]);

  // --- Derived values ---
  const slots = [
    ...savedSlots.map((s) => ({
      id: `saved-${s.id}`,
      saved: true,
      slotId: s.id,
      start: formatTime(s.startAt),
      end: formatTime(s.endAt),
      totalSeats: s.totalSeats,
    })),
    ...drafts.map((d) => ({
      id: `draft-${d.key}`,
      saved: false,
      draftKey: d.key,
      start: d.startTime,
      end: d.endTime,
      tableTypes: d.tableTypes,
    })),
  ].sort((a, b) => toMinutes(a.start || "00:00") - toMinutes(b.start || "00:00"));

  const selected = slots.find((s) => s.id === selectedId) ?? null;

  const slotTimeError = (slot) => {
    if (!slot.start || !slot.end) return "Set start and end time.";
    if (toMinutes(slot.end) <= toMinutes(slot.start))
      return "End time must be after start time.";
    // Overlapping slots would add up their seats, exceeding the real capacity of the hut
    const overlapping = slots.filter(
      (o) =>
        o.id !== slot.id &&
        o.start &&
        o.end &&
        toMinutes(o.start) < toMinutes(slot.end) &&
        toMinutes(o.end) > toMinutes(slot.start),
    );
    if (overlapping.length)
      return `Overlaps with ${overlapping.map((o) => `${o.start}–${o.end}`).join(", ")}.`;
    return null;
  };
  const tablesError = (types) => {
    if (types.length === 0) return "Add at least one table type.";
    if (types.some((t) => !isPositiveInt(t.seats) || !isPositiveInt(t.count)))
      return "Seats per table and number of tables must be 1 or more.";
    return null;
  };
  const selectedError =
    selected && !selected.saved
      ? slotTimeError(selected) || tablesError(selected.tableTypes)
      : null;

  const selectedTypes = selected
    ? selected.saved
      ? savedTables.types
      : selected.tableTypes
    : [];

  // --- Step 1 ---
  const changeDate = (d) => {
    if (
      drafts.length &&
      !window.confirm("The unsaved time slots of this day will be lost. Continue?")
    )
      return;
    setDate(d);
    setSavedSlots([]);
    setDrafts([]);
    setSelectedId(null);
    setCopyDate(d);
  };

  // --- Step 2 ---
  const addSlot = () => {
    const lastEnd = slots.reduce(
      (max, s) => (s.end ? Math.max(max, toMinutes(s.end)) : max),
      -1,
    );
    const start = lastEnd >= 0 ? Math.min(lastEnd, 23 * 60) : 12 * 60;
    const draft = {
      key: nextKey(),
      startTime: fromMinutes(start),
      endTime: fromMinutes(Math.min(start + 60, 23 * 60 + 59)),
      tableTypes: [],
    };
    setDrafts((prev) => [...prev, draft]);
    setSelectedId(`draft-${draft.key}`);
  };
  const updateDraft = (key, changes) =>
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...changes } : d)));
  const removeDraft = (key) => {
    setDrafts((prev) => prev.filter((d) => d.key !== key));
    if (selectedId === `draft-${key}`) setSelectedId(null);
  };

  // --- Step 3 ---
  const updateTableTypes = (draftKey, update) =>
    setDrafts((prev) =>
      prev.map((d) => (d.key === draftKey ? { ...d, tableTypes: update(d.tableTypes) } : d)),
    );
  const addTableType = () =>
    updateTableTypes(selected.draftKey, (types) => [...types, newTableType()]);
  const changeTableType = (typeKey, field, value) =>
    updateTableTypes(selected.draftKey, (types) =>
      types.map((t) => (t.key === typeKey ? { ...t, [field]: value } : t)),
    );
  const removeTableType = (typeKey) =>
    updateTableTypes(selected.draftKey, (types) => types.filter((t) => t.key !== typeKey));

  // Saved slots of the copy day, plus the configured drafts when it is the same day
  const copyOptions = [
    ...copySlots.map((s) => ({
      value: `saved-${s.id}`,
      label: `${formatTime(s.startAt)}–${formatTime(s.endAt)} · ${s.totalSeats} seats`,
    })),
    ...(copyDate === date
      ? drafts
          .filter((d) => d.tableTypes.length && `draft-${d.key}` !== selectedId)
          .map((d) => ({
            value: `draft-${d.key}`,
            label: `${d.startTime}–${d.endTime} · ${countSeats(d.tableTypes)} seats (draft)`,
          }))
      : []),
  ];

  const copyTables = async () => {
    const draftKey = selected.draftKey;
    try {
      let types;
      if (copySource.startsWith("saved-")) {
        const source = await getSlot(Number(copySource.slice("saved-".length)));
        types = groupTables(source.tables);
      } else {
        const source = drafts.find((d) => `draft-${d.key}` === copySource);
        types = source.tableTypes.map((t) => newTableType(t.seats, t.count));
      }
      updateTableTypes(draftKey, () => types);
      handleAction(`Copied ${countTables(types)} tables · ${countSeats(types)} seats`);
    } catch {
      handleAction("Could not load the selected slot");
    }
  };

  const saveSlot = async () => {
    if (!selected || selected.saved || selectedError) return;
    const draft = selected;
    setSaving(true);
    try {
      const slot = await createSlot({
        startAt: new Date(`${date}T${draft.start}`).toISOString(),
        endAt: new Date(`${date}T${draft.end}`).toISOString(),
        tables: expandTableTypes(draft.tableTypes),
      });
      setDrafts((prev) => prev.filter((d) => d.key !== draft.draftKey));
      setSelectedId(`saved-${slot.id}`);
      await loadSavedSlots(date);
      if (copyDate === date) loadCopySlots(date);
      handleAction(`Slot ${draft.start}–${draft.end} saved · ${slot.totalSeats} seats`);
    } catch (err) {
      handleAction(err.message || "Could not save the slot");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-white font-sans text-slate-900 overflow-x-hidden relative">
      <Toast
        visible={toastConfig.visible}
        message={toastConfig.message}
        onClose={() => setToastConfig({ ...toastConfig, visible: false })}
      />

      {/* --- Top Bar --- */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-gray-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="h-16 grid grid-cols-4 lg:grid-cols-12 items-center gap-4">
            <a
              href="/"
              className="col-span-2 lg:col-span-3 flex items-center gap-2.5"
            >
              <div className="p-1.5 bg-emerald-100 rounded-lg text-emerald-700">
                <Mountain className="w-6 h-6" />
              </div>
              <span className="font-bold text-lg tracking-tight text-slate-900">
                Skyreach Hut
              </span>
            </a>
            <nav className="hidden lg:flex col-span-6 justify-center space-x-8">
              <a
                href="#"
                className="text-sm font-medium text-slate-600 hover:text-emerald-700 transition-colors"
              >
                Services
              </a>
              <a
                href="#"
                className="text-sm font-medium text-slate-600 hover:text-emerald-700 transition-colors"
              >
                Planning
              </a>
              <a
                href="/staff/slots"
                className="text-sm font-medium text-emerald-700"
              >
                Slot management
              </a>
            </nav>
            <div className="col-span-2 lg:col-span-3 flex justify-end items-center gap-3">
              <span className="text-xs font-semibold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200/60 px-3 py-1 rounded-full">
                Staff
              </span>
            </div>
          </div>
        </div>
      </header>

      <main>
        {/* --- Title --- */}
        <section className="pt-12 pb-8 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
              Staff area / Slot management
            </p>
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 mb-2">
              Slot capacity
            </h1>
            <p className="text-slate-600">
              Choose a day, define its time slots, then set the tables available in each slot.
            </p>
          </div>
        </section>

        <section className="pb-20 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
            {/* --- Step 1: day --- */}
            <StepCard
              step={1}
              title="Choose the day"
              subtitle="The time slots and tables below refer to this day."
            >
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <label className="block sm:w-64">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase mb-1">
                    <Calendar className="w-3.5 h-3.5" /> Date
                  </span>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => e.target.value && changeDate(e.target.value)}
                    className={inputClass}
                  />
                </label>
                <p className="text-lg font-semibold text-emerald-700 sm:mt-5">
                  {formatDate(date)}
                </p>
              </div>
            </StepCard>

            {/* --- Step 2: time slots of the day --- */}
            <StepCard
              step={2}
              title="Time slots of the day"
              subtitle="Add every slot of the day, e.g. 12:00–13:00 and 13:00–14:00 for lunch."
              action={
                <button
                  onClick={addSlot}
                  className="flex items-center gap-2 bg-emerald-700 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-emerald-800 transition-colors shadow-sm flex-shrink-0"
                >
                  <Plus className="w-4 h-4" /> Add time slot
                </button>
              }
            >
              {/* STATE: LOADING */}
              {savedSlotsState === "loading" && savedSlots.length === 0 && (
                <div className="flex flex-col items-center justify-center h-32 bg-slate-50 rounded-2xl border border-gray-100 border-dashed">
                  <Loader2 className="w-7 h-7 text-emerald-600 animate-spin mb-3" />
                  <p className="text-slate-600 font-medium">Loading slots...</p>
                </div>
              )}

              {/* STATE: ERROR */}
              {savedSlotsState === "error" && (
                <div className="flex flex-col items-center justify-center bg-red-50 rounded-2xl border border-red-100 text-center p-6 mb-4">
                  <AlertCircle className="w-8 h-8 text-red-500 mb-2" />
                  <h4 className="font-bold text-slate-900 mb-3">Could not load the saved slots</h4>
                  <button
                    onClick={() => loadSavedSlots(date)}
                    className="flex items-center gap-2 bg-white border border-gray-300 text-slate-700 px-4 py-2 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                  >
                    <RefreshCcw className="w-4 h-4" /> Retry
                  </button>
                </div>
              )}

              {/* STATE: EMPTY */}
              {savedSlotsState === "success" && slots.length === 0 && (
                <div className="flex flex-col items-center justify-center h-32 bg-slate-50 rounded-2xl border border-gray-100 border-dashed text-center p-6">
                  <Clock className="w-8 h-8 text-slate-400 mb-2" />
                  <h4 className="font-bold text-slate-900 mb-1">No time slots for this day</h4>
                  <p className="text-slate-600 text-sm">Use "Add time slot" to create the first one.</p>
                </div>
              )}

              {/* STATE: SUCCESS */}
              {slots.length > 0 && (
                <div className="space-y-3">
                  {slots.map((s) => {
                    const timeError = s.saved ? null : slotTimeError(s);
                    const isSelected = s.id === selectedId;
                    return (
                      <div
                        key={s.id}
                        className={`border rounded-xl p-4 transition-colors ${
                          isSelected ? "border-emerald-500 bg-emerald-50/40" : "border-gray-200 bg-white"
                        }`}
                      >
                        <div className="flex flex-col md:flex-row md:items-center gap-3">
                          {/* Time */}
                          {s.saved ? (
                            <div className="flex items-center gap-2 text-lg font-bold text-slate-900 md:w-72">
                              <Clock className="w-5 h-5 text-emerald-700" /> {s.start} – {s.end}
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 md:w-72">
                              <input
                                type="time"
                                aria-label="Start time"
                                value={s.start}
                                onChange={(e) => updateDraft(s.draftKey, { startTime: e.target.value })}
                                className={inputClass}
                              />
                              <span className="text-slate-400">–</span>
                              <input
                                type="time"
                                aria-label="End time"
                                value={s.end}
                                onChange={(e) => updateDraft(s.draftKey, { endTime: e.target.value })}
                                className={inputClass}
                              />
                            </div>
                          )}

                          {/* Status */}
                          <div className="flex-1">
                            {s.saved ? (
                              <span className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 text-xs font-bold px-2.5 py-1 rounded-full">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Saved · {s.totalSeats} seats
                              </span>
                            ) : s.tableTypes.length ? (
                              <span className="bg-orange-50 text-orange-700 text-xs font-bold px-2.5 py-1 rounded-full">
                                Not saved · {countTables(s.tableTypes)} tables, {countSeats(s.tableTypes)} seats
                              </span>
                            ) : (
                              <span className="bg-slate-100 text-slate-600 text-xs font-bold px-2.5 py-1 rounded-full">
                                Not saved · no tables yet
                              </span>
                            )}
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => setSelectedId(s.id)}
                              className="flex items-center gap-1 text-sm text-emerald-700 font-semibold hover:underline"
                            >
                              {s.saved ? "View tables" : "Set tables"} <ChevronRight className="w-4 h-4" />
                            </button>
                            {!s.saved && (
                              <button
                                onClick={() => removeDraft(s.draftKey)}
                                aria-label="Remove time slot"
                                className="text-slate-400 hover:text-red-600 transition-colors"
                              >
                                <Trash2 className="w-5 h-5" />
                              </button>
                            )}
                          </div>
                        </div>
                        {timeError && (
                          <p className="flex items-center gap-1.5 text-sm text-red-600 mt-2">
                            <AlertCircle className="w-4 h-4" /> {timeError}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </StepCard>

            {/* --- Step 3: tables of the selected slot --- */}
            <div className="grid grid-cols-4 lg:grid-cols-12 gap-6 lg:gap-8">
              <div className="col-span-4 lg:col-span-8 min-w-0">
                <StepCard
                  step={3}
                  title="Tables of the slot"
                  subtitle="Choose a slot and set how many tables of each size it has."
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
                    <div>
                      <span className="block text-xs font-semibold text-slate-500 uppercase mb-1">Day</span>
                      <p className="px-3 py-2 rounded-lg bg-slate-50 border border-gray-100 font-medium">
                        {formatDate(date)}
                      </p>
                    </div>
                    <label className="block">
                      <span className="block text-xs font-semibold text-slate-500 uppercase mb-1">Slot</span>
                      <select
                        value={selectedId ?? ""}
                        onChange={(e) => setSelectedId(e.target.value || null)}
                        className={inputClass}
                      >
                        <option value="">{slots.length ? "Select a time slot" : "No time slots yet"}</option>
                        {slots.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.start}–{s.end} {s.saved ? "(saved)" : "(not saved)"}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  {/* No slot selected */}
                  {!selected && (
                    <div className="flex flex-col items-center justify-center h-40 bg-slate-50 rounded-2xl border border-gray-100 border-dashed text-center p-6">
                      <LayoutGrid className="w-10 h-10 text-slate-400 mb-3" />
                      <h4 className="text-lg font-bold text-slate-900 mb-1">No slot selected</h4>
                      <p className="text-slate-600 text-sm">Pick a time slot to see or set its tables.</p>
                    </div>
                  )}

                  {/* Saved slot: read only */}
                  {selected?.saved && (
                    <>
                      {savedTables.state === "loading" && (
                        <div className="flex items-center justify-center h-32">
                          <Loader2 className="w-7 h-7 text-emerald-600 animate-spin" />
                        </div>
                      )}
                      {savedTables.state === "error" && (
                        <p className="flex items-center gap-2 text-red-600">
                          <AlertCircle className="w-4 h-4" /> Could not load the tables of this slot.
                        </p>
                      )}
                      {savedTables.state === "success" && (
                        <>
                          <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl">
                            {savedTables.types.map((t) => (
                              <div key={t.key} className="flex justify-between px-4 py-3">
                                <span className="font-medium text-slate-900">
                                  {t.count} {t.count === 1 ? "table" : "tables"} of {t.seats} seats
                                </span>
                                <span className="text-slate-500">{t.count * t.seats} seats</span>
                              </div>
                            ))}
                          </div>
                          <p className="text-sm text-slate-500 mt-4">
                            This slot is already saved. Changing an existing slot is part of MH-19 (modify slot).
                          </p>
                        </>
                      )}
                    </>
                  )}

                  {/* Draft slot: editable */}
                  {selected && !selected.saved && (
                    <>
                      {/* Reuse tables from another slot */}
                      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-end bg-slate-50 border border-gray-100 rounded-xl p-4 mb-5">
                        <label className="block sm:w-44">
                          <span className="text-xs font-semibold text-slate-500 uppercase">Copy from day</span>
                          <input
                            type="date"
                            value={copyDate}
                            onChange={(e) => e.target.value && setCopyDate(e.target.value)}
                            className={`mt-1 ${inputClass}`}
                          />
                        </label>
                        <label className="block flex-1 min-w-0">
                          <span className="text-xs font-semibold text-slate-500 uppercase">Slot</span>
                          <select
                            value={copySource}
                            onChange={(e) => setCopySource(e.target.value)}
                            className={`mt-1 ${inputClass}`}
                          >
                            <option value="">{copyOptions.length ? "Select a slot" : "No slots to copy from"}</option>
                            {copyOptions.map((o) => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                        </label>
                        <button
                          onClick={copyTables}
                          disabled={!copySource}
                          className="flex items-center justify-center gap-2 bg-white text-slate-700 border border-slate-300 px-4 py-2 rounded-lg font-medium hover:bg-slate-50 transition-colors disabled:opacity-50"
                        >
                          <Copy className="w-4 h-4" /> Copy tables
                        </button>
                      </div>

                      {selected.tableTypes.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-40 bg-slate-50 rounded-2xl border border-gray-100 border-dashed text-center p-6">
                          <LayoutGrid className="w-10 h-10 text-slate-400 mb-3" />
                          <h4 className="text-lg font-bold text-slate-900 mb-1">No tables yet</h4>
                          <p className="text-slate-600 text-sm">Add a table type or copy the tables from another slot.</p>
                        </div>
                      ) : (
                        <div className="divide-y divide-gray-100">
                          <div className="grid grid-cols-12 gap-4 pb-2 text-xs font-semibold text-slate-500 uppercase">
                            <span className="col-span-4">Seats per table</span>
                            <span className="col-span-4">Number of tables</span>
                            <span className="col-span-3">Seats</span>
                          </div>
                          {selected.tableTypes.map((t) => (
                            <div key={t.key} className="grid grid-cols-12 gap-4 py-3 items-center">
                              <input
                                type="number"
                                min="1"
                                aria-label="Seats per table"
                                value={t.seats}
                                onChange={(e) => changeTableType(t.key, "seats", e.target.value)}
                                className={`col-span-4 ${inputClass}`}
                              />
                              <input
                                type="number"
                                min="1"
                                aria-label="Number of tables"
                                value={t.count}
                                onChange={(e) => changeTableType(t.key, "count", e.target.value)}
                                className={`col-span-4 ${inputClass}`}
                              />
                              <span className="col-span-3 font-medium text-slate-700">
                                {(Number(t.seats) || 0) * (Number(t.count) || 0)}
                              </span>
                              <button
                                onClick={() => removeTableType(t.key)}
                                aria-label="Remove table type"
                                className="col-span-1 flex justify-center text-slate-400 hover:text-red-600 transition-colors"
                              >
                                <Trash2 className="w-5 h-5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      <button
                        onClick={addTableType}
                        className="mt-4 flex items-center gap-2 text-sm text-emerald-700 font-semibold hover:underline"
                      >
                        <Plus className="w-4 h-4" /> Add table type
                      </button>
                    </>
                  )}
                </StepCard>
              </div>

              {/* Summary & actions */}
              <aside className="col-span-4 lg:col-span-4 min-w-0">
                <div className="lg:sticky lg:top-24 bg-slate-50 p-6 rounded-2xl border border-gray-100 space-y-4">
                  <h2 className="text-xl font-semibold text-slate-900">Capacity summary</h2>
                  <div className="bg-white rounded-xl border border-gray-100 p-5 text-center">
                    <Users className="w-7 h-7 text-emerald-700 mx-auto mb-2" />
                    <p className="text-4xl font-extrabold text-slate-900">{countSeats(selectedTypes)}</p>
                    <p className="text-sm text-slate-500">seats on {countTables(selectedTypes)} tables</p>
                  </div>
                  <p className="text-sm text-slate-600">
                    {selected ? `${formatDate(date)} · ${selected.start}–${selected.end}` : "No slot selected"}
                  </p>
                  {selectedError && (
                    <p className="flex gap-2 text-sm text-red-600">
                      <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      {selectedError}
                    </p>
                  )}
                  {selected && !selected.saved && (
                    <button
                      onClick={saveSlot}
                      disabled={!!selectedError || saving}
                      className="w-full flex items-center justify-center gap-2 bg-emerald-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-emerald-500 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                      Save slot
                    </button>
                  )}
                </div>
              </aside>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
