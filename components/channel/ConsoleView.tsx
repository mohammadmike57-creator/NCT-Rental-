import React, { useMemo, useRef, useState } from 'react';
import { Aggregator, Fleet } from '../../types';
import { sendChannelConsole, ChannelConsoleResult } from '../../firebase/api';
import { Button, selectCls, inputCls } from '../ui/Crm';
import CodeView, { checkMessage, detectLang, formatCode } from './CodeView';

type Format = 'OTA' | 'SOAP' | 'XML' | 'REST';
type Template = { id: string; label: string; format: Format; operation?: string; method?: string; body: string };

const NS = 'http://www.opentravel.org/OTA/2003/05';

/** Ready-to-send messages filled with this channel's own codes and a date a month from now. */
const templates = (a: Aggregator, fleet: Fleet): Template[] => {
  const code = a.channelCode || a.id;
  const loc = a.bookingRules?.locations?.[0]?.code || a.locationCode || 'AMM';
  const group = (fleet.find(v => v.sippCode)?.sippCode || 'ECMR').toUpperCase();
  const d = new Date(); d.setDate(d.getDate() + 30);
  const day = (n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
  const from = `${day(0)}T10:00:00`, to = `${day(3)}T10:00:00`;
  const core = `<VehRentalCore PickUpDateTime="${from}" ReturnDateTime="${to}">
      <PickUpLocation LocationCode="${loc}"/><ReturnLocation LocationCode="${loc}"/>
    </VehRentalCore>`;
  const avail = `<OTA_VehAvailRateRQ xmlns="${NS}" EchoToken="TEST-1" Version="2.000">
  <POS><Source ISOCurrency="${a.currency || 'USD'}"/></POS>
  <VehAvailRQCore>
    ${core}
    <DriverType Age="35"/>
  </VehAvailRQCore>
</OTA_VehAvailRateRQ>`;
  const head = `<Header><RequestID>TEST-1</RequestID><ChannelCode>${code}</ChannelCode></Header>`;
  const itin = `<Itinerary>
    <PickupLocationCode>${loc}</PickupLocationCode><PickupDateTime>${from}</PickupDateTime>
    <ReturnLocationCode>${loc}</ReturnLocationCode><ReturnDateTime>${to}</ReturnDateTime><DriverAge>35</DriverAge>
  </Itinerary>`;
  return [
    { id: 'ota-ping', label: 'OTA · Ping', format: 'OTA', body: `<OTA_PingRQ xmlns="${NS}" EchoToken="P1"><EchoData>Hello</EchoData></OTA_PingRQ>` },
    { id: 'ota-loc', label: 'OTA · Location search', format: 'OTA', body: `<OTA_VehLocSearchRQ xmlns="${NS}" EchoToken="L1"/>` },
    { id: 'ota-locd', label: 'OTA · Location detail', format: 'OTA', body: `<OTA_VehLocDetailRQ xmlns="${NS}"><Location LocationCode="${loc}"/></OTA_VehLocDetailRQ>` },
    { id: 'ota-avail', label: 'OTA · Availability & rates', format: 'OTA', body: avail },
    { id: 'ota-rule', label: 'OTA · Rate rules (offer)', format: 'OTA', body: `<OTA_VehRateRuleRQ xmlns="${NS}" EchoToken="RR1">
  <Reference Type="16" ID="{{OFFER}}"/>
</OTA_VehRateRuleRQ>` },
    { id: 'ota-res', label: 'OTA · Book (offer)', format: 'OTA', body: `<OTA_VehResRQ xmlns="${NS}" EchoToken="R1">
  <VehResRQCore>
    <Customer><Primary BirthDate="1990-05-01">
      <PersonName><GivenName>John</GivenName><Surname>Doe</Surname></PersonName>
      <Telephone PhoneNumber="+962790000000"/><Email>john.doe@example.com</Email>
      <Document DocID="JO123456" DocType="4" DocIssueCountry="JO"/>
    </Primary></Customer>
  </VehResRQCore>
  <VehResRQInfo>
    <Reference Type="16" ID="{{OFFER}}"/>
    <TPA_Extensions><BrokerReference>TEST-${Date.now().toString().slice(-6)}</BrokerReference></TPA_Extensions>
  </VehResRQInfo>
</OTA_VehResRQ>` },
    { id: 'ota-ret', label: 'OTA · Retrieve', format: 'OTA', body: `<OTA_VehRetResRQ xmlns="${NS}"><VehRetResRQCore><UniqueID Type="14" ID="{{RESERVATION}}"/></VehRetResRQCore></OTA_VehRetResRQ>` },
    { id: 'ota-mod', label: 'OTA · Modify (one more day)', format: 'OTA', body: `<OTA_VehModifyRQ xmlns="${NS}"><VehModifyRQCore ModifyType="Modify">
  <UniqueID Type="14" ID="{{RESERVATION}}"/>
  <VehRentalCore PickUpDateTime="${from}" ReturnDateTime="${day(4)}T10:00:00"/>
</VehModifyRQCore></OTA_VehModifyRQ>` },
    { id: 'ota-can', label: 'OTA · Cancel', format: 'OTA', body: `<OTA_VehCancelRQ xmlns="${NS}"><VehCancelRQCore CancelType="Cancel"><UniqueID Type="14" ID="{{RESERVATION}}"/></VehCancelRQCore></OTA_VehCancelRQ>` },
    { id: 'soap-avail', label: 'SOAP 1.1 · Availability', format: 'SOAP', body: `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
    xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
  <soapenv:Header><wsse:Security><wsse:UsernameToken>
    <wsse:Username>${code}</wsse:Username><wsse:Password>(not needed in the console)</wsse:Password>
  </wsse:UsernameToken></wsse:Security></soapenv:Header>
  <soapenv:Body>
    ${avail.split('\n').join('\n    ')}
  </soapenv:Body>
</soapenv:Envelope>` },
    { id: 'xml-ping', label: 'Native XML · Ping', format: 'XML', operation: 'Ping', body: `<PingRequest>${head}<EchoData>Hello</EchoData></PingRequest>` },
    { id: 'xml-avail', label: 'Native XML · Availability', format: 'XML', operation: 'Availability', body: `<AvailabilityRequest>
  ${head}
  ${itin}
</AvailabilityRequest>` },
    { id: 'xml-rules', label: 'Native XML · Rate rules', format: 'XML', operation: 'RateRules', body: `<RateRulesRequest>
  ${head}
  <OfferID>{{OFFER}}</OfferID>
</RateRulesRequest>` },
    { id: 'xml-create', label: 'Native XML · Book', format: 'XML', operation: 'ReservationCreate', body: `<ReservationCreateRequest>
  ${head}
  <OfferID>{{OFFER}}</OfferID><BrokerReference>TEST-X${Date.now().toString().slice(-6)}</BrokerReference>
  <Customer><FirstName>Jane</FirstName><LastName>Smith</LastName><Email>jane@example.com</Email></Customer>
</ReservationCreateRequest>` },
    { id: 'xml-list', label: 'Native XML · Reservation list', format: 'XML', operation: 'ReservationList', body: `<ReservationListRequest>
  ${head}
  <From>${day(0)}</From><To>${day(30)}</To>
</ReservationListRequest>` },
    { id: 'rest-loc', label: 'REST · GET /locations', format: 'REST', method: 'GET', operation: '/locations', body: '' },
    { id: 'rest-avail', label: 'REST · POST /availability', format: 'REST', method: 'POST', operation: '/availability', body: JSON.stringify({
      itinerary: { pickup_location: loc, return_location: loc, pickup_at: from, return_at: to, driver_age: 35, vehicle_group: group } }, null, 2) },
    { id: 'rest-rules', label: 'REST · POST /rate-rules', format: 'REST', method: 'POST', operation: '/rate-rules', body: JSON.stringify({ offer_id: '{{OFFER}}' }, null, 2) },
    { id: 'rest-list', label: 'REST · GET /reservations', format: 'REST', method: 'GET', operation: `/reservations?from=${day(0)}&to=${day(30)}`, body: '' },
    { id: 'rest-inv', label: 'REST · GET /inventory', format: 'REST', method: 'GET', operation: '/inventory?days=14', body: '' },
  ];
};

type Run = { id: string; label: string; format: Format; method?: string; operation?: string; request: string; status: number; ms: number; requestId: string; body: string; at: string };
const PROTOCOL_TONE: Record<Format, string> = {
  OTA: 'bg-sky-50 text-sky-700 ring-sky-200', SOAP: 'bg-amber-50 text-amber-800 ring-amber-200', XML: 'bg-emerald-50 text-emerald-700 ring-emerald-200', REST: 'bg-violet-50 text-violet-700 ring-violet-200',
};
const PROTOCOL_NAME: Record<Format, string> = { OTA: 'OpenTravel 2003/05', SOAP: 'SOAP 1.1', XML: 'Native XML', REST: 'REST / JSON v3' };
const FLOW = ['ota-avail', 'ota-rule', 'ota-res', 'ota-ret', 'ota-can'];
const statusTone = (st: number) => (st < 300 ? 'text-emerald-600' : st < 500 ? 'text-amber-600' : 'text-rose-600');
const extract = (body: string) => ({ offer: /OFF-[A-Z0-9]{16}/.exec(body || '')?.[0], reservation: /RSV-\d{4}-\d{6}/.exec(body || '')?.[0] });
const failed = (r: { status: number; body: string }) => r.status >= 300 || (checkMessage(r.body)?.errors.length || 0) > 0;

/** Sends real broker messages to this channel in the sandbox: nothing is booked for real and no webhooks are sent. */
const ConsoleView: React.FC<{ aggregator: Aggregator; fleet: Fleet }> = ({ aggregator, fleet }) => {
  const list = useMemo(() => templates(aggregator, fleet), [aggregator, fleet]);
  const [tpl, setTpl] = useState(list[3]);
  const [body, setBody] = useState(list[3].body);
  const [operation, setOperation] = useState(list[3].operation || '');
  const [method, setMethod] = useState(list[3].method || 'POST');
  const [res, setRes] = useState<Run | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<{ offer?: string; reservation?: string }>({});
  const [history, setHistory] = useState<Run[]>([]);
  const [find, setFind] = useState('');
  const [flow, setFlow] = useState<(Run & { ok: boolean })[] | null>(null);
  const [flowBusy, setFlowBusy] = useState(false);
  const gutter = useRef<HTMLDivElement>(null);

  const choose = (id: string) => {
    const t = list.find(x => x.id === id)!;
    setTpl(t); setBody(t.body); setOperation(t.operation || ''); setMethod(t.method || 'POST');
  };
  const fill = (s: string, v = last) => s.replace(/\{\{OFFER\}\}/g, v.offer || '{{OFFER}}').replace(/\{\{RESERVATION\}\}/g, v.reservation || '{{RESERVATION}}');
  const missing = /\{\{(OFFER|RESERVATION)\}\}/.exec(fill(body + operation));
  const check = useMemo(() => (tpl.format === 'REST' && (method === 'GET' || !body.trim()) ? null : checkMessage(fill(body))), [body, tpl, method, last]); // eslint-disable-line react-hooks/exhaustive-deps
  const lines = Math.max(1, body.split('\n').length);

  const call = async (t: Template, req: { body: string; operation: string; method: string }, vars: typeof last): Promise<Run> => {
    const r = await sendChannelConsole(aggregator.id, { format: t.format, operation: fill(req.operation, vars), method: req.method, body: fill(req.body, vars) });
    return { id: `${Date.now()}-${Math.random()}`, label: t.label, format: t.format, method: req.method, operation: fill(req.operation, vars), request: fill(req.body, vars),
      status: r.status, ms: r.durationMs, requestId: r.requestId, body: r.body || '', at: new Date().toLocaleTimeString('en-GB') };
  };
  const send = async () => {
    if (busy || missing) return;
    setBusy(true); setError(null);
    try {
      const run = await call(tpl, { body, operation, method }, last);
      setRes(run);
      const got = extract(run.body);
      setLast(prev => ({ offer: got.offer || prev.offer, reservation: got.reservation || prev.reservation }));
      setHistory(h => [run, ...h].slice(0, 25));
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  /** Search → rate rules → book → retrieve → cancel, each answer feeding the next (sandbox only). */
  const runFlow = async () => {
    setFlowBusy(true); setError(null); setFlow([]);
    let vars: typeof last = {};
    const done: (Run & { ok: boolean })[] = [];
    try {
      for (const id of FLOW) {
        const t = list.find(x => x.id === id)!;
        const run = await call(t, { body: t.body, operation: t.operation || '', method: t.method || 'POST' }, vars);
        const got = extract(run.body);
        vars = { offer: got.offer || vars.offer, reservation: got.reservation || vars.reservation };
        const ok = !failed(run);
        done.push({ ...run, ok }); setFlow([...done]);
        setHistory(h => [run, ...h].slice(0, 25));
        if (!ok) break;
      }
      setLast(vars);
      if (done.length) setRes(done[done.length - 1]);
    } catch (e: any) { setError(e.message); } finally { setFlowBusy(false); }
  };
  const restore = (r: Run) => {
    const t = list.find(x => x.label === r.label);
    if (t) setTpl(t);
    setBody(r.request); setOperation(r.operation || ''); setMethod(r.method || 'POST'); setRes(r);
  };
  const groups = (['OTA', 'SOAP', 'XML', 'REST'] as Format[]).map(f => [f, list.filter(t => t.format === f && (!find.trim() || t.label.toLowerCase().includes(find.trim().toLowerCase())))] as const);
  const flowOk = flow && flow.length === FLOW.length && flow.every(s => s.ok);

  return (
    <div className="space-y-4">
      {/* Header */}
      <section className="rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-clip">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 px-5 py-4">
          <span className="grid place-items-center w-10 h-10 rounded-xl bg-slate-900 text-white font-mono text-[13px] font-bold">{'</>'}</span>
          <div className="min-w-[240px] flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-indigo-600">Sandbox · {aggregator.channelCode || aggregator.name}</p>
            <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-slate-900">API test console</h2>
            <p className="text-[12.5px] text-slate-500">Real messages through the real gateway, exactly as the broker sends them. Nothing is booked for real and no webhooks are sent; every call also appears in Traffic.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-amber-50 ring-1 ring-inset ring-amber-200 text-[12px] font-semibold text-amber-800"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" />Sandbox</span>
            <Button size="sm" onClick={() => void runFlow()} disabled={flowBusy || busy}>{flowBusy ? 'Running…' : 'Run full booking flow'}</Button>
          </div>
        </div>
        {flow && (
          <div className="border-t border-slate-100 px-5 py-3">
            <div className="flex items-center gap-2 mb-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Booking flow</p>
              {flowBusy ? <span className="text-[12px] text-slate-500">running…</span>
                : flowOk ? <span className="text-[12px] font-semibold text-emerald-700">All {FLOW.length} steps passed · {flow.reduce((t, s) => t + s.ms, 0)} ms</span>
                : flow.length ? <span className="text-[12px] font-semibold text-rose-700">Stopped at step {flow.length}</span> : null}
            </div>
            <ol className="grid gap-2 sm:grid-cols-5">
              {FLOW.map((id, i) => {
                const st = flow[i];
                const t = list.find(x => x.id === id)!;
                return (
                  <li key={id}>
                    <button type="button" disabled={!st} onClick={() => st && restore(st)}
                      className={`w-full text-left rounded-lg px-3 py-2 ring-1 ring-inset transition-colors ${!st ? 'bg-slate-50 ring-slate-200 text-slate-400' : st.ok ? 'bg-emerald-50/60 ring-emerald-200 hover:ring-emerald-300' : 'bg-rose-50/60 ring-rose-200 hover:ring-rose-300'}`}>
                      <p className="text-[10.5px] font-semibold uppercase tracking-wider opacity-70">Step {i + 1}</p>
                      <p className="text-[12.5px] font-semibold text-slate-900 truncate">{t.label.replace('OTA · ', '')}</p>
                      <p className="text-[11px] tabular-nums">{st ? <><span className={statusTone(st.status)}>HTTP {st.status}</span> · {st.ms} ms</> : flowBusy && i === flow.length ? 'running…' : 'waiting'}</p>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </section>

      <div className="grid gap-4 xl:grid-cols-[230px_minmax(0,1fr)] items-start">
        {/* Collection */}
        <aside className="rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-clip xl:sticky xl:top-24">
          <div className="p-3 border-b border-slate-100">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Messages</p>
            <input value={find} onChange={e => setFind(e.target.value)} placeholder="Filter messages" className={`${inputCls} h-8 text-[12px]`} aria-label="Filter messages" />
          </div>
          <nav className="max-h-[34rem] overflow-y-auto py-1" aria-label="Message templates">
            {groups.filter(([, ts]) => ts.length).map(([f, ts]) => (
              <div key={f} className="py-1">
                <p className="px-3 py-1 text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">{PROTOCOL_NAME[f]}</p>
                {ts.map(t => (
                  <button key={t.id} type="button" onClick={() => choose(t.id)} aria-current={t.id === tpl.id ? 'true' : undefined}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-[12.5px] transition-colors ${t.id === tpl.id ? 'bg-indigo-50 text-indigo-800 font-semibold' : 'text-slate-700 hover:bg-slate-50'}`}>
                    <span className={`shrink-0 w-11 text-center px-1 py-px rounded text-[9.5px] font-bold ring-1 ring-inset ${PROTOCOL_TONE[f]}`}>{f === 'REST' ? t.method : f === 'XML' ? 'XML' : f}</span>
                    <span className="truncate">{t.label.replace(/^[^·]+· /, '')}</span>
                  </button>
                ))}
              </div>
            ))}
          </nav>
        </aside>

        <div className="space-y-4 min-w-0">
          <div className="grid gap-4 min-[1750px]:grid-cols-2 items-start">
            {/* Request */}
            <section className="rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-clip min-w-0 flex flex-col">
              <header className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-slate-100">
                <span className={`px-1.5 py-0.5 rounded text-[10.5px] font-bold ring-1 ring-inset ${PROTOCOL_TONE[tpl.format]}`}>{PROTOCOL_NAME[tpl.format]}</span>
                <h3 className="text-[13.5px] font-semibold text-slate-900 truncate">{tpl.label.replace(/^[^·]+· /, '')}</h3>
                <span className="flex-1" />
                <Button size="sm" variant="ghost" onClick={() => setBody(formatCode(body))} disabled={!body.trim()}>Format</Button>
                <Button size="sm" variant="ghost" onClick={() => choose(tpl.id)}>Reset</Button>
                <Button size="sm" variant="primary" onClick={() => void send()} disabled={busy || !!missing} title="Ctrl + Enter">{busy ? 'Sending…' : 'Send'}<kbd className="ml-1.5 hidden sm:inline px-1 rounded bg-white/15 text-[10px] font-sans font-medium">Ctrl ↵</kbd></Button>
              </header>
              {(tpl.format === 'REST' || tpl.format === 'XML') && (
                <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-slate-100 bg-slate-50/60">
                  {tpl.format === 'REST' ? (<>
                    <select value={method} onChange={e => setMethod(e.target.value)} className={`${selectCls} h-8 w-24 font-mono text-[12px]`} aria-label="Method">{['GET', 'POST', 'PATCH'].map(m => <option key={m}>{m}</option>)}</select>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Path</span>
                    <input value={operation} onChange={e => setOperation(e.target.value)} className={`${inputCls} h-8 flex-1 min-w-[160px] font-mono text-[12px]`} aria-label="Path" />
                  </>) : (<>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Operation</span>
                    <input value={operation} onChange={e => setOperation(e.target.value)} className={`${inputCls} h-8 w-56 font-mono text-[12px]`} aria-label="Operation" />
                  </>)}
                </div>
              )}
              {(last.offer || last.reservation) && (
                <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-slate-100 text-[11.5px] text-slate-500">
                  <span className="font-semibold uppercase tracking-wider text-[10.5px]">Variables</span>
                  {last.offer && <span className="inline-flex items-center gap-1 h-6 px-2 rounded-md bg-slate-100 font-mono"><span className="text-slate-400">{'{{OFFER}}'}</span> = <span className="text-slate-800">{last.offer}</span></span>}
                  {last.reservation && <span className="inline-flex items-center gap-1 h-6 px-2 rounded-md bg-slate-100 font-mono"><span className="text-slate-400">{'{{RESERVATION}}'}</span> = <span className="text-slate-800">{last.reservation}</span></span>}
                </div>
              )}
              <div className="relative flex bg-[#0b1020] min-h-[26rem]">
                <div ref={gutter} aria-hidden className="select-none overflow-hidden py-3 pl-3 pr-3 text-right font-mono text-[11.5px] leading-[1.6] text-slate-600 tabular-nums" style={{ maxHeight: '26rem' }}>
                  {Array.from({ length: lines }, (_, i) => <div key={i}>{i + 1}</div>)}
                </div>
                <textarea value={body} onChange={e => setBody(e.target.value)} spellCheck={false} wrap="off"
                  onScroll={e => { if (gutter.current) gutter.current.scrollTop = e.currentTarget.scrollTop; }}
                  onKeyDown={e => {
                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); void send(); }
                    if (e.key === 'Tab') { e.preventDefault(); const t = e.currentTarget, a = t.selectionStart; setBody(body.slice(0, a) + '  ' + body.slice(t.selectionEnd)); requestAnimationFrame(() => { t.selectionStart = t.selectionEnd = a + 2; }); }
                  }}
                  disabled={tpl.format === 'REST' && method === 'GET'}
                  className="flex-1 h-[26rem] resize-none bg-transparent py-3 pr-4 font-mono text-[11.5px] leading-[1.6] text-slate-100 caret-sky-300 outline-none disabled:opacity-40"
                  aria-label="Message body" />
              </div>
              <footer className="flex flex-wrap items-center gap-2 px-4 py-2 border-t border-slate-100 text-[11.5px]">
                {tpl.format === 'REST' && method === 'GET' ? <span className="text-slate-500">GET request · no body</span>
                  : !check ? <span className="text-slate-400">—</span>
                  : check.ok ? <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />{detectLang(body) === 'json' ? 'Valid JSON' : `Well-formed XML · ${check.root}${check.soap ? ' in SOAP' : ''}`}</span>
                  : <span className="inline-flex items-center gap-1.5 font-semibold text-rose-700"><span className="w-1.5 h-1.5 rounded-full bg-rose-500" />{check.error}</span>}
                {missing && <span className="text-amber-700">Needs {missing[0]}: run {missing[1] === 'RESERVATION' ? 'a booking' : 'an availability search'} first.</span>}
                <span className="ml-auto text-slate-400 tabular-nums">{lines} lines</span>
              </footer>
            </section>

            {/* Response */}
            <div className="min-w-0 space-y-2">
              {error && <p className="rounded-lg bg-rose-50 ring-1 ring-inset ring-rose-200 px-3 py-2 text-[12px] text-rose-700">{error}</p>}
              <CodeView code={res?.body} summary download={res ? `${res.label.replace(/\W+/g, '-').toLowerCase()}-${res.requestId}.${detectLang(res.body) === 'json' ? 'json' : 'xml'}` : undefined}
                title={res ? 'Response' : 'Response'} height="30rem" empty="Send a message (Ctrl + Enter) to see the answer here."
                meta={res && <>
                  <span className={`inline-flex items-center h-5 px-1.5 rounded text-[10.5px] font-bold tabular-nums ${res.status < 300 ? 'bg-emerald-500/20 text-emerald-300' : res.status < 500 ? 'bg-amber-500/20 text-amber-200' : 'bg-rose-500/20 text-rose-200'}`}>HTTP {res.status}</span>
                  <span className="text-[11px] tabular-nums text-slate-400">{res.ms} ms</span>
                  <span className="text-[11px] font-mono text-slate-500 truncate max-w-[12rem]" title="Request ID (search it in Traffic)">{res.requestId}</span>
                </>} />
            </div>
          </div>

          {/* History */}
          <section className="rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-clip">
            <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-100">
              <div><h3 className="text-[13.5px] font-semibold text-slate-900">This session</h3><p className="text-[12px] text-slate-500">Click a call to load its request and answer again.</p></div>
              {history.length > 0 && <Button size="sm" variant="ghost" onClick={() => setHistory([])}>Clear</Button>}
            </header>
            {history.length === 0 ? <p className="px-4 py-6 text-center text-[12.5px] text-slate-400">No calls yet.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-[12.5px]">
                  <thead><tr className="bg-slate-50 border-b border-slate-200 text-left text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">
                    <th className="px-4 py-2">Time</th><th className="px-3 py-2">Message</th><th className="px-3 py-2">Result</th><th className="px-3 py-2 text-right">HTTP</th><th className="px-3 py-2 text-right">Time</th><th className="px-4 py-2">Request ID</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {history.map(h => {
                      const c = checkMessage(h.body);
                      return (
                        <tr key={h.id} onClick={() => restore(h)} className={`cursor-pointer hover:bg-slate-50 ${res?.id === h.id ? 'bg-indigo-50/50' : ''}`}>
                          <td className="px-4 py-2 tabular-nums text-slate-500">{h.at}</td>
                          <td className="px-3 py-2"><span className={`mr-2 px-1 py-px rounded text-[9.5px] font-bold ring-1 ring-inset ${PROTOCOL_TONE[h.format]}`}>{h.format === 'REST' ? h.method : h.format}</span>{h.label.replace(/^[^·]+· /, '')}</td>
                          <td className="px-3 py-2">{c?.errors.length ? <span className="text-rose-700">{c.errors[0].code ? `${c.errors[0].code} · ` : ''}{c.errors[0].text}</span> : c?.success ? <span className="text-emerald-700">Success{c.warnings.length ? ` · ${c.warnings.length} warning(s)` : ''}</span> : <span className="text-slate-400">—</span>}</td>
                          <td className={`px-3 py-2 text-right font-semibold tabular-nums ${statusTone(h.status)}`}>{h.status}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-600">{h.ms} ms</td>
                          <td className="px-4 py-2 font-mono text-[11.5px] text-slate-500">{h.requestId}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

export default ConsoleView;
