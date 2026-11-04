import React, { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Calendar, Clock, Users, Search, Loader2, AlertCircle, RefreshCcw } from 'lucide-react';
import Navbar from '../components/common/Navbar';
import Footer from '../components/common/Footer';
import InputField from '../components/common/InputField';
import AvailabilityResult from '../components/availability/AvailabilityResult';
import { checkAvailability } from '../services/availabilityApi';

// "en-CA" gives YYYY-MM-DD, the format of the date input
const todayAtHut = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' });

const formatDate = (date) =>
  new Date(`${date}T00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

// Same time check as the API, so a search the API would reject never leaves the page
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export default function CheckAvailability() {
  // The last search lives in the URL, so it survives going to the login page and back
  const [searchParams, setSearchParams] = useSearchParams();
  const [date, setDate] = useState(() => searchParams.get('date') ?? todayAtHut());
  const [time, setTime] = useState(() => searchParams.get('time') ?? '');
  const [partySize, setPartySize] = useState(() => searchParams.get('partySize') ?? '2');
  const [fieldErrors, setFieldErrors] = useState({});

  const [searchState, setSearchState] = useState('idle'); // 'idle' | 'loading' | 'success' | 'error'
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null); // { message, canRetry }

  const validate = () => {
    const errors = {};
    if (!date) errors.date = 'Please choose a date.';
    else if (date < todayAtHut()) errors.date = 'Please choose today or a later date.';

    if (!time) errors.time = 'Please choose a time.';
    else if (!TIME_PATTERN.test(time)) errors.time = 'Please enter the time as HH:mm.';

    if (!partySize) errors.partySize = 'Please enter the number of people.';
    else if (!/^\d+$/.test(partySize) || Number(partySize) < 1) errors.partySize = 'Enter a whole number, 1 or more.';
    else if (!Number.isSafeInteger(Number(partySize))) errors.partySize = 'That number is too large.';
    return errors;
  };

  const runCheck = async (query) => {
    setSearchState('loading');
    setError(null);
    try {
      const data = await checkAvailability(query.date, query.time, query.partySize);
      setResult(data);
      setSearchState('success');
    } catch (err) {
      setError({
        message: err.status ? err.message : 'There was a problem connecting to the hut booking system.',
        // A 4xx means the API rejected the search itself, so sending it again would not help
        canRetry: !err.status || err.status >= 500,
      });
      setSearchState('error');
    }
  };

  // Used by the form and by Retry, so Retry always checks what the form shows
  const submitSearch = () => {
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSearchParams({ date, time, partySize }, { replace: true });
    runCheck({ date, time, partySize: Number(partySize) });
  };

  // Opened with a search in the URL (e.g. back from "Log in to book"): show its result again.
  // The ref stops React's development double-run from sending the request twice.
  const ranUrlSearch = useRef(false);
  useEffect(() => {
    if (ranUrlSearch.current) return;
    ranUrlSearch.current = true;
    if (searchParams.has('date') && searchParams.has('time') && searchParams.has('partySize')) submitSearch();
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    submitSearch();
  };

  return (
    <div className="min-h-screen bg-white font-sans text-slate-900 max-w-[1440px] mx-auto shadow-xl overflow-x-hidden flex flex-col justify-between">
      <Navbar />

      <main className="flex-1 bg-slate-50">
        <section className="py-12 lg:py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            {/* Header */}
            <div className="mb-8">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                Skyreach Hut · Cloudcrest Ridge
              </p>
              <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-900 tracking-tight mb-3">Find a table</h1>
              <p className="text-lg text-slate-600">Pick when you want to come up and see if there is room for your party.</p>
            </div>

            {/* Search panel */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-xs p-6">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Check availability</p>
              <form onSubmit={handleSubmit} noValidate className="grid grid-cols-4 lg:grid-cols-12 gap-x-4">
                <div className="col-span-4 lg:col-span-4">
                  <InputField
                    id="date"
                    label="Date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    min={todayAtHut()}
                    icon={Calendar}
                    error={fieldErrors.date}
                    required
                  />
                </div>
                <div className="col-span-2 lg:col-span-3">
                  <InputField
                    id="time"
                    label="Time"
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    icon={Clock}
                    error={fieldErrors.time}
                    helperText="Hut local time"
                    required
                  />
                </div>
                <div className="col-span-2 lg:col-span-2">
                  <InputField
                    id="partySize"
                    label="People"
                    type="number"
                    value={partySize}
                    onChange={(e) => setPartySize(e.target.value)}
                    icon={Users}
                    error={fieldErrors.partySize}
                    required
                  />
                </div>
                <div className="col-span-4 lg:col-span-3 lg:pt-[22px]">
                  <button
                    type="submit"
                    disabled={searchState === 'loading'}
                    className="w-full h-[42px] bg-emerald-700 hover:bg-emerald-800 text-white font-semibold rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {searchState === 'loading' ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Search className="w-4 h-4" />
                    )}
                    <span>Check availability</span>
                  </button>
                </div>
              </form>
            </div>

            <div className="mt-10 grid grid-cols-4 lg:grid-cols-12 gap-8">
              {/* Result */}
              <div className="col-span-4 lg:col-span-8">
                {searchState === 'idle' && (
                  <div className="flex flex-col items-center justify-center h-48 rounded-2xl border border-slate-200 border-dashed text-center p-6">
                    <Search className="w-8 h-8 text-slate-400 mb-3" />
                    <h4 className="text-lg font-bold text-slate-900 mb-1">Choose a date, time and party size</h4>
                    <p className="text-slate-600 max-w-sm text-sm">
                      We will tell you if there is room and how your party would be seated.
                    </p>
                  </div>
                )}

                {searchState === 'loading' && (
                  <div className="flex flex-col items-center justify-center h-48 bg-white rounded-2xl border border-slate-100 border-dashed">
                    <Loader2 className="w-8 h-8 text-emerald-600 animate-spin mb-4" />
                    <p className="text-slate-600 font-medium">Checking availability...</p>
                  </div>
                )}

                {searchState === 'error' && (
                  <div className="flex flex-col items-center justify-center h-48 bg-red-50 rounded-2xl border border-red-100 text-center p-6">
                    <AlertCircle className="w-10 h-10 text-red-500 mb-3" />
                    <h4 className="text-lg font-bold text-slate-900 mb-1">Could not check availability</h4>
                    <p className="text-slate-600 max-w-sm text-sm">{error.message}</p>
                    {error.canRetry && (
                      <button
                        onClick={submitSearch}
                        className="mt-4 flex items-center gap-2 bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg font-medium hover:bg-slate-50 transition-colors"
                      >
                        <RefreshCcw className="w-4 h-4" /> Retry
                      </button>
                    )}
                  </div>
                )}

                {searchState === 'success' && result && (
                  <>
                    <div className="mb-4">
                      <h2 className="text-2xl font-bold text-slate-900">Result</h2>
                      <p className="text-sm text-slate-600">
                        {formatDate(result.date)} · {result.time} · {result.partySize}{' '}
                        {result.partySize === 1 ? 'person' : 'people'}
                      </p>
                    </div>
                    <AvailabilityResult result={result} />
                  </>
                )}
              </div>

              {/* Side panel */}
              <aside className="col-span-4 lg:col-span-4 space-y-4">
                <div className="bg-white rounded-2xl border border-slate-100 shadow-xs p-6">
                  <h3 className="text-lg font-bold text-slate-900 mb-2">A stop at altitude</h3>
                  <p className="text-sm text-slate-600">Choose the slot you prefer.</p>
                  <ul className="mt-5 pt-5 border-t border-slate-100 space-y-2.5 text-sm text-slate-600">
                    <li className="flex items-center gap-2.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 flex-shrink-0" />
                      Available: enough seats for your party
                    </li>
                    <li className="flex items-center gap-2.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-orange-500 flex-shrink-0" />
                      Few seats: your party fits, but only a few seats are left
                    </li>
                    <li className="flex items-center gap-2.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-slate-400 flex-shrink-0" />
                      Not enough seats: fewer free seats than people in your party
                    </li>
                    <li className="flex items-center gap-2.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-slate-400 flex-shrink-0" />
                      Full or booking closed: this slot cannot be booked
                    </li>
                  </ul>
                </div>

                <div className="bg-white rounded-2xl border border-slate-100 shadow-xs p-6">
                  <h3 className="text-lg font-bold text-slate-900 mb-2">Plans changed?</h3>
                  <p className="text-sm text-slate-600 mb-3">Just pick another date or time and check again.</p>
                  <Link to="/" className="text-sm font-semibold text-emerald-700 hover:underline">
                    Discover the hut →
                  </Link>
                </div>
              </aside>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
