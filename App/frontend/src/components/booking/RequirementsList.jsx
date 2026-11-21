import React from "react";
import { ShieldAlert, Leaf } from "lucide-react";

//Allergies come first and are marked with an icon and the word, not only with the colour
//`muted` greys the list out, for a cancelled booking (MH-08)
export default function RequirementsList({ requirements, muted = false }) {
  if (!requirements || requirements.length === 0) {
    return (
      <p className={`text-sm ${muted ? "text-slate-600" : "text-slate-500"}`}>
        No requirements
      </p>
    );
  }

  const sorted = [...requirements].sort(
    (a, b) => Number(b.hasAllergies) - Number(a.hasAllergies),
  );

  const textTone = (req) => {
    if (muted) return req.hasAllergies ? "text-slate-700 font-medium" : "text-slate-600";
    return req.hasAllergies ? "text-red-700 font-medium" : "text-slate-700";
  };

  return (
    <ul className="space-y-1">
      {sorted.map((req, index) => (
        <li
          key={req.id ?? index}
          className={`flex items-center gap-1.5 text-sm ${textTone(req)}`}
        >
          {req.hasAllergies ? (
            <ShieldAlert className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
          ) : (
            <Leaf
              className={`w-3.5 h-3.5 flex-shrink-0 ${
                muted ? "text-slate-400" : "text-emerald-700"
              }`}
              aria-hidden="true"
            />
          )}
          <span>
            {req.peopleCount} × {req.description}
            {req.hasAllergies && " (allergy)"}
          </span>
        </li>
      ))}
    </ul>
  );
}
