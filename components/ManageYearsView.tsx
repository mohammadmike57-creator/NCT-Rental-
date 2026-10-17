import React, { useState } from 'react';
import { PlusIcon, TrashIcon, CalendarIcon } from './icons';
import { Page, PageHeader, StatGrid, Panel, Badge, Button, Field, inputCls, EmptyState } from './ui/Crm';

interface ManageYearsViewProps {
  years: number[];
  onAddYear: (year: number) => void;
  onRemoveYear: (year: number) => void;
}

/** Settings row: short description column on the left (lg), content on the right. */
const SettingsSection: React.FC<{ title: string; description: React.ReactNode; children: React.ReactNode }> = ({ title, description, children }) => (
  <div className="lg:grid lg:grid-cols-3 lg:gap-6">
    <div className="mb-3 lg:mb-0 lg:pt-1">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <p className="mt-0.5 text-[13px] text-slate-500">{description}</p>
    </div>
    <div className="lg:col-span-2 min-w-0">{children}</div>
  </div>
);

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
    <Page>
      <PageHeader
        section="Administration"
        title="Reservation Years"
        subtitle="Years available for storing and browsing reservations."
      />

      <StatGrid items={[
        { label: 'Configured', value: years.length },
        { label: 'Earliest', value: sorted.length ? sorted[0] : '—', tone: 'muted' },
        { label: 'Latest', value: sorted.length ? sorted[sorted.length - 1] : '—', tone: 'muted' },
      ]} />

      <SettingsSection title="Add a year" description="Make a new year available for reservations, reports and filters.">
        <Panel
          footer={
            <div className="flex items-center justify-between gap-2">
              <span>Enter a year between 2001 and 2099.</span>
              <Button variant="primary" size="sm" onClick={handleAddClick} aria-label="Add year" icon={<PlusIcon className="w-4 h-4" />}>
                Add year
              </Button>
            </div>
          }
        >
          <div className="p-4">
            <Field label="Year" className="sm:max-w-xs">
              <input
                type="number"
                inputMode="numeric"
                value={newYear}
                onChange={(e) => setNewYear(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddClick(); }}
                placeholder={`e.g. ${currentYear + 1}`}
                aria-label="New year"
                className={`${inputCls} tabular-nums`}
              />
            </Field>
          </div>
        </Panel>
      </SettingsSection>

      <SettingsSection title="Configured years" description="Removing a year hides it from the year selector.">
        <Panel title="Years" subtitle={`${years.length} configured`}>
          {sorted.length === 0 ? (
            <EmptyState icon={<CalendarIcon />} title="No years configured" hint="Add a year above to start storing reservations in it." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {sorted.map((year) => (
                <li key={year} className="px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-slate-50">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-[13px] font-semibold text-slate-900 tabular-nums">{year}</span>
                    {year === currentYear && <Badge tone="info">Current</Badge>}
                  </div>
                  <button
                    onClick={() => onRemoveYear(year)}
                    className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                    aria-label={`Delete ${year}`}
                    title={`Remove ${year}`}
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </SettingsSection>
    </Page>
  );
};

export default ManageYearsView;
