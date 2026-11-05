import React, { useState } from "react";
import {
  Calendar,
  Utensils,
  Map,
  Cloud,
  Loader2,
  CheckCircle2,
  AlertCircle,
  RefreshCcw,
} from "lucide-react";
import Navbar from "../components/common/Navbar";
import Footer from "../components/common/Footer";
import StepCard from "../components/home/StepCard";
import AvailabilityCard from "../components/home/AvailabilityCard";
import { useNavigate } from "react-router-dom";

export default function Home() {
  const navigate = useNavigate();
  const [availabilityState, setAvailabilityState] = useState("success"); // 'success' | 'loading' | 'empty' | 'error'

  const scrollToAvailability = () => {
    document
      .getElementById("availability")
      ?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-white font-sans text-slate-900 overflow-x-hidden flex flex-col justify-between">
      {/* 1. Top Bar */}
      <Navbar />

      <main className="flex-1">
        {/* 2. Hero Section */}
        <section className="py-12 lg:py-20 bg-white overflow-hidden">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-4 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
              {/* Text Content */}
              <div className="col-span-4 lg:col-span-5 order-2 lg:order-1">
                <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 border border-emerald-200/60 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-4">
                  <Cloud className="w-3.5 h-3.5" />
                  <span>Altitude 2,500m</span>
                </div>

                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-slate-900 tracking-tight mb-6 leading-tight">
                  High-altitude hospitality for trail lovers.
                </h1>

                <p className="text-lg sm:text-xl text-slate-600 mb-8 leading-relaxed">
                  Step above the sky. Disconnect from the valley, breathe the
                  mountain air, and savor authentic local alpine dining perched
                  high on the ridge line.
                </p>

                <div className="flex flex-col sm:flex-row gap-4">
                  {/* Primary CTA -> MH-01 flow */}
                  <button
                    onClick={() => navigate("/book-table")}
                    className="bg-emerald-700 text-white px-8 py-4 rounded-xl font-semibold text-lg hover:bg-emerald-800 transition-all shadow-md hover:shadow-lg text-center"
                  >
                    Book now
                  </button>

                  {/* Secondary CTA -> MH-04 flow */}
                  <button
                    onClick={scrollToAvailability}
                    className="bg-white text-slate-700 border border-slate-300 px-8 py-4 rounded-xl font-semibold text-lg hover:bg-slate-50 transition-colors text-center"
                  >
                    Check availability
                  </button>
                </div>
              </div>

              {/* Hero Image */}
              <div className="col-span-4 lg:col-span-7 order-1 lg:order-2">
                <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-slate-100">
                  <img
                    src="/images/rifugio.jpg"
                    alt="Skyreach Hut"
                    className="w-full h-[400px] object-cover hover:scale-105 transition-transform duration-700"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent"></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 3. How it Works Section */}
        <section
          id="how-it-works"
          className="py-20 bg-slate-50 border-y border-slate-100"
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-slate-900 mb-4">
                How it works
              </h2>
              <p className="text-slate-600">
                Booking your table at Skyreach Hut is simple.
              </p>
            </div>

            <div className="grid grid-cols-4 lg:grid-cols-12 gap-6 lg:gap-8">
              <StepCard
                number={1}
                title="Choose Dates"
                description="Check our calendar for available shifts during the open season."
                icon={Calendar}
              />
              <StepCard
                number={2}
                title="Select a Slot"
                description="Reserve your table for lunch or dinner based on remaining seats."
                icon={Utensils}
              />
              <StepCard
                number={3}
                title="Hike & Enjoy"
                description="Follow the trail, arrive at 2,500m altitude, and let us serve you."
                icon={Map}
              />
            </div>
          </div>
        </section>

        {/* 4. Upcoming Availability Section */}
        <section id="availability" className="py-20 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mb-10">
              <h2 className="text-3xl font-bold text-slate-900 mb-2">
                Upcoming availability
              </h2>
              <p className="text-slate-600">
                A quick glance at slots in the next few days.
              </p>
            </div>

            <div className="min-h-[220px]">
              {/* STATE: SUCCESS */}
              {availabilityState === "success" && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <AvailabilityCard
                    date="Sat, Aug 12"
                    shift="Lunch Shift"
                    time="12:00 PM - 1:30 PM"
                    seatsLeft={12}
                    onBook={() => alert("Booking Aug 12 Lunch")}
                  />
                  <AvailabilityCard
                    date="Sat, Aug 12"
                    shift="Dinner Shift"
                    time="7:00 PM - 8:30 PM"
                    seatsLeft={4}
                    onBook={() => alert("Booking Aug 12 Dinner")}
                  />
                  <AvailabilityCard
                    date="Sun, Aug 13"
                    shift="Lunch Shift"
                    time="12:00 PM - 1:30 PM"
                    seatsLeft={18}
                    onBook={() => alert("Booking Aug 13 Lunch")}
                  />
                </div>
              )}

              {/* STATE: LOADING */}
              {availabilityState === "loading" && (
                <div className="flex flex-col items-center justify-center h-48 bg-slate-50 rounded-2xl border border-slate-100 border-dashed">
                  <Loader2 className="w-8 h-8 text-emerald-600 animate-spin mb-4" />
                  <p className="text-slate-600 font-medium">
                    Checking live availability at Skyreach Hut...
                  </p>
                </div>
              )}

              {/* STATE: EMPTY */}
              {availabilityState === "empty" && (
                <div className="flex flex-col items-center justify-center h-48 bg-slate-50 rounded-2xl border border-slate-100 text-center p-6">
                  <CheckCircle2 className="w-10 h-10 text-slate-400 mb-3" />
                  <h4 className="text-lg font-bold text-slate-900 mb-1">
                    No upcoming slots available
                  </h4>
                  <p className="text-slate-600 max-w-sm">
                    Skyreach Hut is fully booked for the next few days. Please
                    check back later.
                  </p>
                </div>
              )}

              {/* STATE: ERROR */}
              {availabilityState === "error" && (
                <div className="flex flex-col items-center justify-center h-48 bg-red-50 rounded-2xl border border-red-100 text-center p-6">
                  <AlertCircle className="w-10 h-10 text-red-500 mb-3" />
                  <h4 className="text-lg font-bold text-slate-900 mb-1">
                    Could not load availability
                  </h4>
                  <p className="text-slate-600 max-w-sm mb-4">
                    There was a problem connecting to the hut booking system.
                  </p>
                  <button
                    onClick={() => {
                      setAvailabilityState("loading");
                      setTimeout(() => setAvailabilityState("success"), 1000);
                    }}
                    className="flex items-center gap-2 bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg font-medium hover:bg-slate-50 transition-colors"
                  >
                    <RefreshCcw className="w-4 h-4" /> Retry
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* 5. Footer */}
      <Footer />
    </div>
  );
}
