import React from 'react';

export default function Checkbox({ id, label, checked, onChange, onBlur, name }) {
  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        name={name ?? id}
        type="checkbox"
        checked={checked}
        onChange={onChange}
        onBlur={onBlur}
        className="w-4 h-4 text-emerald-700 bg-white border-slate-300 rounded focus:ring-emerald-600 focus:ring-2 accent-emerald-700 cursor-pointer"
      />
      <label htmlFor={id} className="text-xs font-medium text-slate-600 cursor-pointer select-none">
        {label}
      </label>
    </div>
  );
}