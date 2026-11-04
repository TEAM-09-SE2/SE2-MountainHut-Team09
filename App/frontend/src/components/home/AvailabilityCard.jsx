import React from 'react';
import { Utensils } from 'lucide-react';

export default function AvailabilityCard({ date, shift, time, seatsLeft, onBook }) {
  const isLowAvailability = seatsLeft <= 5;

  return (
    <div className="border border-slate-200 rounded-xl p-5 hover:border-emerald-500 transition-colors bg-white shadow-xs">
      <div className="flex justify-between items-start mb-4">
        <div>
          <p className="text-sm font-semibold text-emerald-700 mb-1">{date}</p>
          <h4 className="text-lg font-bold text-slate-900">{shift}</h4>
        </div>
        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
          isLowAvailability ? 'bg-orange-50 text-orange-700' : 'bg-emerald-50 text-emerald-700'
        }`}>
          {isLowAvailability ? 'Few Seats' : 'Available'}
        </span>
      </div>
      <div className="flex items-center gap-2 text-sm text-slate-600 mb-4">
        <Utensils className="w-4 h-4 text-slate-400" />
        <span>{time}</span>
      </div>
      <div className="pt-4 border-t border-slate-100 flex justify-between items-center">
        <span className={`text-sm font-medium ${isLowAvailability ? 'text-orange-700' : 'text-slate-700'}`}>
          {seatsLeft} seats left
        </span>
        <button
          onClick={onBook}
          className="text-sm text-emerald-700 font-semibold hover:underline"
        >
          Book slot
        </button>
      </div>
    </div>
  );
}