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
  .start { border: 1px solid #c7d2fe; background: #f8faff; border-radius: 10px; padding: 6mm 7mm; margin-bottom: 4mm; page-break-inside: avoid; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; }
  .cols h3 { margin-top: 2mm; }
  .steps { margin: 2mm 0 0; padding-top: 3mm; border-top: 1px solid #e2e8f0; font-size: 9.5pt; }
  .steps b { display: inline-flex; width: 18px; height: 18px; border-radius: 50%; background: #4f46e5; color: #fff; font-size: 8pt; align-items: center; justify-content: center; }
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

<div class="start">
  <h2 style="margin-top:0">Getting connected</h2>
  <p><b>The API we use:</b> the <b>OpenTravel Alliance (OTA) 2003/05</b> car-rental XML standard (<code>OTA_VehAvailRate</code>, <code>OTA_VehRes</code>, <code>OTA_VehRetRes</code>, <code>OTA_VehModify</code>, <code>OTA_VehCancel</code> …) over HTTPS, the format used by car-rental brokers and GDS. The same service is also offered as OTA over SOAP (with WSDL), native XML (with XSD) and REST / JSON, so you can connect with whichever your system already supports.</p>
  <div class="cols">
    <div>
      <h3>What you receive from us</h3>
      <ul>
        <li>The addresses: OTA <code>${esc(otaBase)}/{message}</code> (all formats in section 1)</li>
        <li>Your channel code <code>${esc(ch)}</code> and our supplier code <code>${esc(agg.vendorCode || 'NCT')}</code></li>
        <li>Your API key, sent <b>separately</b> through a secure channel (never in this document or by plain email)</li>
        <li>Location codes ${locs.map(l => `<code>${esc(l.code)}</code>`).join(', ')} and the vehicle groups (SIPP) we sell (section 12, also live through <code>OTA_VehLocSearch</code>)</li>
        <li>Rates in ${esc(cur)}, payment and cancellation terms (section 11)</li>
        <li>A webhook signing secret, if you take status updates (section 10)</li>
        <li>Sandbox access for testing and certification</li>
      </ul>
    </div>
    <div>
      <h3>What we need from you</h3>
      <ul>
        <li>Company legal name and the brand(s) you sell under</li>
        <li>A technical contact and an operations / escalation contact (name, email, phone)</li>
        <li>The format you will use: OTA XML, SOAP, native XML or REST / JSON</li>
        <li>Your outgoing server IP addresses, so we can restrict access to them</li>
        <li>Your HTTPS webhook URL, if you want booking status updates</li>
        <li>The format of your booking reference (must be unique per booking)</li>
        <li>Commission / payment terms and an invoicing contact</li>
        <li>Confirmation that the certification cases pass in the sandbox (section 17)</li>
      </ul>
    </div>
  </div>
  <p class="steps"><b>1</b> Exchange the details above &nbsp;→&nbsp; <b>2</b> Build and test in the sandbox &nbsp;→&nbsp; <b>3</b> Certification &nbsp;→&nbsp; <b>4</b> Go-live: we switch your channel to production, and bookings arrive directly in our reservation system.</p>
</div>

${section(1, 'Overview', `
  <p>You sell <b>vehicle groups</b> (SIPP / ACRISS codes such as <code>ECMR</code>), not individual cars. The actual car is assigned when the customer picks it up, so models are always shown as <i>“or similar”</i>.</p>
  <p>Every price is calculated by ${esc(company.name)} at the moment of the request. Prices, availability and policies you send are never trusted: a booking is always re-priced and re-checked, and refused with <code>PRICE_CHANGED</code> or <code>NO_AVAILABILITY</code> if anything changed.</p>
  <p>The same service is offered in three formats. Use the one that suits you; they behave identically.</p>
  ${table(['Format', 'Address', 'Use when'], [
    ['OpenTravel XML (OTA 2003/05)', `<code>${esc(otaBase)}/{message}</code>`, 'You already speak OTA (OTA_VehAvailRate, OTA_VehRes …)'],
    ['Native XML', `<code>${esc(ep.nativeXml)}/{Operation}</code>`, 'You prefer simple XML with a Header and Credentials block'],
    ['OTA over SOAP 1.1 / 1.2', `<code>${esc(ep.soap)}</code>`, 'Your system needs a SOAP envelope (WSDL at <code>?wsdl</code>)'],
    ['REST / JSON', `<code>${esc(ep.rest)}</code>`, 'Modern JSON integrations'],
  ])}
  <h3>Environments</h3>
  <p>The same addresses serve the sandbox and production. While your channel is being certified it runs in <b>sandbox</b>: answers are real, but bookings are not passed to our branches. In production you can still force a test booking by sending the header <code>X-Environment: sandbox</code>. Every response says which environment answered (<code>Target="Test"</code> in OTA, <code>Environment</code> in native XML and JSON).</p>`)}

${section(2, 'Authentication and security', `
  <ul>
    <li>HTTPS only (TLS 1.2+). Credentials are never sent in the URL.</li>
    <li>Send your API key in <code>Authorization: Bearer &lt;key&gt;</code> or <code>X-Api-Key: &lt;key&gt;</code>. In OTA messages it may travel as <code>POS/Source/RequestorID MessagePassword</code>, over SOAP as a WS-Security <code>UsernameToken</code> (Username = <code>${esc(ch)}</code>, Password = key), and in native XML as <code>Credentials/ApiKey</code>. Keys are issued per channel and stored only as a hash.</li>
    <li>Rate limit: <b>${r.rateLimitPerMinute}</b> requests per minute${agg.bookingRules?.ipAllowlist?.length ? `; requests are accepted only from ${esc(agg.bookingRules.ipAllowlist.join(', '))}` : ''}. Over the limit you receive <code>RATE_LIMIT_EXCEEDED</code> (HTTP 429): retry with exponential back-off.</li>
    <li>Every response carries an <code>X-Request-ID</code> header; quote it when contacting support. You may send your own <code>X-Request-ID</code>.</li>
    <li>XML is parsed with DTDs and external entities disabled; requests over 64 KB are refused.</li>
  </ul>`)}

${section(3, 'Operations', `
  ${table(['Operation', 'OTA XML', 'Native XML', 'REST / JSON'], [
    ['List locations', 'POST OTA_VehLocSearch', 'POST Locations', 'GET /locations'],
    ['List vehicle groups', '—', 'POST VehicleGroups', 'GET /vehicle-groups'],
    ['List extras', '—', 'POST Extras', 'GET /extras'],
    ['List insurance covers', 'in OTA_VehAvailRate (PricedCoverages)', 'POST Coverages', 'GET /coverages'],
    ['Free cars per group per day', 'webhook inventory.updated', 'POST Inventory', 'GET /inventory?days=60'],
    ['Search availability & prices', 'POST OTA_VehAvailRate', 'POST Availability', 'POST /availability'],
    ['Re-validate an offer and hold a car', '—', 'POST Quote', 'POST /quotes'],
    ['Full terms of an offer before booking', 'POST OTA_VehRateRule', 'POST RateRules', 'POST /rate-rules'],
    ['One station in full', 'POST OTA_VehLocDetail', 'POST LocationDetail', 'GET /locations/{code}'],
    ['Reconciliation: bookings by pick-up date', '—', 'POST ReservationList', 'GET /reservations?from=&to='],
    ['Credentials and service check', 'POST OTA_Ping', 'POST Ping', 'GET /ping'],
    ['Create a booking', 'POST OTA_VehRes', 'POST ReservationCreate', 'POST /reservations'],
    ['Retrieve a booking', 'POST OTA_VehRetRes', 'POST ReservationStatus', 'GET /reservations/{id}'],
    ['Modify a booking', 'POST OTA_VehModify', 'POST ReservationModify', 'PATCH /reservations/{id}'],
    ['Cancel a booking', 'POST OTA_VehCancel', 'POST ReservationCancel', 'POST /reservations/{id}/cancel'],
  ].map(([op, ...cells]) => [esc(op), ...cells.map(c => (c === '—' ? '—' : c.includes(' ') && !c.startsWith('POST') && !c.startsWith('GET') && !c.startsWith('PATCH') ? esc(c) : `<code>${esc(c)}</code>`))]))}
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
  ['Commission', agg.commissionPercent != null ? `${agg.commissionPercent}% of the booking total (of the fee for cancellations and no-shows), settled monthly by pick-up month` : 'As per agreement'],
  ['Young / senior driver', [agg.bookingRules?.pricing?.youngDriverFee ? `Under ${agg.bookingRules.pricing.youngDriverUnder}: ${agg.bookingRules.pricing.youngDriverFee} ${cur} a day` : '',
    agg.bookingRules?.pricing?.seniorDriverFee ? `${agg.bookingRules.pricing.seniorDriverFrom}+: ${agg.bookingRules.pricing.seniorDriverFee} ${cur} a day` : ''].filter(Boolean).join('; ') || 'No surcharge'],
  ['Currency', cur],
]))}

${section(12, 'Vehicles, stations, covers, tax and promotions', `
  <h3>Vehicle details</h3>
  <p>Every vehicle group carries seats, doors, bags, fuel and a picture. In OTA they are on <code>Vehicle</code>: <code>PassengerQuantity</code>, <code>BaggageQuantity</code>, <code>FuelType</code>, <code>VehType DoorCount</code>, <code>VehClass Size</code> and <code>PictureURL</code>; in native XML under <code>VehicleDetails</code>; in JSON under <code>vehicle</code>.</p>
  ${code(`<Vehicle AirConditionInd="true" TransmissionType="Automatic" FuelType="Petrol" PassengerQuantity="5" BaggageQuantity="3" Code="ECMR" CodeContext="SIPP">
  <VehType VehicleCategory="1" DoorCount="4"/><VehClass Size="3"/>
  <VehMakeModel Name="Kia Picanto or similar" Code="ECMR"/>
  <PictureURL>https://…/api/media/…</PictureURL>
</Vehicle>`)}
  <h3>Stations</h3>
  <p><code>OTA_VehLocSearchRS</code> returns per station: address, <code>Telephone</code>, <code>Position Latitude/Longitude</code>, opening hours as <code>OperationSchedules/OperationTime Mon="true" Start="08:00" End="20:00"</code>, and in TPA_Extensions the station type and whether after-hours pick-up / return is possible (with its fee). A pick-up or return outside the opening hours is refused with <code>INVALID_DATE</code>, unless after-hours service is offered, in which case the after-hours fee is added to the price.</p>
  ${table(['Station', 'Type', 'Phone', 'Opening hours', 'After hours'], locs.map(l => {
    const h = l.openingHours || {};
    const days = Object.entries(h).filter(([, v]) => v && !v.closed).map(([d, v]) => `${d.slice(0, 1).toUpperCase()}${d.slice(1)} ${v!.open}–${v!.close}`);
    const open = Object.values(h).filter(v => v && !v.closed);
    const same = open.length === 7 && open.every(v => v!.open === open[0]!.open && v!.close === open[0]!.close);
    const hoursText = !days.length ? 'Around the clock' : same ? (open[0]!.open === '00:00' && open[0]!.close >= '23:59' ? 'Around the clock' : `Every day ${open[0]!.open}–${open[0]!.close}`) : days.join(', ');
    return [`<code>${esc(l.code)}</code> ${esc(l.name)}`, esc(l.type || 'CITY'), esc(l.phone || '—'), esc(hoursText),
      l.afterHoursPickup || l.afterHoursReturn ? `${[l.afterHoursPickup && 'pick-up', l.afterHoursReturn && 'return'].filter(Boolean).join(' and ')}${l.afterHoursFee ? `, ${l.afterHoursFee} ${cur}` : ''}` : 'No'];
  }))}
  <h3>Insurance covers</h3>
  <p>Each offer lists the covers in <code>PricedCoverages</code>: included covers with <code>IncludedInRate="true"</code>, optional covers with their daily price and the excess that applies with them (<code>Deductible ExcessAmount</code>). To sell an optional cover, send it in the search or booking: <code>&lt;CoveragePrefs&gt;&lt;CoveragePref CoverageType="SCDW"/&gt;&lt;/CoveragePrefs&gt;</code> (native: <code>Coverages/CoverageCode</code>; JSON: <code>"coverages": ["SCDW"]</code>).</p>
  ${(agg.bookingRules?.pricing?.coverages || []).length ? table(['Code', 'Cover', 'Price', 'Excess with it'], (agg.bookingRules!.pricing!.coverages || []).map(c => [`<code>${esc(c.code)}</code>`, esc(c.name),
    c.included ? 'Included' : `${c.dailyPrice || 0} ${cur} a day`, c.excess != null ? `${c.excess} ${cur}` : "The car's excess"])) : ''}
  <h3>Tax, mileage and fees</h3>
  <p>${(agg.bookingRules?.pricing?.taxPercent || 0) > 0
    ? `${esc(agg.bookingRules?.pricing?.taxName || 'VAT')} ${agg.bookingRules!.pricing!.taxPercent}% is ${agg.bookingRules?.pricing?.taxIncluded === false ? '<b>added</b> to the prices (a TAX line in the breakdown)' : '<b>included</b> in all prices'} and reported in <code>TaxAmounts</code> (native <code>TaxAmount</code>, JSON <code>tax_amount</code>).`
    : 'No tax is added to the prices.'}
    Mileage is in <code>RateDistance</code>: ${agg.bookingRules?.pricing?.unlimitedMileage === false ? `${agg.bookingRules.pricing.kmPerDay || 0} km a day included, then ${agg.bookingRules.pricing.extraKmPrice || 0} ${cur} per km` : 'unlimited'}.
    Fees appear in <code>Fees</code> with their purpose: <code>ONE_WAY</code>, <code>AFTER_HOURS</code>, <code>YOUNG_DRIVER</code>, <code>SENIOR_DRIVER</code>, <code>MODIFY</code>; discounts with the promotion code.</p>
  <h3>Promotion codes</h3>
  <p>Send an agreed code with the search or booking: OTA <code>&lt;RateQualifier PromotionCode="SUMMER10"/&gt;</code>, native <code>&lt;PromoCode&gt;</code>, JSON <code>"promo_code"</code>. It lowers the rental rate by its percentage for the groups and pick-up dates it covers; an unknown or expired code is refused with <code>POLICY_VIOLATION</code>. The applied code is returned with the offer and the booking.</p>`)}

${section(13, 'SOAP, WSDL and XML schema', `
  <p>All OTA messages are also accepted in a SOAP 1.1 (<code>text/xml</code>) or SOAP 1.2 (<code>application/soap+xml</code>) envelope at <code>${esc(ep.soap)}</code>. The answer comes in the same SOAP version. Business errors are returned as the OTA RS with <code>Errors</code>; a SOAP Fault means the envelope itself could not be read.</p>
  ${code(`POST ${ep.soap}
Content-Type: text/xml; charset=utf-8

<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
    xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
  <soapenv:Header><wsse:Security><wsse:UsernameToken>
    <wsse:Username>${esc(ch)}</wsse:Username><wsse:Password>••••••</wsse:Password>
  </wsse:UsernameToken></wsse:Security></soapenv:Header>
  <soapenv:Body>
    <OTA_VehAvailRateRQ xmlns="http://www.opentravel.org/OTA/2003/05" EchoToken="A1">…</OTA_VehAvailRateRQ>
  </soapenv:Body>
</soapenv:Envelope>`)}
  ${table(['Document', 'Address'], [['WSDL (SOAP 1.1 and 1.2 bindings)', `<code>${esc(ep.wsdl)}</code>`], ['Native XML schema (XSD)', `<code>${esc(ep.nativeXsd)}</code>`]])}
  <p>Every native XML request and response validates against the XSD.</p>`)}

${section(14, 'Inventory push, allotments and no-shows', `
  <p>If you subscribe to <code>inventory.updated</code>, we push the number of free cars per vehicle group per day for the next ${agg.bookingRules?.inventoryPushDays || 60} days whenever it changes (checked every 15 minutes, and at least daily). You can also pull the same data: native <code>Inventory</code>, REST <code>GET /inventory?days=60</code>.</p>
  ${code(`{ "event_type": "inventory.updated", "channel_code": "${esc(ch)}", "data": { "from": "${y}-05-01", "to": "${y}-06-29",
  "groups": [ { "vehicle_group": "ECMR", "fleet_size": 6,
    "days": [ { "date": "${y}-05-01", "available": 3, "status": "OPEN" }, { "date": "${y}-05-02", "available": 0, "status": "CLOSED", "reason": "Sold out for these dates" } ] } ] } }`)}
  ${(agg.bookingRules?.allotments || []).length ? `<p>Allotments agreed for this channel (cars of a group you may hold at the same time, for pick-ups in the period):</p>
  ${table(['Group', 'Pick-ups', 'Cars', 'Release'], (agg.bookingRules!.allotments || []).map(a => [`<code>${esc(a.group)}</code>`, `${esc(a.from)} – ${esc(a.to)}`, a.stopSell ? 'Stop sell' : a.quantity, a.releaseDays ? `${a.releaseDays} days before pick-up` : '—']))}` : '<p>No allotments: you sell from our general availability (free sale).</p>'}
  <p>${agg.bookingRules?.noShowAfterHours ? `A booking not picked up ${agg.bookingRules.noShowAfterHours} hours after its pick-up time becomes <code>NO_SHOW</code>${agg.bookingRules.noShowFeePercent != null ? ` with a fee of ${agg.bookingRules.noShowFeePercent}% of the booking` : ''}, and <code>reservation.no_show</code> is sent.` : 'No-shows are recorded by our staff and sent as <code>reservation.no_show</code>.'}</p>`)}

${section(15, 'Rate rules, cancellation schedule and currencies', `
  <h3>Rate rules before booking</h3>
  <p>Before the customer pays, ask for the full terms of the offer: <code>OTA_VehRateRuleRQ</code> with <code>&lt;Reference Type="16" ID="OFF-…"/&gt;</code> (or an itinerary and <code>VehPref</code>). The answer has the price and breakdown, covers, every extra with its price, payment rules, the cancellation schedule, age limits, cut-off and maximum rental, both stations in full and our rental terms (<code>RentalTerms</code>).</p>
  ${code(`<OTA_VehRateRuleRQ xmlns="http://www.opentravel.org/OTA/2003/05" EchoToken="RR1">
  <Reference Type="16" ID="OFF-3F2A9C1D7E5B4A60"/>
</OTA_VehRateRuleRQ>`)}
  <h3>Cancellation schedule</h3>
  <p>Every offer, rate rule and booking carries the schedule with absolute deadlines. A booking keeps the schedule it was made under, even if our policy changes later.</p>
  ${table(['Cancelled', 'Fee'], (() => {
    const t = (agg.bookingRules?.cancellationTiers?.length ? agg.bookingRules.cancellationTiers : [{ hoursBefore: r.freeCancellationHours, feePercent: r.lateCancellationFeePercent }])
      .slice().sort((a, b) => b.hoursBefore - a.hoursBefore).filter(x => x.feePercent > 0);
    const h = (n: number) => (n % 24 === 0 ? `${n / 24} day${n === 24 ? '' : 's'}` : `${n} hours`);
    return t.length ? [[`More than ${h(t[0].hoursBefore)} before pick-up`, 'Free'], ...t.map(x => [`Less than ${h(x.hoursBefore)} before pick-up`, `${x.feePercent}% of the booking`])] : [['At any time', 'Free']];
  })())}
  ${code(`<CancelPenalties>
  <CancelPenalty>
    <Deadline AbsoluteDeadline="${y}-04-29T10:00:00" OffsetTimeUnit="Hour" OffsetUnitMultiplier="48" OffsetDropTime="BeforeArrival"/>
    <AmountPercent Percent="100" Amount="135.00" CurrencyCode="${cur}"/>
  </CancelPenalty>
</CancelPenalties>`)}
  <p>Native XML: <code>Policies/CancellationPenalties/Penalty From HoursBefore Percent Amount</code>; JSON: <code>penalties</code>.</p>
  <h3>Prices in your currency</h3>
  <p>${Object.keys(agg.bookingRules?.currencies || {}).length
    ? `Besides ${cur}, you may ask for prices in ${Object.keys(agg.bookingRules!.currencies!).map(esc).join(', ')}: OTA <code>&lt;POS&gt;&lt;Source ISOCurrency="EUR"/&gt;&lt;/POS&gt;</code>, native <code>&lt;Currency&gt;</code>, JSON <code>"currency"</code>. Every amount in the answer is converted, the breakdown adds up exactly, and the rate used is returned (<code>TPA_Extensions/Conversion</code>). The booking is charged in the currency it was made in.`
    : `All prices are in ${cur}. Other currencies can be enabled on request.`} An unsupported currency is refused with <code>INVALID_REQUEST</code>.</p>
  <h3>Reconciliation</h3>
  <p>List your bookings by pick-up date to match them with your own records: native <code>ReservationList</code> (From, To, optional Status, Page, PageSize) or <code>GET ${esc(ep.rest)}/reservations?from=${y}-05-01&amp;to=${y}-05-31</code>. At most one year and 200 bookings per page.</p>`)}

${section(16, 'Support and monitoring', `
  <p>Every request you send is logged with its full request and response (keys, passwords and card numbers masked) for 30 days. When you contact support, quote the <code>X-Request-ID</code> of the call: we can see exactly what was sent and answered. Use <code>OTA_Ping</code> (or <code>GET /ping</code>) for your own health checks; it verifies the credentials without touching inventory.</p>`)}

${section(17, 'Certification', `
  <p>Before go-live we run, and you should run in the sandbox, these cases: authentication success and failure; location and vehicle-group lists; availability search; no-availability; quote and hold; expired offer; changed price; booking; duplicate prevention (same key twice); retrieval by both references; modification; cancellation and its fee; invalid location, date and vehicle group; vehicle and station details; tax, mileage and covers; optional cover pricing; promotion codes (valid and unknown); closed-station pick-up; webhook delivery and retry; rate-limit handling.</p>`)}

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
