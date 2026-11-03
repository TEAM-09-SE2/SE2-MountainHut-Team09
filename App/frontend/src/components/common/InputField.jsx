import React from "react";

export default function InputField({ id, label, type = "text", value, onChange, required = false, placeholder = "" }) {
  return (
    <div style={{ marginBottom: "1rem" }}>
      <label htmlFor={id} style={{ display: "block", marginBottom: "0.25rem", fontWeight: "500" }}>
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={onChange}
        required={required}
        placeholder={placeholder}
        style={{ width: "100%", padding: "0.5rem", borderRadius: "4px", border: "1px solid #ccc" }}
      />
    </div>
  );
}