import React, { useState } from 'react';
import { Lock, Eye, EyeOff } from 'lucide-react';

export default function PasswordInput({ id, label = "Password", value, onChange, required = true, error }) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="mb-4 text-left">
      <label htmlFor={id} className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
        {label}
      </label>
      <div className="relative flex items-center">
        <div className="absolute left-3 text-slate-400 pointer-events-none flex items-center">
          <Lock className="w-5 h-5" />
        </div>
        <input
          id={id}
          type={showPassword ? "text" : "password"}
          value={value}
          onChange={onChange}
          required={required}
          placeholder="••••••••"
          className={`w-full pl-10 pr-10 py-2.5 bg-white border ${
            error ? 'border-red-400 focus:ring-red-400' : 'border-slate-200 focus:border-emerald-600 focus:ring-emerald-600'
          } rounded-xl text-slate-900 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-opacity-20 transition-all`}
        />
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          className="absolute right-3 text-slate-400 hover:text-slate-600 transition-colors p-1"
          aria-label={showPassword ? "Hide password" : "Show password"}
        >
          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}