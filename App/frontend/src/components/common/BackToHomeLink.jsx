import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

//Same "Back to home" link on every page that leaves the home (login, booking wizard, ...)
export default function BackToHomeLink({ className = '' }) {
  return (
    <Link
      to="/"
      className={`inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-emerald-700 transition-colors ${className}`}
    >
      <ArrowLeft className="w-4 h-4" />
      <span>Back to home</span>
    </Link>
  );
}
