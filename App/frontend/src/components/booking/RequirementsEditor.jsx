import React from "react";
import { Plus, Trash2, ShieldAlert, Leaf } from "lucide-react";
import {
  MAX_DESCRIPTION_LENGTH,
  validateRequirements,
} from "../../utils/bookingFormat";

//A requirement row while it is being edited: peopleCount can be empty for a moment
export const emptyRequirement = () => ({
  peopleCount: 1,
  hasAllergies: false,
  description: "",
});

//Party requirements (MH-05) with the same controls on every form: people, allergy, description
export default function RequirementsEditor({ requirements, partySize, onChange }) {
  const { rowErrors, total, totalError } = validateRequirements(
    requirements,
    partySize,
  );

  const updateRow = (index, changes) =>
    onChange(
      requirements.map((row, i) => (i === index ? { ...row, ...changes } : row)),
    );

  const removeRow = (index) =>
    onChange(requirements.filter((_, i) => i !== index));

  return (
    <section aria-labelledby="requirements-title">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <h3 id="requirements-title" className="text-base font-bold text-slate-900">
            Party requirements
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Optional · add one entry for each requirement.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onChange([...requirements, emptyRequirement()])}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 hover:text-emerald-900 transition-colors"
        >
          <Plus className="w-4 h-4" /> Add requirement
        </button>
      </div>

      {requirements.length === 0 ? (
        <p className="text-sm text-slate-500 bg-slate-50 border border-dashed border-slate-200 rounded-xl p-4">
          No requirements. Add one if someone in the party has allergies or a
          special diet.
        </p>
      ) : (
        <ul className="space-y-3">
          {requirements.map((row, index) => (
            <li
              key={index}
              className={`rounded-xl border p-3 ${
                row.hasAllergies
                  ? "border-red-200 bg-red-50/60"
                  : "border-slate-200 bg-white"
              }`}
            >
              <div className="grid grid-cols-1 sm:grid-cols-[7rem_1fr_auto] gap-3 items-start">
                <label className="block">
                  <span className="block text-xs font-medium text-slate-600 mb-1">
                    People
                  </span>
                  <input
                    type="number"
                    min={1}
                    inputMode="numeric"
                    aria-label={`People for requirement ${index + 1}`}
                    value={row.peopleCount}
                    onChange={(e) =>
                      updateRow(index, { peopleCount: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </label>

                <label className="block">
                  <span className="block text-xs font-medium text-slate-600 mb-1">
                    Description
                  </span>
                  <input
                    type="text"
                    maxLength={MAX_DESCRIPTION_LENGTH + 1}
                    aria-label={`Description for requirement ${index + 1}`}
                    placeholder="e.g. lactose-free"
                    value={row.description}
                    onChange={(e) =>
                      updateRow(index, { description: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </label>

                <button
                  type="button"
                  onClick={() => removeRow(index)}
                  aria-label={`Remove requirement ${index + 1}`}
                  className="sm:mt-6 p-2 text-slate-400 hover:text-red-600 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="mt-2 flex items-center justify-between gap-3">
                <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={row.hasAllergies}
                    onChange={(e) =>
                      updateRow(index, { hasAllergies: e.target.checked })
                    }
                    className="w-4 h-4 accent-red-700"
                  />
                  Allergy or intolerance
                </label>
                {/* The type is also in words, so it does not rely on the colour only */}
                <span
                  className={`inline-flex items-center gap-1 text-xs font-semibold ${
                    row.hasAllergies ? "text-red-700" : "text-emerald-700"
                  }`}
                >
                  {row.hasAllergies ? (
                    <ShieldAlert className="w-3.5 h-3.5" />
                  ) : (
                    <Leaf className="w-3.5 h-3.5" />
                  )}
                  {row.hasAllergies ? "Allergy" : "Diet"}
                </span>
              </div>

              {rowErrors[index] && (
                <p role="alert" className="mt-2 text-xs text-red-700">
                  {rowErrors[index]}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      <p
        className={`mt-3 text-xs ${totalError ? "text-red-700 font-medium" : "text-slate-500"}`}
        role={totalError ? "alert" : undefined}
      >
        {totalError ?? `${total} of ${partySize} people associated · maximum ${partySize}`}
      </p>
    </section>
  );
}
