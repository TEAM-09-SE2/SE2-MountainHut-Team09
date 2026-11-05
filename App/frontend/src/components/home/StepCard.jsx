import React from 'react';

export default function StepCard({ number, title, description, icon: Icon }) {
  return (
    <div className="col-span-4 lg:col-span-4 bg-white p-8 rounded-2xl shadow-xs border border-gray-100 text-center">
      <div className="w-14 h-14 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto mb-6">
        <Icon className="w-7 h-7" />
      </div>
      <h3 className="text-xl font-semibold text-slate-900 mb-2">{number}. {title}</h3>
      <p className="text-slate-600 text-sm leading-relaxed">{description}</p>
    </div>
  );
}