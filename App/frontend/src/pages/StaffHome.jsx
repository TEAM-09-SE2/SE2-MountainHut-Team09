import React from "react";
import { useNavigate } from "react-router-dom";
import {
  CalendarClock,
  ArrowRight,
  Users,
  UserPlus,
  ClipboardList,
} from "lucide-react";
import Navbar from "../components/common/Navbar";
import { useAuth } from "../context/AuthContext";

// Home page for employees and wardens
export default function StaffHome() {
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 flex flex-col">
      <Navbar />

      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xs border border-gray-100 p-8 text-center">
          <div className="w-14 h-14 mx-auto mb-4 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
            <CalendarClock className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Welcome, {user?.firstName}
          </h1>
          <p className="text-sm text-slate-600 mt-2 mb-6">
            {user?.role === "warden"
              ? "Reserve tables for hikers, view bookings, define meal time slots and tables, and create employee accounts."
              : "Reserve tables for hikers, view bookings, and define meal time slots and tables."}
          </p>
          <button
            type="button"
            onClick={() => navigate("/staff/reserve")}
            className="cursor-pointer w-full py-3 px-4 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold rounded-lg shadow-xs hover:shadow-md transition-all flex items-center justify-center gap-2 text-sm"
          >
            <UserPlus className="w-4 h-4" />
            <span>Reserve for a hiker</span>
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => navigate("/staff/bookings")}
            className="cursor-pointer mt-3 w-full py-3 px-4 bg-white border border-slate-300 hover:border-emerald-600 text-slate-800 font-semibold rounded-lg transition-all flex items-center justify-center gap-2 text-sm"
          >
            <ClipboardList className="w-4 h-4" />
            <span>View bookings</span>
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => navigate("/staff/slots")}
            className="cursor-pointer mt-3 w-full py-3 px-4 bg-white border border-slate-300 hover:border-emerald-600 text-slate-800 font-semibold rounded-lg transition-all flex items-center justify-center gap-2 text-sm"
          >
            <span>Define time slots</span>
            <ArrowRight className="w-4 h-4" />
          </button>
          {/* Only the warden creates employee accounts */}
          {user?.role === "warden" && (
            <button
              type="button"
              onClick={() => navigate("/staff/employees")}
              className="cursor-pointer mt-3 w-full py-3 px-4 bg-white border border-slate-300 hover:border-emerald-600 text-slate-800 font-semibold rounded-lg transition-all flex items-center justify-center gap-2 text-sm"
            >
              <Users className="w-4 h-4" />
              <span>Manage employees</span>
            </button>
          )}
        </div>
      </main>
    </div>
  );
}