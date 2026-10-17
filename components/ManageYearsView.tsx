
import React, { useState } from 'react';
import { PlusIcon, TrashIcon, CalendarIcon } from './icons';

interface ManageYearsViewProps {
  years: number[];
  onAddYear: (year: number) => void;
  onRemoveYear: (year: number) => void;
}

const ManageYearsView: React.FC<ManageYearsViewProps> = ({ years, onAddYear, onRemoveYear }) => {
  const [newYear, setNewYear] = useState<string>('');

  const handleAddClick = () => {
    const yearNum = parseInt(newYear, 10);
    if (yearNum && yearNum > 2000 && yearNum < 2100) {
      onAddYear(yearNum);
      setNewYear('');
    } else {
      alert('Please enter a valid year (e.g., 2027).');
    }
  };

  const currentYear = new Date().getFullYear();
  const sorted = [...years].sort((a, b) => a - b);

  return (
    <div className="space-y-5 mb-10 max-w-3xl">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6 flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
          <CalendarIcon className="w-6 h-6" />
        </div>
        <div className="min-w-0">
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Reservation years</h2>
          <p className="text-sm text-slate-500">Years available for storing and browsing reservations.</p>
        </div>
      </div>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-3">Add a year</h3>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="number"
            inputMode="numeric"
            value={newYear}
            onChange={(e) => setNewYear(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAddClick(); }}
            placeholder={`e.g. ${currentYear + 1}`}
            aria-label="New year"
            className="w-full sm:flex-1 px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
          />
          <button
            onClick={handleAddClick}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700"
            aria-label="Add year"
          >
            <PlusIcon className="w-4 h-4" />
            Add year
          </button>
        </div>
        <p className="text-xs text-slate-400 mt-2">Enter a year between 2001 and 2099.</p>
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Configured years</h3>
          <span className="text-xs text-slate-400">{years.length}</span>
        </div>
        {sorted.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <div className="mx-auto w-12 h-12 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center mb-3">
              <CalendarIcon className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-slate-900">No years configured</p>
            <p className="text-sm text-slate-500 mt-1">Add a year above to start storing reservations in it.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {sorted.map((year) => (
              <li key={year} className="px-5 py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-base font-semibold text-slate-900 tabular-nums">{year}</span>
                  {year === currentYear && (
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset bg-indigo-50 text-indigo-700 ring-indigo-600/20">Current</span>
                  )}
                </div>
                <button
                  onClick={() => onRemoveYear(year)}
                  className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                  aria-label={`Delete ${year}`}
                  title={`Remove ${year}`}
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

export default ManageYearsView;
