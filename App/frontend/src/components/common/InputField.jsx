import React from "react";

export default function InputField({
  id,
  label,
  type = "text",
  value,
  onChange,
  onBlur,
  required = false,
  placeholder = "",
  icon: Icon,
  error,
  autoComplete,
  name,
  disabled = false,
  helperText,
  // Any other <input> attribute (min, max, step, ...) is passed straight through
  ...inputProps
}) {
  return (
    <div className="mb-4 text-left">
      <label
        htmlFor={id}
        className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5"
      >
        {label}
      </label>
      <div className="relative flex items-center">
        {Icon && (
          <div className="absolute left-3 text-slate-400 pointer-events-none flex items-center">
            <Icon className="w-5 h-5" />
          </div>
        )}
        <input
          id={id}
          name={name ?? id}
          type={type}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          required={required}
          placeholder={placeholder}
          autoComplete={autoComplete}
          disabled={disabled}
          {...inputProps}
          className={`w-full ${Icon ? "pl-10" : "pl-3"} pr-3 py-2.5 bg-white border ${
            error
              ? "border-red-400 focus:ring-red-400"
              : "border-slate-200 focus:border-emerald-600 focus:ring-emerald-600"
          } rounded-xl text-slate-900 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-opacity-20 transition-all disabled:bg-slate-50 disabled:cursor-not-allowed`}
        />
      </div>
      {helperText && <p className="mt-1 text-xs text-slate-500">{helperText}</p>}
      {typeof error === "string" && error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}