import React from 'react';
import { PlanId } from '../../services/platformApi';
import { cx, Icon, PLAN_STYLE } from './ui';

/** What each package includes, in the words a supplier uses. */
export const PLAN_FEATURES: Record<PlanId, { title: string; lead: string; crm: string[]; xml: string[] }> = {
  FULL: {
    title: 'Full system', lead: 'Run the rental business and sell through brokers from one place.',
    crm: ['Reservations and agreements', 'Fleet, availability and branches', 'Customers, documents and payments', 'Finance, accounting and reports', 'Traffic tickets and damages'],
    xml: ['Broker channels (OTA, SOAP, REST, JSON)', 'Rates, price rules and stop sales', 'Broker bookings, API keys and webhooks'],
  },
  CRM: {
    title: 'CRM only', lead: 'Everything for the counter and the back office, without broker connections.',
    crm: ['Reservations and agreements', 'Fleet, availability and branches', 'Customers, documents and payments', 'Finance, accounting and reports', 'Traffic tickets and damages'],
    xml: [],
  },
  XML: {
    title: 'OTA XML only', lead: 'Distribution to brokers, with the fleet and branches it needs.',
    crm: ['Fleet and branches'],
    xml: ['Broker channels (OTA, SOAP, REST, JSON)', 'Rates, price rules and stop sales', 'Availability and inventory', 'Broker bookings, API keys and webhooks'],
  },
};

export const PlanCards: React.FC<{ value: PlanId; onChange: (p: PlanId) => void; current?: PlanId; disabled?: boolean }> = ({ value, onChange, current, disabled }) => (
  <div role="radiogroup" aria-label="Package" className="grid grid-cols-1 lg:grid-cols-3 gap-3">
    {(['FULL', 'CRM', 'XML'] as PlanId[]).map(id => {
      const f = PLAN_FEATURES[id];
      const on = value === id;
      return (
        <button key={id} type="button" role="radio" aria-checked={on} disabled={disabled} onClick={() => onChange(id)} data-testid={`plan-${id}`}
          className={cx('relative text-left rounded-2xl border p-5 transition-all flex flex-col justify-start items-stretch h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600/40 disabled:cursor-not-allowed',
            on ? 'border-teal-600 bg-teal-50/40 ring-1 ring-teal-600 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm')}>
          <div className="flex items-center gap-2.5">
            <span className={cx('w-8 h-8 rounded-lg inline-flex items-center justify-center text-white', PLAN_STYLE[id].tile)}>
              {id === 'FULL' ? Icon.layers('w-4 h-4') : id === 'CRM' ? Icon.car('w-4 h-4') : Icon.globe('w-4 h-4')}
            </span>
            <span className="text-[15px] font-semibold text-slate-900">{f.title}</span>
            <span className={cx('ml-auto w-5 h-5 rounded-full border-2 inline-flex items-center justify-center', on ? 'border-teal-600 bg-teal-600 text-white' : 'border-slate-300')}>
              {on && Icon.check('w-3 h-3')}
            </span>
          </div>
          {current === id && <span className="absolute -top-2.5 left-5 px-2 h-5 inline-flex items-center rounded-full bg-slate-900 text-white text-[10.5px] font-semibold">Current package</span>}
          <p className="mt-3 text-[12.5px] leading-relaxed text-slate-600 min-h-[38px]">{f.lead}</p>
          <div className="mt-4 space-y-3">
            <Group label="CRM" items={f.crm} empty="Not included" />
            <Group label="OTA XML" items={f.xml} empty="Not included" />
          </div>
        </button>
      );
    })}
  </div>
);

const Group: React.FC<{ label: string; items: string[]; empty: string }> = ({ label, items, empty }) => (
  <div>
    <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate-400 mb-1.5">{label}</p>
    {items.length === 0
      ? <p className="flex items-center gap-2 text-[12.5px] text-slate-400">{Icon.x('w-3.5 h-3.5')}{empty}</p>
      : <ul className="space-y-1">{items.map(i => <li key={i} className="flex items-start gap-2 text-[12.5px] text-slate-700">{Icon.check('w-3.5 h-3.5 mt-0.5 text-teal-600 shrink-0')}{i}</li>)}</ul>}
  </div>
);
