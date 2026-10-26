import { Aggregator, CompanyDetails } from '../types';
import { partnerEndpoints } from './channelManager';
import { RULE_DEFAULTS, WEBHOOK_EVENTS } from '../components/channel/BookingApiView';

/** The error catalogue, identical to ChannelError.java. */
export const ERROR_CATALOGUE: [string, number, string, string][] = [
  ['AUTH_FAILED', 401, 'Invalid or missing credentials', 'Stop and contact the supplier'],
  ['PERMISSION_DENIED', 403, 'No access to this location, vehicle group or operation', 'Check the channel configuration'],
  ['INVALID_REQUEST', 400, 'A required field is missing or invalid', 'Correct the request'],
  ['INVALID_LOCATION', 400, 'Unknown or inactive location code', 'Correct the location code'],
  ['INVALID_DATE', 400, 'Invalid date, time or rental duration', 'Correct the search'],
  ['INVALID_VEHICLE_GROUP', 400, 'Unknown or unavailable vehicle group', 'Correct the vehicle group'],
  ['NO_AVAILABILITY', 409, 'No vehicles available for these dates', 'Show no results'],
  ['OFFER_EXPIRED', 409, 'The offer has expired', 'Search again'],
  ['PRICE_CHANGED', 409, 'The price differs from the quoted offer', 'Show the new price'],
  ['DUPLICATE_REFERENCE', 409, 'This broker reference already exists', 'Retrieve the original booking'],
  ['RESERVATION_NOT_FOUND', 404, 'Reservation not found', 'Check the reservation number'],
  ['MODIFICATION_NOT_ALLOWED', 409, 'The reservation can no longer be modified', 'Contact the supplier'],
  ['CANCELLATION_NOT_ALLOWED', 409, 'The reservation can no longer be cancelled', 'Contact the supplier'],
  ['PAYMENT_DECLINED', 402, 'Payment or guarantee was declined', 'Retry the payment'],
  ['POLICY_VIOLATION', 422, 'The booking breaks a rental rule (e.g. driver age)', 'Show the reason to the customer'],
  ['RATE_LIMIT_EXCEEDED', 429, 'Too many requests', 'Retry with back-off'],
  ['SYSTEM_ERROR', 500, 'Internal error', 'Retry safely with the same idempotency key'],
];

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const code = (s: string) => `<pre><code>${esc(s.trim())}</code></pre>`;

