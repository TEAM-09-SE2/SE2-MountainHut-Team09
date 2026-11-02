import React from 'react';
import { User, ShieldCheck } from 'lucide-react';

export default function RoleToggle({ isEmployee, onChange }) {
  return (
    <div className="flex bg-slate-100 p-1 rounded-xl mb-6">
      <button
        type="button"
        onClick={() => onChange(false)}
        className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
          !isEmployee
            ? 'bg-emerald-700 text-white shadow-xs'
            : 'text-slate-600 hover:text-slate-900'
        }`}
      >
        <User className="w-4 h-4" />
        <span>Hiker</span>
      </button>
      <button
        type="button"
        onClick={() => onChange(true)}
        className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
          isEmployee
            ? 'bg-slate-900 text-white shadow-xs'
            : 'text-slate-600 hover:text-slate-900'
        }`}
      >
        <ShieldCheck className="w-4 h-4" />
        <span>Staff / Employee</span>
      </button>
    </div>
  );
}