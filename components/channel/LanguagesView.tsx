import React, { useMemo, useState } from 'react';
import { Aggregator, ChannelBookingLocation, ChannelGroupDetail, Fleet } from '../../types';
import { Panel, Badge, Button, EmptyState, inputCls, textareaCls, table } from '../ui/Crm';

/**
 * Arabic texts for brokers that ask in Arabic (OTA PrimaryLangID="ar", REST Accept-Language: ar):
 * branch names and addresses, car group descriptions, extras and terms. Anything left empty is sent
 * in English, and brokers that do not ask for Arabic always get English.
 */
const fieldCls = inputCls.replace('w-full ', '');
const arCls = `${inputCls} text-right`;

const LanguagesView: React.FC<{ aggregator: Aggregator; fleet: Fleet; onUpdate: (a: Aggregator) => void; showConfirmation?: (m: string) => void }> =
  ({ aggregator, fleet, onUpdate, showConfirmation }) => {
    const rules = aggregator.bookingRules || {};
    const [locs, setLocs] = useState<ChannelBookingLocation[]>(rules.locations || []);
    const [details, setDetails] = useState<Record<string, ChannelGroupDetail>>(rules.groupDetails || {});
    const [extras, setExtras] = useState(aggregator.extras || []);
    const [termsAr, setTermsAr] = useState(aggregator.termsAndConditionsAr || '');
    const groups = useMemo(() => Array.from(new Set(fleet.map(v => (v.sippCode || '').toUpperCase()).filter(Boolean))).sort(), [fleet]);

    const dirty = JSON.stringify([locs, details, extras, termsAr]) !== JSON.stringify([rules.locations || [], rules.groupDetails || {}, aggregator.extras || [], aggregator.termsAndConditionsAr || '']);
    const filled = [
      ...locs.map(l => !!l.nameAr), ...groups.map(g => !!details[g]?.descriptionAr), ...extras.map(e => !!e.nameAr), !!termsAr.trim(),
    ];
    const done = filled.filter(Boolean).length;

    const save = () => {
      const clean = (s?: string) => (s && s.trim() ? s.trim() : undefined);
      onUpdate({
        ...aggregator,
        bookingRules: {
          ...rules,
          locations: locs.map(l => ({ ...l, nameAr: clean(l.nameAr), addressAr: clean(l.addressAr) })),
          groupDetails: Object.fromEntries(Object.entries(details).map(([g, d]) => [g, { ...d, description: clean(d.description), descriptionAr: clean(d.descriptionAr) }])),
        },
        extras: extras.map(e => ({ ...e, nameAr: clean(e.nameAr) })),
        termsAndConditionsAr: clean(termsAr),
      });
      showConfirmation?.(`Arabic texts saved for ${aggregator.name}.`);
    };
    const setLoc = (i: number, p: Partial<ChannelBookingLocation>) => setLocs(x => x.map((l, j) => (j === i ? { ...l, ...p } : l)));
    const setDetail = (g: string, p: Partial<ChannelGroupDetail>) => setDetails(x => ({ ...x, [g]: { ...(x[g] || {}), ...p } }));

    return (
      <div className="space-y-4">
        <Panel title="Languages" subtitle="English is always sent. Arabic is sent only to brokers that ask for it (OTA PrimaryLangID=&quot;ar&quot;, REST Accept-Language: ar); empty Arabic fields fall back to English."
          actions={<Button variant="primary" size="sm" onClick={save} disabled={!dirty}>Save</Button>}>
          <div className="px-4 py-3 flex flex-wrap items-center gap-2 text-[13px]">
            <Badge tone="success">English: complete</Badge>
            <Badge tone={done === filled.length && filled.length ? 'success' : done ? 'warning' : 'muted'}>Arabic: {done} of {filled.length} texts</Badge>
            {dirty && <Badge tone="warning">Unsaved changes</Badge>}
          </div>
        </Panel>

        <Panel title="Branches" subtitle="The names and addresses brokers show for pick-up and return.">
          {locs.length === 0 ? <EmptyState title="No branches yet" hint="Add branches in Booking API first." /> : (
            <div className="overflow-x-auto">
              <table className={`${table.wrap} min-w-[760px]`}>
                <thead className={table.head}><tr>{['Code', 'English', 'Arabic name', 'Arabic address'].map(h => <th key={h} className={table.th}>{h}</th>)}</tr></thead>
                <tbody className={table.body}>
                  {locs.map((l, i) => (
                    <tr key={i} className={table.row}>
                      <td className={`${table.td} font-mono text-xs font-semibold`}>{l.code}</td>
                      <td className={`${table.td} text-xs text-slate-600`}>{l.name}</td>
                      <td className={table.td}><input dir="rtl" lang="ar" value={l.nameAr || ''} onChange={e => setLoc(i, { nameAr: e.target.value })} placeholder="اكتب بالعربية" aria-label={`${l.code} Arabic name`} className={arCls} /></td>
                      <td className={table.td}><input dir="rtl" lang="ar" value={l.addressAr || ''} onChange={e => setLoc(i, { addressAr: e.target.value })} placeholder="اكتب بالعربية" aria-label={`${l.code} Arabic address`} className={arCls} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Car groups" subtitle="A short description brokers show under the car, for example &quot;Compact sedan, ideal for city driving&quot;.">
          {groups.length === 0 ? <EmptyState title="No car groups" hint="Give your cars SIPP codes in Fleet Management first." /> : (
            <div className="overflow-x-auto">
              <table className={`${table.wrap} min-w-[760px]`}>
                <thead className={table.head}><tr>{['Group', 'English description', 'Arabic description'].map(h => <th key={h} className={table.th}>{h}</th>)}</tr></thead>
                <tbody className={table.body}>
                  {groups.map(g => (
                    <tr key={g} className={table.row}>
                      <td className={`${table.td} font-mono text-xs font-semibold`}>{g}</td>
                      <td className={table.td}><input value={details[g]?.description || ''} onChange={e => setDetail(g, { description: e.target.value })} placeholder="Compact sedan" aria-label={`${g} English description`} className={inputCls} /></td>
                      <td className={table.td}><input dir="rtl" lang="ar" value={details[g]?.descriptionAr || ''} onChange={e => setDetail(g, { descriptionAr: e.target.value })} placeholder="اكتب بالعربية" aria-label={`${g} Arabic description`} className={arCls} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <div className="grid gap-4 xl:grid-cols-2">
          <Panel title="Extras" subtitle="Names of the extras sold on this channel.">
            {extras.length === 0 ? <EmptyState title="No extras on this channel" hint="Add extras in the Extras tab." /> : (
              <ul className="divide-y divide-slate-100">
                {extras.map((x, i) => (
                  <li key={x.id} className="px-4 py-2.5 grid grid-cols-2 gap-3 items-center">
                    <span className="text-[13px] text-slate-700">{x.name}</span>
                    <input dir="rtl" lang="ar" value={x.nameAr || ''} onChange={e => setExtras(list => list.map((y, j) => (j === i ? { ...y, nameAr: e.target.value } : y)))}
                      placeholder="اكتب بالعربية" aria-label={`${x.name} Arabic name`} className={`${fieldCls} text-right w-full`} />
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Terms and conditions (Arabic)" subtitle="Sent with quotes and rate rules to brokers that ask in Arabic.">
            <div className="p-3">
              <textarea dir="rtl" lang="ar" value={termsAr} onChange={e => setTermsAr(e.target.value)} rows={8} placeholder="الشروط والأحكام…"
                aria-label="Arabic terms and conditions" className={`${textareaCls} w-full text-right leading-relaxed`} />
              <p className="mt-1 text-[11px] text-slate-400">{termsAr.trim() ? `${termsAr.length} characters` : 'Empty: brokers get the English terms.'}</p>
            </div>
          </Panel>
        </div>
      </div>
    );
  };

export default LanguagesView;
