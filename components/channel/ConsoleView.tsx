import React, { useMemo, useState } from 'react';
import { Aggregator, Fleet } from '../../types';
import { sendChannelConsole, ChannelConsoleResult } from '../../firebase/api';
import { Panel, Button, Badge, selectCls, inputCls } from '../ui/Crm';
import { pretty } from './TrafficView';

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

/** Sends real broker messages to this channel in the sandbox: nothing is booked for real and no webhooks are sent. */
const ConsoleView: React.FC<{ aggregator: Aggregator; fleet: Fleet }> = ({ aggregator, fleet }) => {
  const list = useMemo(() => templates(aggregator, fleet), [aggregator, fleet]);
  const [tpl, setTpl] = useState(list[3]);
  const [body, setBody] = useState(list[3].body);
  const [operation, setOperation] = useState(list[3].operation || '');
  const [method, setMethod] = useState(list[3].method || 'POST');
  const [res, setRes] = useState<ChannelConsoleResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<{ offer?: string; reservation?: string }>({});
  const [history, setHistory] = useState<{ label: string; status: number; ms: number; at: string }[]>([]);

  const choose = (id: string) => {
    const t = list.find(x => x.id === id)!;
    setTpl(t); setBody(t.body); setOperation(t.operation || ''); setMethod(t.method || 'POST');
  };
  const filled = (s: string) => s.replace(/\{\{OFFER\}\}/g, last.offer || '{{OFFER}}').replace(/\{\{RESERVATION\}\}/g, last.reservation || '{{RESERVATION}}');
  const missing = /\{\{(OFFER|RESERVATION)\}\}/.exec(filled(body + operation));

  const send = async () => {
    setBusy(true); setError(null);
    try {
      const r = await sendChannelConsole(aggregator.id, { format: tpl.format, operation: filled(operation), method, body: filled(body) });
      setRes(r);
      const offer = /OFF-[A-Z0-9]{16}/.exec(r.body || '')?.[0];
      const rsv = /RSV-\d{4}-\d{6}/.exec(r.body || '')?.[0];
      setLast(prev => ({ offer: offer || prev.offer, reservation: rsv || prev.reservation }));
      setHistory(h => [{ label: tpl.label, status: r.status, ms: r.durationMs, at: new Date().toLocaleTimeString('en-GB') }, ...h].slice(0, 8));
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-[13px] text-amber-900">
        <b>Sandbox.</b> Messages go through the real gateway exactly as a broker's would, but nothing is booked for real and no webhooks are sent. Every call also appears in the Traffic tab.
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Request" subtitle={tpl.format === 'REST' ? 'JSON over HTTPS' : tpl.format === 'SOAP' ? 'SOAP envelope with an OTA message' : tpl.format === 'XML' ? 'Native XML message' : 'OpenTravel 2003/05 message'}
          actions={<Button variant="primary" size="sm" onClick={send} disabled={busy || !!missing}>{busy ? 'Sending…' : 'Send'}</Button>} bodyClassName="p-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <select value={tpl.id} onChange={e => choose(e.target.value)} className={`${selectCls} flex-1 min-w-[220px]`} aria-label="Message">
              {(['OTA', 'SOAP', 'XML', 'REST'] as Format[]).map(f => (
                <optgroup key={f} label={f === 'XML' ? 'Native XML' : f}>{list.filter(t => t.format === f).map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</optgroup>
              ))}
            </select>
            {tpl.format === 'REST' && (
              <>
                <select value={method} onChange={e => setMethod(e.target.value)} className={`${selectCls} w-24`} aria-label="Method">{['GET', 'POST', 'PATCH'].map(m => <option key={m}>{m}</option>)}</select>
                <input value={operation} onChange={e => setOperation(e.target.value)} className={`${inputCls} flex-1 min-w-[180px] font-mono text-xs`} aria-label="Path" />
              </>
            )}
            {tpl.format === 'XML' && <input value={operation} onChange={e => setOperation(e.target.value)} className={`${inputCls} w-48 font-mono text-xs`} aria-label="Operation" />}
          </div>
          {(last.offer || last.reservation) && (
            <p className="text-xs text-slate-500">From the last answers: {last.offer && <>offer <span className="font-mono text-slate-700">{last.offer}</span></>}
              {last.offer && last.reservation && ' · '}{last.reservation && <>booking <span className="font-mono text-slate-700">{last.reservation}</span></>}. They replace {'{{OFFER}}'} and {'{{RESERVATION}}'} when you send.</p>
          )}
          {missing && <p className="text-xs text-amber-700">Run an availability search {missing[1] === 'RESERVATION' ? 'and a booking ' : ''}first: this message needs {missing[0]}.</p>}
          <textarea value={body} onChange={e => setBody(e.target.value)} spellCheck={false} wrap="off" disabled={tpl.format === 'REST' && method === 'GET'}
            className="w-full h-[26rem] rounded-lg border border-slate-300 bg-slate-950 text-slate-100 font-mono text-[11.5px] leading-[1.55] p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 disabled:opacity-40"
            aria-label="Message body" />
        </Panel>
        <Panel title="Response" subtitle={res ? `${res.requestId} · ${res.contentType || ''}` : 'Send a message to see the answer.'}
          actions={res && <span className="inline-flex items-center gap-2"><Badge tone={res.status < 300 ? 'success' : res.status < 500 ? 'warning' : 'danger'}>HTTP {res.status}</Badge>
            <span className="text-xs tabular-nums text-slate-500">{res.durationMs} ms</span></span>} bodyClassName="p-4 space-y-3">
          {error && <p className="text-xs text-rose-600">{error}</p>}
          <pre className="w-full h-[26rem] overflow-auto rounded-lg border border-slate-200 bg-white p-3 font-mono text-[11.5px] leading-[1.55] text-slate-800 whitespace-pre">{res ? pretty(res.body) : ''}</pre>
          {history.length > 0 && (
            <div className="text-xs text-slate-500 space-y-1">
              {history.map((h, i) => <div key={i} className="flex gap-2 tabular-nums"><span className="w-16">{h.at}</span><span className={h.status < 300 ? 'text-emerald-700' : 'text-rose-600'}>{h.status}</span><span className="flex-1 truncate">{h.label}</span><span>{h.ms} ms</span></div>)}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
};

export default ConsoleView;
