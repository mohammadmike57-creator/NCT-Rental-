import React, { useState } from 'react';
import { Reservation } from '../types';
import { sendCustomerEmail, recordActivity } from '../firebase/api';
import { emailAgreementDocuments } from '../services/agreementEmail';
import { agreementHtmlFor, terminationHtmlFor, PrintContext } from '../services/printDocs';
import { receiptEmailPayload } from '../services/receiptEmail';
import { terminationNumber } from '../services/terminationDoc';
import { Button, inputCls, labelCls } from './ui/Crm';

type DocKey = 'closure' | 'agreement' | 'receipt';
type Result = { key: DocKey; ok: boolean; message: string };

interface Props {
  reservation: Reservation;
  ctx: PrintContext;
  onClose: () => void;
  /** Called with the booking after sending (new address saved, sent emails recorded). */
  onSaved: (r: Reservation) => void;
}

const EMAIL = /^\S+@\S+\.\S+$/;

/**
 * Emails a booking's documents to the customer, or to any address staff type in
 * (a corrected address, the company that pays, a second driver…). The address can be saved on the booking.
 */
const SendDocumentsDialog: React.FC<Props> = ({ reservation: r, ctx, onClose, onSaved }) => {
  const closed = !!r.dropOffCompleted;
  const original = (r.customerEmail || '').trim();
  const [to, setTo] = useState(original);
  const [save, setSave] = useState(!original);
  const [docs, setDocs] = useState<Record<DocKey, boolean>>({ closure: closed, agreement: !closed, receipt: true });
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);

  const address = to.trim();
  const valid = EMAIL.test(address);
  const changed = address.toLowerCase() !== original.toLowerCase();
  const chosen = (Object.keys(docs) as DocKey[]).filter(k => docs[k] && (k !== 'closure' || closed) && (k !== 'agreement' || !closed));
  const rc = r.returnCharges && r.returnCharges.items.length > 0 ? r.returnCharges : undefined;

  const options: { key: DocKey; title: string; detail: string; show: boolean }[] = [
    { key: 'closure', show: closed, title: `Rental termination ${terminationNumber(r.bookingId)}`,
      detail: `With the final signed agreement${rc ? ` and the ${rc.settlement === 'paid' ? 'paid invoice' : 'claim'} ${rc.documentNumber || ''}` : ''}, as PDF attachments` },
    { key: 'agreement', show: !closed, title: 'Rental agreement', detail: 'The agreement signed at pick-up, as a PDF attachment' },
    { key: 'receipt', show: true, title: `Payment receipt RCPT-${r.bookingId}`, detail: 'Amount paid and any balance due' },
  ];

  const send = async () => {
    if (!valid || !chosen.length) return;
    setBusy(true);
    const target: Reservation = { ...r, customerEmail: address };
    const out: Result[] = [];
    const sentAt = new Date().toISOString();
    const emails = [...(r.agreementEmails || [])];
    for (const key of chosen) {
      try {
        if (key === 'receipt') {
          const o = await sendCustomerEmail(receiptEmailPayload(target, ctx.company, ctx.sources, address));
          out.push({ key, ok: o.ok, message: o.ok ? 'Sent' : o.reason === 'unconfigured' ? 'Email is not set up (Email Settings)' : o.message || 'Not sent' });
        } else {
          const kind = key === 'closure' ? 'checkin' : 'checkout';
          const o = await emailAgreementDocuments({
            reservation: target, kind, company: ctx.company,
            agreementHtml: agreementHtmlFor(target, ctx), terminationHtml: key === 'closure' ? terminationHtmlFor(target, ctx) : undefined,
          });
          out.push({ key, ok: o.ok, message: o.ok ? 'Sent' : o.reason === 'unconfigured' ? 'Email is not set up (Email Settings)' : o.message || 'Not sent' });
          if (o.ok) emails.push({ to: address, kind, sentAt });
        }
      } catch {
        out.push({ key, ok: false, message: 'Not sent' });
      }
    }
    setResults(out);
    setBusy(false);
    const anyOk = out.some(x => x.ok);
    if (anyOk) {
      recordActivity('DOCUMENTS_EMAILED', 'email', `Emailed ${out.filter(x => x.ok).map(x => options.find(o => o.key === x.key)!.title).join(', ')} to ${address}`, r.bookingId,
        changed ? `Sent to ${address} instead of ${original || 'no address on file'}${save ? '; address saved on the booking' : ''}` : undefined);
    }
    if (anyOk || (save && changed)) {
      onSaved({ ...r, ...(save && changed ? { customerEmail: address } : {}), agreementEmails: emails });
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-slate-900/40 p-0 sm:p-4" onClick={busy ? undefined : onClose}>
      <div className="w-full sm:max-w-lg bg-white sm:rounded-xl shadow-2xl overflow-hidden" role="dialog" aria-modal="true" aria-labelledby="send-docs-title" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 id="send-docs-title" className="text-[15px] font-semibold text-slate-900">Email documents to the customer</h2>
          <p className="text-xs text-slate-500 mt-0.5">#{r.bookingId} · {r.personName}</p>
        </div>

        {results ? (
          <div className="px-5 py-4 space-y-2">
            {results.map(x => (
              <div key={x.key} className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${x.ok ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50'}`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold ${x.ok ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'}`}>{x.ok ? '✓' : '!'}</span>
                <span className="flex-1 text-[13px] text-slate-800">{options.find(o => o.key === x.key)!.title}</span>
                <span className={`text-xs ${x.ok ? 'text-emerald-700' : 'text-rose-700'}`}>{x.message}</span>
              </div>
            ))}
            <p className="text-xs text-slate-500 pt-1">Sent to <span className="font-medium text-slate-700">{address}</span>{save && changed ? '. The address is now saved on the booking.' : '.'}</p>
          </div>
        ) : (
          <div className="px-5 py-4 space-y-4">
            <label className="block">
              <span className={labelCls}>Send to</span>
              <input type="email" value={to} onChange={e => setTo(e.target.value)} autoFocus placeholder="name@example.com" inputMode="email"
                className={`${inputCls} ${to && !valid ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/20' : ''}`} />
              <span className="block text-xs mt-1 text-slate-500">
                {to && !valid ? <span className="text-rose-600">Enter a valid email address.</span>
                  : original ? (changed ? <>Address on the booking: {original}</> : 'The address on the booking. Change it to send elsewhere.')
                  : 'This booking has no email address yet.'}
              </span>
            </label>
            {changed && valid && (
              <label className="flex items-start gap-2 text-[13px] text-slate-700 cursor-pointer">
                <input type="checkbox" className="mt-0.5" checked={save} onChange={e => setSave(e.target.checked)} />
                <span>{original ? 'Replace the address on the booking with this one' : 'Save this address on the booking'}
                  <span className="block text-xs text-slate-400">Leave unticked to send this time only.</span></span>
              </label>
            )}
            <div>
              <span className={labelCls}>Documents</span>
              <div className="rounded-lg border border-slate-200 divide-y divide-slate-100">
                {options.filter(o => o.show).map(o => (
                  <label key={o.key} className="flex items-start gap-3 px-3 py-2.5 cursor-pointer hover:bg-slate-50">
                    <input type="checkbox" className="mt-0.5" checked={docs[o.key]} onChange={e => setDocs(d => ({ ...d, [o.key]: e.target.checked }))} />
                    <span className="min-w-0"><span className="block text-[13px] font-medium text-slate-900">{o.title}</span>
                      <span className="block text-xs text-slate-500">{o.detail}</span></span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
          {results ? <Button variant="primary" onClick={onClose}>Done</Button> : (
            <>
              <Button onClick={onClose} disabled={busy}>Cancel</Button>
              <Button variant="primary" onClick={send} disabled={busy || !valid || !chosen.length}>
                {busy ? 'Sending…' : `Send ${chosen.length === 1 ? '1 email' : `${chosen.length} emails`}`}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default SendDocumentsDialog;
