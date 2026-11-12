import React from "react";
import { useNavigate } from "react-router-dom";
import { CalendarClock, ArrowRight } from "lucide-react";
import Navbar from "../components/common/Navbar";
import { useAuth } from "../context/AuthContext";

//Home page for employees and wardens: no hiker content, only the staff actions
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
            Welcome, {user.firstName}
          </h1>
          <p className="text-sm text-slate-600 mt-2 mb-6">
            Define the time slots and the tables available for each meal service.
          </p>
          <button
            type="button"
            onClick={() => navigate("/staff/slots")}
            className="w-full py-3 px-4 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold rounded-lg shadow-xs hover:shadow-md transition-all flex items-center justify-center gap-2 text-sm"
          >
            <span>Define time slots</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </main>
    </div>
  );
}
