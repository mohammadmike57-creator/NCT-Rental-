import React from 'react';
import { PaymentType, RentalSource } from '../types';
import { BookingPayment, PAYMENT_LABEL, PAYMENT_LABEL_AR } from '../services/paymentType';

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(' ');

const OPTIONS: { value: BookingPayment; title: string; hint: string }[] = [
  { value: PaymentType.PREPAID, title: 'Prepaid', hint: 'Paid to the website / partner. Nothing to collect for the rental at the counter.' },
  { value: PaymentType.PAY_ON_ARRIVAL, title: 'Pay on arrival', hint: 'The customer pays the rental at the counter at pickup.' },
];

/**
 * How a booking is paid. For a source that takes both ways the choice is required;
 * for a single-type source it just states the source's type.
 */
const PaymentChoice: React.FC<{
  source?: RentalSource;
  value?: BookingPayment;
  onChange: (v: BookingPayment) => void;
  error?: string;
  disabled?: boolean;
  arabic?: boolean;
}> = ({ source, value, onChange, error, disabled, arabic }) => {
  if (!source) return null;
  if (source.paymentType !== PaymentType.BOTH) {
    const prepaid = source.paymentType === PaymentType.PREPAID;
    return (
      <p className={cx('rounded-lg border px-3 py-2 text-xs', prepaid ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800')}>
        <b className="font-semibold">{source.name}</b> bookings are <b className="font-semibold">{PAYMENT_LABEL[source.paymentType].toLowerCase()}</b>
        {prepaid ? ': nothing to collect for the rental at the counter.' : ': the customer pays the rental at the counter.'}
      </p>
    );
  }
  return (
    <div>
      <p className="text-[13px] font-medium text-slate-700 mb-1.5">
        How is this booking paid? <span className="text-rose-500">*</span>
        {arabic && <span className="ar-ui ms-2 text-slate-500 font-normal" dir="rtl">طريقة الدفع</span>}
      </p>
      <p className="text-xs text-slate-500 mb-2">{source.name} sends both prepaid and pay-on-arrival bookings. Check the booking confirmation.</p>
      <div role="radiogroup" className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {OPTIONS.map(o => {
          const on = value === o.value;
          return (
            <button key={o.value} type="button" role="radio" aria-checked={on} disabled={disabled} onClick={() => onChange(o.value)}
              className={cx('text-left rounded-lg border px-3 py-2.5 transition-colors disabled:opacity-60',
                on ? (o.value === PaymentType.PREPAID ? 'border-emerald-400 bg-emerald-50 ring-1 ring-emerald-400' : 'border-amber-400 bg-amber-50 ring-1 ring-amber-400')
                  : error ? 'border-rose-300 bg-white hover:bg-slate-50' : 'border-slate-200 bg-white hover:bg-slate-50')}>
              <span className="flex items-center gap-2">
                <span className={cx('w-3.5 h-3.5 rounded-full border-2 shrink-0', on ? (o.value === PaymentType.PREPAID ? 'border-emerald-600 bg-emerald-600' : 'border-amber-600 bg-amber-600') : 'border-slate-300')} />
                <span className="text-[13px] font-semibold text-slate-900">{o.title}</span>
                {arabic && <span className="ar-ui ms-auto text-xs text-slate-500" dir="rtl">{PAYMENT_LABEL_AR[o.value]}</span>}
              </span>
              <span className="block mt-1 pl-[1.375rem] text-xs text-slate-500">{o.hint}</span>
            </button>
          );
        })}
      </div>
      {error && <span className="block mt-1 text-xs font-medium text-rose-600">{error}</span>}
    </div>
  );
};

export default PaymentChoice;