/** A printable, self-contained integration guide for one broker. */
export function buildIntegrationGuide(agg: Aggregator, company: CompanyDetails, apiBase: string): string {
  const ep = partnerEndpoints(apiBase, agg);
  const r = { ...RULE_DEFAULTS, ...(agg.bookingRules || {}) };
  const locs = agg.bookingRules?.locations?.length ? agg.bookingRules.locations : [{ code: agg.locationCode || 'AMM', name: 'Main branch', pickup: true, dropOff: true }];
  const loc = locs[0].code;
  const cur = agg.currency || 'USD';
  const ch = agg.channelCode || agg.id;
  const y = new Date().getFullYear() + 1;
  const policy = r.lateCancellationFeePercent === 0 ? 'FREE' : `FLEX${r.freeCancellationHours}`;
  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
  const otaBase = ep.availRate.replace(/\/OTA_VehAvailRate$/, '');

  const section = (n: number, title: string, body: string) => `<section><h2><span>${n}</span>${esc(title)}</h2>${body}</section>`;
  const table = (head: string[], rows: (string | number)[][]) =>
    `<table><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(company.name)} — Booking API integration guide for ${esc(agg.name)}</title>
<style>
  @page { size: A4; margin: 16mm 15mm; }
  * { box-sizing: border-box; }
  body { font: 10.5pt/1.55 Inter, "Segoe UI", Arial, sans-serif; color: #0f172a; margin: 0; }
  .cover { padding: 28mm 0 10mm; border-bottom: 3px solid #0f172a; margin-bottom: 8mm; }
  .eyebrow { font-size: 9pt; letter-spacing: .16em; text-transform: uppercase; color: #4f46e5; font-weight: 700; }
  h1 { font-size: 26pt; line-height: 1.15; margin: 6px 0 10px; }
  .meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 18px; }
  .meta div { border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 10px; }
  .meta b { display: block; font-size: 8pt; text-transform: uppercase; letter-spacing: .08em; color: #64748b; }
  h2 { font-size: 14pt; margin: 9mm 0 3mm; display: flex; align-items: center; gap: 10px; page-break-after: avoid; }
  h2 span { width: 26px; height: 26px; border-radius: 6px; background: #0f172a; color: #fff; font-size: 10pt; display: inline-flex; align-items: center; justify-content: center; }
  h3 { font-size: 11pt; margin: 6mm 0 2mm; page-break-after: avoid; }
  section { page-break-inside: auto; }
  p { margin: 0 0 2.5mm; }
  table { width: 100%; border-collapse: collapse; margin: 2mm 0 4mm; font-size: 9.5pt; page-break-inside: avoid; }
  th { text-align: left; background: #f1f5f9; color: #334155; font-weight: 600; }
  th, td { border: 1px solid #e2e8f0; padding: 5px 7px; vertical-align: top; }
  td code, p code, li code { font: 9pt "JetBrains Mono", Consolas, monospace; background: #f1f5f9; padding: 1px 4px; border-radius: 4px; }
  pre { background: #0f172a; color: #e2e8f0; border-radius: 8px; padding: 10px 12px; font: 8.5pt/1.5 "JetBrains Mono", Consolas, monospace; white-space: pre-wrap; word-break: break-word; page-break-inside: avoid; margin: 1.5mm 0 4mm; }
  .note { border-left: 3px solid #4f46e5; background: #eef2ff; padding: 8px 12px; border-radius: 0 8px 8px 0; margin: 3mm 0; }
  ul { margin: 0 0 3mm; padding-left: 18px; }
  .foot { margin-top: 10mm; padding-top: 4mm; border-top: 1px solid #e2e8f0; font-size: 8.5pt; color: #64748b; }
  @media screen { body { max-width: 900px; margin: 0 auto; padding: 0 24px 40px; } .toolbar { position: sticky; top: 0; background: #fff; padding: 10px 0; border-bottom: 1px solid #e2e8f0; display: flex; gap: 8px; justify-content: flex-end; }
    .toolbar button { font: 600 13px Inter, Arial; padding: 8px 14px; border-radius: 8px; border: 1px solid #c7d2fe; background: #4f46e5; color: #fff; cursor: pointer; } }
  @media print { .toolbar { display: none; } }
</style></head><body>
<div class="toolbar"><button onclick="window.print()">Save as PDF / Print</button></div>
<div class="cover">
  <div class="eyebrow">Booking API · Integration guide</div>
  <h1>${esc(company.name)}<br>for ${esc(agg.name)}</h1>
  <p>How to search availability, book, retrieve, modify and cancel car rentals with ${esc(company.name)}, and receive status updates.</p>
  <div class="meta">
    <div><b>Channel code</b>${esc(ch)}</div><div><b>Supplier code</b>${esc(agg.vendorCode || 'NCT')}</div>
    <div><b>Currency</b>${esc(cur)}</div><div><b>Issued</b>${esc(today)}</div>
  </div>
</div>

${section(1, 'Overview', `
  <p>You sell <b>vehicle groups</b> (SIPP / ACRISS codes such as <code>ECMR</code>), not individual cars. The actual car is assigned when the customer picks it up, so models are always shown as <i>“or similar”</i>.</p>
  <p>Every price is calculated by ${esc(company.name)} at the moment of the request. Prices, availability and policies you send are never trusted: a booking is always re-priced and re-checked, and refused with <code>PRICE_CHANGED</code> or <code>NO_AVAILABILITY</code> if anything changed.</p>
  <p>The same service is offered in three formats. Use the one that suits you; they behave identically.</p>
  ${table(['Format', 'Address', 'Use when'], [
    ['OpenTravel XML (OTA 2003/05)', `<code>${esc(otaBase)}/{message}</code>`, 'You already speak OTA (OTA_VehAvailRate, OTA_VehRes …)'],
    ['Native XML', `<code>${esc(ep.nativeXml)}/{Operation}</code>`, 'You prefer simple XML with a Header and Credentials block'],
    ['REST / JSON', `<code>${esc(ep.rest)}</code>`, 'Modern JSON integrations'],
  ])}
  <h3>Environments</h3>
  <p>The same addresses serve the sandbox and production. While your channel is being certified it runs in <b>sandbox</b>: answers are real, but bookings are not passed to our branches. In production you can still force a test booking by sending the header <code>X-Environment: sandbox</code>. Every response says which environment answered (<code>Target="Test"</code> in OTA, <code>Environment</code> in native XML and JSON).</p>`)}

${section(2, 'Authentication and security', `
  <ul>
    <li>HTTPS only (TLS 1.2+). Credentials are never sent in the URL.</li>
    <li>Send your API key in <code>Authorization: Bearer &lt;key&gt;</code> or <code>X-Api-Key: &lt;key&gt;</code> (native XML may also use <code>Credentials/ApiKey</code>). Keys are issued per channel and stored only as a hash.</li>
    <li>Rate limit: <b>${r.rateLimitPerMinute}</b> requests per minute${agg.bookingRules?.ipAllowlist?.length ? `; requests are accepted only from ${esc(agg.bookingRules.ipAllowlist.join(', '))}` : ''}. Over the limit you receive <code>RATE_LIMIT_EXCEEDED</code> (HTTP 429): retry with exponential back-off.</li>
    <li>Every response carries an <code>X-Request-ID</code> header; quote it when contacting support. You may send your own <code>X-Request-ID</code>.</li>
    <li>XML is parsed with DTDs and external entities disabled; requests over 64 KB are refused.</li>
  </ul>`)}

${section(3, 'Operations', `
  ${table(['Operation', 'OTA XML', 'Native XML', 'REST / JSON'], [
    ['List locations', 'POST OTA_VehLocSearch', 'POST Locations', 'GET /locations'],
    ['List vehicle groups', '—', 'POST VehicleGroups', 'GET /vehicle-groups'],
    ['List extras', '—', 'POST Extras', 'GET /extras'],
    ['Search availability & prices', 'POST OTA_VehAvailRate', 'POST Availability', 'POST /availability'],
    ['Re-validate an offer and hold a car', '—', 'POST Quote', 'POST /quotes'],
    ['Create a booking', 'POST OTA_VehRes', 'POST ReservationCreate', 'POST /reservations'],
    ['Retrieve a booking', 'POST OTA_VehRetRes', 'POST ReservationStatus', 'GET /reservations/{id}'],
    ['Modify a booking', 'POST OTA_VehModify', 'POST ReservationModify', 'PATCH /reservations/{id}'],
    ['Cancel a booking', 'POST OTA_VehCancel', 'POST ReservationCancel', 'POST /reservations/{id}/cancel'],
  ].map(([op, ...cells]) => [esc(op), ...cells.map(c => (c === '—' ? '—' : `<code>${esc(c)}</code>`))]))}
  <h3>Typical flow</h3>
  <ol><li>Search availability. Each available group returns an <b>offer id</b> (valid ${r.offerValidityMinutes} minutes).</li>
  <li>Optional: quote the offer when the customer starts checkout; the car is held for ${r.holdMinutes} minutes.</li>
  <li>Book with the offer id, your own reference and an <code>Idempotency-Key</code>.</li>
  <li>Keep our reservation number (<code>RSV-…</code>) with your reference. Retrieve or cancel with either.</li></ol>`)}

${section(4, 'OTA XML messages', `
  <h3>Availability — OTA_VehAvailRateRQ</h3>
  ${code(`<OTA_VehAvailRateRQ xmlns="http://www.opentravel.org/OTA/2003/05" EchoToken="A1">
  <VehAvailRQCore>
    <VehRentalCore PickUpDateTime="${y}-05-01T10:00:00" ReturnDateTime="${y}-05-04T10:00:00">
      <PickUpLocation LocationCode="${loc}"/><ReturnLocation LocationCode="${loc}"/>
    </VehRentalCore>
    <DriverType Age="35"/>
  </VehAvailRQCore>
  <SpecialEquipPrefs><SpecialEquipPref EquipType="7" Quantity="1"/></SpecialEquipPrefs>
</OTA_VehAvailRateRQ>`)}
  <p>Each <code>VehAvail</code> returns <code>Status</code> (Available / Closed), the price, <code>TotalCharge</code>, the offer id in <code>&lt;Reference Type="16" ID="OFF-…" DateTime="expiry"/&gt;</code> and, in <code>VehAvailInfo/TPA_Extensions</code>, the number of cars available, the deposit, the excess, the payment type and the cancellation policy.</p>
  <h3>Book — OTA_VehResRQ</h3>
  ${code(`POST ${ep.vehRes}
Idempotency-Key: ${ch}-VOUCHER-99881

<OTA_VehResRQ xmlns="http://www.opentravel.org/OTA/2003/05" EchoToken="R1">
  <VehResRQCore>
    <Customer><Primary BirthDate="1990-05-01">
      <PersonName><GivenName>John</GivenName><Surname>Doe</Surname></PersonName>
      <Telephone PhoneNumber="+962790000000"/><Email>john.doe@example.com</Email>
      <Address><CountryName Code="JO"/></Address>
      <Document DocID="JO123456" DocType="4" DocIssueCountry="JO"/>
    </Primary></Customer>
  </VehResRQCore>
  <VehResRQInfo>
    <Reference Type="16" ID="OFF-3F2A9C1D7E5B4A60"/>
    <ArrivalDetails Number="RJ101"/>
    <TPA_Extensions><BrokerReference>VOUCHER-99881</BrokerReference></TPA_Extensions>
  </VehResRQInfo>
</OTA_VehResRQ>`)}
  <p>Without an offer, send <code>VehRentalCore</code> (dates and locations) and <code>&lt;VehPref Code="ECMR"/&gt;</code> instead of the Reference; add <code>&lt;ExpectedTotal Amount="158.40" CurrencyCode="${cur}"/&gt;</code> in TPA_Extensions to be told if the price differs.</p>
  ${code(`<OTA_VehResRS xmlns="http://www.opentravel.org/OTA/2003/05" EchoToken="R1" Target="Production" Version="2.000">
  <Success/>
  <VehResRSCore><VehReservation ReservationStatus="Reserved">
    <VehSegmentCore>
      <ConfID Type="14" ID="RSV-${y - 1}-000123"/>
      <ConfID Type="16" ID="VOUCHER-99881" ID_Context="BROKER"/>
      …
      <TotalCharge RateTotalAmount="120.00" EstimatedTotalAmount="135.00" CurrencyCode="${cur}"/>
    </VehSegmentCore>
  </VehReservation></VehResRSCore>
  <TPA_Extensions><ReservationStatus>CONFIRMED</ReservationStatus><PaymentStatus>…</PaymentStatus>
    <CancellationPolicy Code="${policy}"/></TPA_Extensions>
</OTA_VehResRS>`)}
  <h3>Retrieve, modify, cancel</h3>
  ${code(`<OTA_VehRetResRQ><VehRetResRQCore><UniqueID Type="14" ID="RSV-${y - 1}-000123"/>
  <PersonName><Surname>Doe</Surname></PersonName></VehRetResRQCore></OTA_VehRetResRQ>

<OTA_VehModifyRQ><VehModifyRQCore ModifyType="Modify"><UniqueID Type="14" ID="RSV-${y - 1}-000123"/>
  <VehRentalCore PickUpDateTime="${y}-05-01T10:00:00" ReturnDateTime="${y}-05-05T10:00:00"/>
</VehModifyRQCore></OTA_VehModifyRQ>

<OTA_VehCancelRQ><VehCancelRQCore CancelType="Cancel"><UniqueID Type="14" ID="RSV-${y - 1}-000123"/>
  <PersonName><Surname>Doe</Surname></PersonName></VehCancelRQCore></OTA_VehCancelRQ>`)}
  <p>UniqueID may also carry your own reference. When a surname is sent it must match the booking.</p>
  <h3>Errors</h3>
  ${code(`<OTA_VehResRS …><Errors>
  <Error Type="3" Code="322" ShortText="NO_AVAILABILITY" Status="NotProcessed" Tag="REQ-1A2B3C4D5E6F7">No vehicles available for these dates</Error>
</Errors></OTA_VehResRS>`)}
  <p><code>ShortText</code> is always one of the codes in section 8; <code>Tag</code> is the request id.</p>`)}

${section(5, 'Native XML messages', `
  ${code(`POST ${ep.nativeXml}/Availability

<AvailabilityRequest>
  <Header><RequestID>BRK-${y - 1}1026-000123</RequestID><ChannelCode>${esc(ch)}</ChannelCode></Header>
  <Credentials><Username>${esc(ch.toLowerCase())}_api</Username><ApiKey>••••••</ApiKey></Credentials>
  <Itinerary>
    <PickupLocationCode>${loc}</PickupLocationCode><PickupDateTime>${y}-05-01T10:00:00</PickupDateTime>
    <ReturnLocationCode>${loc}</ReturnLocationCode><ReturnDateTime>${y}-05-04T10:00:00</ReturnDateTime>
    <DriverAge>35</DriverAge>
  </Itinerary>
  <Extras><Extra><Code>7</Code><Quantity>1</Quantity></Extra></Extras>
</AvailabilityRequest>`)}
  ${code(`<AvailabilityResponse>
  <Header><RequestID>BRK-${y - 1}1026-000123</RequestID><Status>SUCCESS</Status><Environment>PRODUCTION</Environment><Timestamp>…</Timestamp></Header>
  <Offers><Offer>
    <OfferID>OFF-…</OfferID><VehicleGroupCode>ECMR</VehicleGroupCode><Available>true</Available><AvailableCount>3</AvailableCount>
    <Currency>${cur}</Currency><RentalDays>3</RentalDays>
    <Price><BaseAmount>105.00</BaseAmount><ExtrasAmount>15.00</ExtrasAmount><FeesAmount>0.00</FeesAmount>
      <TaxAmount>0.00</TaxAmount><TaxIncluded>true</TaxIncluded><TotalAmount>120.00</TotalAmount><Breakdown>…</Breakdown></Price>
    <Policies><CancellationPolicyCode>${policy}</CancellationPolicyCode><PaymentType>${r.paymentModel}</PaymentType><DepositAmount>200.00</DepositAmount></Policies>
    <QuoteExpiresAt>…</QuoteExpiresAt>
  </Offer></Offers>
</AvailabilityResponse>`)}
  ${code(`POST ${ep.nativeXml}/ReservationCreate

<ReservationCreateRequest>
  <Header><RequestID>BRK-2</RequestID><ChannelCode>${esc(ch)}</ChannelCode><IdempotencyKey>${esc(ch)}-VOUCHER-99881</IdempotencyKey></Header>
  <Credentials><ApiKey>••••••</ApiKey></Credentials>
  <OfferID>OFF-…</OfferID><BrokerReference>VOUCHER-99881</BrokerReference>
  <Customer><Title>Mr</Title><FirstName>John</FirstName><LastName>Doe</LastName><Email>john.doe@example.com</Email><Phone>+962790000000</Phone><Country>JO</Country></Customer>
  <Driver><DateOfBirth>1990-05-01</DateOfBirth><LicenceNumber>JO123456</LicenceNumber><LicenceCountry>JO</LicenceCountry></Driver>
</ReservationCreateRequest>`)}
  <p>Other operations: <code>Quote</code> (OfferID), <code>ReservationStatus</code> / <code>ReservationCancel</code> (ReservationID or BrokerReference, optional Reason), <code>ReservationModify</code> (ReservationID plus a partial Itinerary, Extras, Customer or Driver). Errors: <code>&lt;Status&gt;ERROR&lt;/Status&gt;&lt;ErrorCode&gt;…&lt;/ErrorCode&gt;&lt;ErrorMessage&gt;…&lt;/ErrorMessage&gt;</code>.</p>`)}

${section(6, 'REST / JSON', `
  ${code(`POST ${ep.rest}/reservations
Authorization: Bearer ••••••
Idempotency-Key: ${ch}-VOUCHER-99881
Content-Type: application/json

{
  "offer_id": "OFF-…",
  "broker_reference": "VOUCHER-99881",
  "customer": { "first_name": "John", "last_name": "Doe", "email": "john.doe@example.com", "phone": "+962790000000", "country": "JO" },
  "driver": { "date_of_birth": "1990-05-01", "licence_number": "JO123456", "licence_country": "JO" },
  "flight_number": "RJ101"
}`)}
  ${code(`{ "status": "SUCCESS", "request_id": "REQ-…", "environment": "PRODUCTION",
  "reservation": { "reservation_id": "RSV-${y - 1}-000123", "broker_reference": "VOUCHER-99881", "status": "CONFIRMED",
    "vehicle_group": "ECMR", "pickup_at": "${y}-05-01T10:00:00", "return_at": "${y}-05-04T10:00:00",
    "total_amount": 120.00, "currency": "${cur}", "payment_type": "${r.paymentModel}", "cancellation_policy": "${policy}", … } }`)}
  <p>Search: <code>POST /availability</code> with <code>{"itinerary": {"pickup_location", "return_location", "pickup_at", "return_at", "driver_age", "vehicle_group", "extras": [{"code", "quantity"}]}}</code>. Errors: <code>{"status":"ERROR","error_code":"…","error_message":"…","request_id":"…","timestamp":"…"}</code>.</p>`)}

${section(7, 'Reservation statuses', `
  ${table(['Status', 'Meaning'], [
    ['<code>CONFIRMED</code>', 'Booking confirmed'], ['<code>PENDING</code>', 'Awaiting confirmation'], ['<code>IN_PROGRESS</code>', 'Car picked up, rental agreement open'],
    ['<code>COMPLETED</code>', 'Car returned, rental closed'], ['<code>CANCELLED</code>', 'Cancelled (with any fee and refund)'], ['<code>NO_SHOW</code>', 'Customer did not arrive'],
  ])}
  <div class="note">Never assume a booking changed state: retrieve it, or wait for the webhook. A booking is only confirmed when we answer CONFIRMED.</div>`)}

${section(8, 'Error catalogue', table(['Code', 'HTTP', 'Meaning', 'What to do'], ERROR_CATALOGUE.map(([c, h, m, a]) => [`<code>${c}</code>`, h, esc(m), esc(a)])))}

${section(9, 'Idempotency and retries', `
  <ul>
    <li>Send an <code>Idempotency-Key</code> on every booking (header, or <code>Header/IdempotencyKey</code> in native XML). Without one, your broker reference is used as the key.</li>
    <li>Retrying with the same key and the same details returns the original booking — never a second one. The same key with different details returns <code>DUPLICATE_REFERENCE</code>.</li>
    <li>A broker reference can be booked only once; to change a booking, modify it.</li>
    <li>Cancelling a booking that is already cancelled succeeds and returns the cancelled booking.</li>
    <li>Safe to retry: <code>SYSTEM_ERROR</code>, <code>RATE_LIMIT_EXCEEDED</code> and network timeouts, with the same key.</li>
  </ul>`)}

${section(10, 'Webhooks', `
  <p>We POST JSON to your webhook URL when a booking changes — including changes made at our counter (pick-up, return, cancellation).</p>
  ${table(['Event', 'When'], WEBHOOK_EVENTS.map(([e, l]) => [`<code>${e}</code>`, esc(l)]))}
  ${code(`POST https://your-endpoint
X-NCT-Event: reservation.confirmed
X-NCT-Delivery: evt_6f1c…
X-NCT-Timestamp: 1767225600
X-NCT-Signature: sha256=<hex HMAC-SHA256(secret, timestamp + "." + raw body)>

{ "event_id": "evt_6f1c…", "event_type": "reservation.confirmed", "channel_code": "${esc(ch)}",
  "reservation_id": "RSV-${y - 1}-000123", "broker_reference": "VOUCHER-99881", "status": "CONFIRMED",
  "occurred_at": "…", "sandbox": false, "data": { …the full reservation… } }`)}
  <p>Verify the signature with the secret we gave you, and reject events older than 5 minutes:</p>
  ${code(`// Node.js
const crypto = require('crypto');
function verify(rawBody, headers, secret) {
  const ts = headers['x-nct-timestamp'];
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(ts + '.' + rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(headers['x-nct-signature']));
}`)}
  <p>Answer with any 2xx status within 15 seconds. Otherwise we retry after 1, 2, 4, 8 … minutes (at most hourly) for 24 hours. Use <code>event_id</code> to ignore duplicates.</p>`)}

${section(11, 'Commercial terms for this channel', table(['Term', 'Value'], [
  ['Payment model', r.paymentModel === 'BROKER_PREPAID' ? 'Broker prepaid — you collect from the customer and settle with us' : 'Pay at the counter — the customer pays at pick-up'],
  ['Cancellation', r.lateCancellationFeePercent === 0 ? 'Free at any time' : `Free until ${r.freeCancellationHours} hours before pick-up, then ${r.lateCancellationFeePercent}% of the booking (policy ${policy})`],
  ['Modification fee', r.modificationFee ? `${r.modificationFee} ${cur}` : 'None'],
  ['One-way fee', r.oneWayFee ? `${r.oneWayFee} ${cur}` : 'None'],
  ['Booking cut-off', `${r.minLeadHours} hours before pick-up`],
  ['Booking horizon', `Up to ${r.maxHorizonDays} days ahead`],
  ['Longest rental', `${r.maxRentalDays} days`],
  ['Driver age', `${r.minDriverAge}${r.maxDriverAge ? `–${r.maxDriverAge}` : '+'} years`],
  ['Security deposit', 'Held at pick-up for every booking (amount per vehicle group in each offer)'],
  ['Locations', locs.map(l => `<code>${esc(l.code)}</code> ${esc(l.name)}${!l.pickup ? ' (returns only)' : !l.dropOff ? ' (pick-ups only)' : ''}`).join('<br>')],
  ['Commission', agg.commissionPercent != null ? `${agg.commissionPercent}%` : 'As per agreement'],
  ['Currency', cur],
]))}

${section(12, 'Certification', `
  <p>Before go-live we run, and you should run in the sandbox, these cases: authentication success and failure; location and vehicle-group lists; availability search; no-availability; quote and hold; expired offer; changed price; booking; duplicate prevention (same key twice); retrieval by both references; modification; cancellation and its fee; invalid location, date and vehicle group; webhook delivery and retry; rate-limit handling.</p>`)}

<div class="foot">${esc(company.name)}${company.address ? ` · ${esc(company.address)}` : ''}${company.supportEmail || company.email ? ` · ${esc(company.supportEmail || company.email)}` : ''}${company.supportPhone || company.phone ? ` · ${esc(company.supportPhone || company.phone)}` : ''} — Booking API integration guide for ${esc(agg.name)}, ${esc(today)}.</div>
</body></html>`;
}

export const openIntegrationGuide = (agg: Aggregator, company: CompanyDetails, apiBase: string) => {
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.open();
  w.document.write(buildIntegrationGuide(agg, company, apiBase));
  w.document.close();
  return true;
};
