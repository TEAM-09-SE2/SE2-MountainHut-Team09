import { Info, X } from "lucide-react";

export default function Toast({ message, visible, onClose }) {
  if (!visible) return null;
  return (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-4 duration-300">
      <div className="bg-slate-900 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 border border-slate-700">
        <Info className="w-5 h-5 text-emerald-400" />
        <span className="font-medium text-sm">{message}</span>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white transition-colors ml-2"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
