import { Aggregator, AggregatorExtra, Fleet, RatePlan, RateTier, SippRate, StopSale, Vehicle } from '../types';

// ---------------------------------------------------------------------------
// Channel defaults
// ---------------------------------------------------------------------------

export const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'JOD', 'AED', 'SAR'];
export const DEFAULT_CURRENCY = 'USD';
export const OTA_NAMESPACE = 'http://www.opentravel.org/OTA/2003/05';
export const RATE_SHEET_NAMESPACE = 'urn:nct-rental:ratesheet:1.0';

export const channelCurrency = (agg: Aggregator) => agg.currency || DEFAULT_CURRENCY;
export const channelStatus = (agg: Aggregator) => agg.status || 'active';
export const channelEnvironment = (agg: Aggregator) => agg.connectionDetails?.environment || 'production';
export const channelVendorCode = (agg: Aggregator) => (agg.vendorCode || 'NCT').toUpperCase();
export const channelLocationCode = (agg: Aggregator) => (agg.locationCode || 'AMM').toUpperCase();

export const formatMoney = (amount: number | null | undefined, currency: string): string => {
  const value = Number(amount ?? 0);
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2 }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
};

// Infinity does not survive JSON, so an open-ended tier comes back as null.
export const isOpenEnded = (toDay: RateTier['toDay']) =>
  toDay === null || toDay === undefined || toDay === Infinity;

export const tierLabel = (tier: RateTier) =>
  isOpenEnded(tier.toDay) ? `${tier.fromDay ?? '?'}+ days` : `${tier.fromDay ?? '?'}–${tier.toDay} days`;

// ---------------------------------------------------------------------------
// ACRISS / SIPP codes
// ---------------------------------------------------------------------------

const ACRISS = [
  'MNEHCDIJSRFGPULWOX', // category
  'BCDWVLSTFJXPQZEMRHYNGK', // type
  'MNCABD', // transmission / drive
  'RNDQHIECLSABMFVZUX', // fuel / air-conditioning
];

export const isValidSippFormat = (code: string) => /^[A-Z]{4}$/.test(code);
export const isAcrissCode = (code: string) =>
  isValidSippFormat(code) && code.split('').every((ch, i) => ACRISS[i].includes(ch));

const sippTransmission = (code: string): 'Automatic' | 'Manual' =>
  'ABD'.includes(code.charAt(2)) ? 'Automatic' : 'Manual';
const sippAirCon = (code: string) => 'RDHECLAMVU'.includes(code.charAt(3));

export const vehiclesForSipp = (fleet: Fleet, sippCode: string): Vehicle[] =>
  (fleet || []).filter(v => (v.sippCode || '').toUpperCase() === sippCode.toUpperCase());

export const fleetSippCodes = (fleet: Fleet): string[] =>
  Array.from(new Set((fleet || []).map(v => (v.sippCode || '').toUpperCase()).filter(Boolean))).sort();

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const DAY_MS = 86400000;
const toUtc = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1);
};
const addDays = (iso: string, days: number) => new Date(toUtc(iso) + days * DAY_MS).toISOString().slice(0, 10);
export const todayIso = () => new Date().toISOString().slice(0, 10);

export const rentalDays = (pickUp: string, dropOff: string): number => {
  const ms = new Date(dropOff).getTime() - new Date(pickUp).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 1;
  // Industry convention: every started 24h block is a rental day.
  return Math.max(1, Math.ceil(ms / DAY_MS));
};

const rangesOverlap = (aStart: string, aEnd: string, bStart: string, bEnd: string) =>
  aStart <= bEnd && bStart <= aEnd;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type IssueLevel = 'error' | 'warning' | 'info';
export type IssueArea = 'Connection' | 'Rates' | 'Fleet' | 'Extras' | 'Terms';

export interface ValidationIssue {
  level: IssueLevel;
  area: IssueArea;
  message: string;
}

export interface ValidationResult {
  issues: ValidationIssue[];
  errors: number;
  warnings: number;
  score: number; // 0..100
  canPublish: boolean;
}

const sortedTiers = (rate: SippRate) =>
  [...(rate.tiers || [])].sort((a, b) => (a.fromDay ?? 0) - (b.fromDay ?? 0));

const validateTiers = (planName: string, rate: SippRate, push: (l: IssueLevel, a: IssueArea, m: string) => void) => {
  const where = `${planName} / ${rate.sippCode}`;
  const tiers = sortedTiers(rate);
  if (tiers.length === 0) {
    push('error', 'Rates', `${where}: no length-of-rental tiers defined.`);
    return;
  }
  tiers.forEach(t => {
    if (t.dailyPrice === null || t.dailyPrice === undefined || !(Number(t.dailyPrice) > 0)) {
      push('error', 'Rates', `${where}: tier ${tierLabel(t)} has no valid daily price.`);
    }
    if (t.fromDay === null || t.fromDay === undefined || t.fromDay < 1) {
      push('error', 'Rates', `${where}: a tier is missing its "from" day.`);
    } else if (!isOpenEnded(t.toDay) && (t.toDay as number) < t.fromDay) {
      push('error', 'Rates', `${where}: tier ${tierLabel(t)} ends before it starts.`);
    }
  });
  if ((tiers[0].fromDay ?? 1) > 1) {
    push('warning', 'Rates', `${where}: rentals shorter than ${tiers[0].fromDay} days cannot be priced.`);
  }
  for (let i = 1; i < tiers.length; i++) {
    const prev = tiers[i - 1];
    const cur = tiers[i];
    if (isOpenEnded(prev.toDay)) {
      push('error', 'Rates', `${where}: tier ${tierLabel(cur)} comes after an open-ended tier.`);
      continue;
    }
    const prevEnd = prev.toDay as number;
    const curStart = cur.fromDay ?? 0;
    if (curStart <= prevEnd) push('error', 'Rates', `${where}: tiers ${tierLabel(prev)} and ${tierLabel(cur)} overlap.`);
    else if (curStart > prevEnd + 1) push('warning', 'Rates', `${where}: no price for ${prevEnd + 1}–${curStart - 1} day rentals.`);
  }
  const last = tiers[tiers.length - 1];
  if (!isOpenEnded(last.toDay)) {
    push('warning', 'Rates', `${where}: rentals longer than ${last.toDay} days cannot be priced (last tier is not open-ended).`);
  }
};

export const validateChannel = (agg: Aggregator, fleet: Fleet, today: string = todayIso()): ValidationResult => {
  const issues: ValidationIssue[] = [];
  const push = (level: IssueLevel, area: IssueArea, message: string) => issues.push({ level, area, message });
  const conn = agg.connectionDetails || { apiUrl: '', username: '', apiKey: '' };
  const env = channelEnvironment(agg);

  // Connection
  if (!conn.apiUrl) push('warning', 'Connection', 'Endpoint URL is not set.');
  else {
    let url: URL | null = null;
    try { url = new URL(conn.apiUrl); } catch { push('error', 'Connection', 'Endpoint URL is not a valid URL.'); }
    if (url && url.protocol !== 'https:') {
      push(env === 'production' ? 'error' : 'warning', 'Connection', 'Endpoint must use HTTPS to protect credentials.');
    }
  }
  if (!conn.username) push('warning', 'Connection', 'Username / channel ID is not set.');
  if (!conn.apiKey) push('warning', 'Connection', 'API key / secret is not set.');
  if (!agg.vendorCode) push('info', 'Connection', 'Supplier (vendor) code not set — "NCT" will be used in XML.');
  if (!agg.locationCode) push('info', 'Connection', 'Location code not set — "AMM" will be used in XML.');
  if (!agg.feedKeyHash) {
    // Without a push endpoint the partner has no way to get rates at all.
    push(conn.apiUrl ? 'info' : 'warning', 'Connection', 'No partner feed key — the partner cannot pull rates over XML.');
  }

  // Rate periods
  const plans = [...(agg.currentRatePlans || [])].sort((a, b) => a.startDate.localeCompare(b.startDate));
  if (plans.length === 0) {
    push('error', 'Rates', 'No rate periods defined — the channel has nothing to sell.');
  }
  plans.forEach(p => {
    if (!p.startDate || !p.endDate) push('error', 'Rates', `${p.name}: start and end dates are required.`);
    else if (p.startDate > p.endDate) push('error', 'Rates', `${p.name}: start date is after end date.`);
    if (!p.sippRates || p.sippRates.length === 0) push('warning', 'Rates', `${p.name}: no vehicle groups are priced.`);
    const seen = new Set<string>();
    (p.sippRates || []).forEach(r => {
      const code = (r.sippCode || '').toUpperCase();
      if (!isValidSippFormat(code)) push('error', 'Rates', `${p.name}: "${r.sippCode || '(empty)'}" is not a 4-letter SIPP code.`);
      else if (!isAcrissCode(code)) push('warning', 'Rates', `${p.name}: ${code} is not a recognised ACRISS code.`);
      if (seen.has(code)) push('error', 'Rates', `${p.name}: ${code} is priced more than once.`);
      seen.add(code);
      if (code && fleet.length > 0 && vehiclesForSipp(fleet, code).length === 0) {
        push('warning', 'Fleet', `${p.name}: no vehicle in the fleet has SIPP code ${code}.`);
      }
      validateTiers(p.name, r, push);
    });
  });
  for (let i = 1; i < plans.length; i++) {
    const a = plans[i - 1];
    const b = plans[i];
    if (!a.endDate || !b.startDate) continue;
    if (b.startDate <= a.endDate) push('error', 'Rates', `"${a.name}" and "${b.name}" overlap — prices would be ambiguous.`);
    else if (b.startDate > addDays(a.endDate, 1)) {
      push('warning', 'Rates', `No rates between ${addDays(a.endDate, 1)} and ${addDays(b.startDate, -1)}.`);
    }
  }
  if (plans.length > 0) {
    const lastEnd = plans.reduce((max, p) => (p.endDate > max ? p.endDate : max), '');
    if (lastEnd < today) push('error', 'Rates', 'All rate periods are in the past.');
    else if (lastEnd < addDays(today, 90)) push('warning', 'Rates', `Rates end on ${lastEnd} — less than 90 days of availability loaded.`);
    if (!plans.some(p => p.startDate <= today && today <= p.endDate) && plans.some(p => p.startDate > today)) {
      push('warning', 'Rates', 'No rate period covers today.');
    }
  }

  // Fleet coverage
  const priced = new Set(plans.flatMap(p => (p.sippRates || []).map(r => (r.sippCode || '').toUpperCase())));
  fleetSippCodes(fleet).forEach(code => {
    if (!priced.has(code)) push('info', 'Fleet', `Fleet group ${code} is not offered on this channel.`);
  });

  // Extras
  (agg.extras || []).forEach(e => {
    if (!(Number(e.price) > 0)) push('warning', 'Extras', `${e.name}: price is zero — it will be sold for free.`);
  });

  // Terms
  if (!agg.termsAndConditions || agg.termsAndConditions.trim().length < 20) {
    push('warning', 'Terms', 'Terms & conditions are missing or very short.');
  }

  const errors = issues.filter(i => i.level === 'error').length;
  const warnings = issues.filter(i => i.level === 'warning').length;
  const score = Math.max(0, 100 - errors * 20 - warnings * 5);
  const order: Record<IssueLevel, number> = { error: 0, warning: 1, info: 2 };
  issues.sort((a, b) => order[a.level] - order[b.level]);
  return { issues, errors, warnings, score, canPublish: errors === 0 };
};

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

export const findPlanForDate = (plans: RatePlan[], date: string): RatePlan | undefined =>
  (plans || []).find(p => p.startDate <= date && date <= p.endDate);

export const findTier = (rate: SippRate, days: number): RateTier | undefined =>
  sortedTiers(rate).find(t => (t.fromDay ?? 1) <= days && (isOpenEnded(t.toDay) || days <= (t.toDay as number)));

export const isStoppedForSipp = (
  stopSales: StopSale[], fleet: Fleet, sippCode: string, pickUpDate: string, returnDate: string,
): StopSale | undefined => {
  const vehicles = vehiclesForSipp(fleet, sippCode);
  const relevant = (stopSales || []).filter(s => rangesOverlap(s.startDate, s.endDate, pickUpDate, returnDate));
  const categoryStop = relevant.find(s => s.type === 'category' && vehicles.length > 0 && vehicles.every(v => v.category === s.target));
  if (categoryStop) return categoryStop;
  if (vehicles.length > 0) {
    const stoppedIds = new Set(relevant.filter(s => s.type === 'vehicle').map(s => s.target));
    const categories = new Set(relevant.filter(s => s.type === 'category').map(s => s.target));
    const allStopped = vehicles.every(v => stoppedIds.has(v.id) || categories.has(v.category));
    if (allStopped) return relevant[0];
  }
  return undefined;
};

export interface QuoteRequest {
  pickUp: string; // YYYY-MM-DDTHH:mm
  dropOff: string;
  extraIds?: string[];
}

export interface QuoteLine {
  sippCode: string;
  model: string;
  transmission: 'Automatic' | 'Manual';
  airCon: boolean;
  status: 'Available' | 'OnRequest' | 'Closed';
  closedReason?: string;
  plan?: RatePlan;
  tier?: RateTier;
  days: number;
  dailyRate: number;
  baseTotal: number;
  extras: { extra: AggregatorExtra; total: number }[];
  total: number;
}

export const extraCharge = (extra: AggregatorExtra, days: number) => {
  const raw = Number(extra.price || 0) * days;
  return extra.maxPerRental && extra.maxPerRental > 0 ? Math.min(raw, extra.maxPerRental) : raw;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export const buildQuote = (agg: Aggregator, fleet: Fleet, stopSales: StopSale[], req: QuoteRequest): QuoteLine[] => {
  const days = rentalDays(req.pickUp, req.dropOff);
  const pickUpDate = req.pickUp.slice(0, 10);
  const returnDate = req.dropOff.slice(0, 10);
  const plan = findPlanForDate(agg.currentRatePlans || [], pickUpDate);
  if (!plan) return [];
  const chosenExtras = (agg.extras || []).filter(e => (req.extraIds || []).includes(e.id));

  return (plan.sippRates || []).map(rate => {
    const code = (rate.sippCode || '').toUpperCase();
    const vehicles = vehiclesForSipp(fleet, code);
    const tier = findTier(rate, days);
    const dailyRate = Number(tier?.dailyPrice || 0);
    const baseTotal = round2(dailyRate * days);
    const extras = chosenExtras.map(extra => ({ extra, total: round2(extraCharge(extra, days)) }));
    const stop = isStoppedForSipp(stopSales, fleet, code, pickUpDate, returnDate);
    let status: QuoteLine['status'] = vehicles.length > 0 ? 'Available' : 'OnRequest';
    let closedReason: string | undefined;
    if (stop) { status = 'Closed'; closedReason = stop.reason || 'Stop sale'; }
    if (!tier || dailyRate <= 0) { status = 'Closed'; closedReason = `No rate for ${days}-day rentals`; }
    return {
      sippCode: code,
      model: vehicles[0]?.modelName || code,
      transmission: (vehicles[0]?.transmission as 'Automatic' | 'Manual') || sippTransmission(code),
      airCon: sippAirCon(code),
      status,
      closedReason,
      plan,
      tier,
      days,
      dailyRate,
      baseTotal,
      extras,
      total: round2(baseTotal + extras.reduce((s, e) => s + e.total, 0)),
    };
  });
};

// ---------------------------------------------------------------------------
// XML
// ---------------------------------------------------------------------------

export const escapeXml = (value: unknown): string =>
  String(value ?? '')
    // strip characters that are illegal in XML 1.0
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const cdata = (text: string) => `<![CDATA[${(text || '').replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;

const attrs = (pairs: Record<string, string | number | boolean | undefined | null>) =>
  Object.entries(pairs)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => ` ${k}="${escapeXml(v)}"`)
    .join('');

const money = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

const echoToken = () => Math.random().toString(36).slice(2, 10).toUpperCase();

export interface XmlOptions {
  timestamp?: string;
  echo?: string;
  version?: number;
}

/** Full rate sheet for partners that ingest a rate file (seasons × SIPP × length of rental). */
export const generateRateSheetXml = (agg: Aggregator, stopSales: StopSale[], fleet: Fleet, opts: XmlOptions = {}): string => {
  const currency = channelCurrency(agg);
  const ts = opts.timestamp || new Date().toISOString();
  const plans = [...(agg.currentRatePlans || [])].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const out: string[] = [];
  out.push('<?xml version="1.0" encoding="UTF-8"?>');
  out.push(`<RateSheet xmlns="${RATE_SHEET_NAMESPACE}"${attrs({
    Supplier: channelVendorCode(agg),
    Channel: agg.channelCode || agg.name,
    Currency: currency,
    Environment: channelEnvironment(agg) === 'production' ? 'Production' : 'Test',
    Version: opts.version,
    GeneratedAt: ts,
  })}>`);
  out.push(`  <Location${attrs({ Code: channelLocationCode(agg) })}/>`);
  if (plans.length === 0) out.push('  <!-- No rate periods defined -->');
  out.push('  <Seasons>');
  plans.forEach(plan => {
    out.push(`    <Season${attrs({ Code: plan.id, Name: plan.name, Start: plan.startDate, End: plan.endDate })}>`);
    (plan.sippRates || []).forEach(rate => {
      const code = (rate.sippCode || '').toUpperCase();
      const vehicle = vehiclesForSipp(fleet, code)[0];
      out.push(`      <VehicleGroup${attrs({
        SIPP: code,
        Model: vehicle ? `${vehicle.modelName} or similar` : undefined,
        Transmission: vehicle?.transmission || sippTransmission(code),
        AirConditioning: sippAirCon(code),
      })}>`);
      sortedTiers(rate).forEach(t => {
        out.push(`        <Rate${attrs({
          MinDays: t.fromDay ?? 1,
          MaxDays: isOpenEnded(t.toDay) ? undefined : (t.toDay as number),
          OpenEnded: isOpenEnded(t.toDay) ? 'true' : undefined,
          DailyAmount: money(Number(t.dailyPrice || 0)),
        })}/>`);
      });
      out.push('      </VehicleGroup>');
    });
    out.push('    </Season>');
  });
  out.push('  </Seasons>');

  out.push('  <Extras>');
  (agg.extras || []).forEach(e => {
    out.push(`    <Extra${attrs({
      Code: e.otaEquipType || e.id,
      Name: e.name,
      DailyAmount: money(Number(e.price || 0)),
      MaxPerRental: e.maxPerRental && e.maxPerRental > 0 ? money(e.maxPerRental) : undefined,
    })}/>`);
  });
  out.push('  </Extras>');

  const activeStops = (stopSales || []).filter(s => s.endDate >= todayIso());
  out.push('  <StopSales>');
  activeStops.forEach(s => {
    const target = s.type === 'vehicle' ? (fleet.find(v => v.id === s.target)?.sippCode || s.target) : s.target;
    out.push(`    <StopSale${attrs({ Type: s.type === 'vehicle' ? 'Vehicle' : 'Category', Target: target, Start: s.startDate, End: s.endDate, Reason: s.reason })}/>`);
  });
  out.push('  </StopSales>');

  out.push(`  <Terms>${cdata(agg.termsAndConditions || '')}</Terms>`);
  out.push('</RateSheet>');
  return out.join('\n');
};

/** OTA 2003/05 vehicle availability & rates response for one search. */
export const generateVehAvailRateXml = (
  agg: Aggregator, fleet: Fleet, stopSales: StopSale[], req: QuoteRequest, opts: XmlOptions = {},
): string => {
  const currency = channelCurrency(agg);
  const ts = opts.timestamp || new Date().toISOString();
  const lines = buildQuote(agg, fleet, stopSales, req);
  const location = channelLocationCode(agg);
  const out: string[] = [];
  out.push('<?xml version="1.0" encoding="UTF-8"?>');
  out.push(`<OTA_VehAvailRateRS xmlns="${OTA_NAMESPACE}"${attrs({
    EchoToken: opts.echo || echoToken(),
    TimeStamp: ts,
    Target: channelEnvironment(agg) === 'production' ? 'Production' : 'Test',
    Version: '1.000',
  })}>`);
  out.push('  <Success/>');
  if (lines.length === 0) {
    out.push('  <Warnings>');
    out.push(`    <Warning Type="3" ShortText="${escapeXml(`No rate period covers ${req.pickUp.slice(0, 10)}`)}"/>`);
    out.push('  </Warnings>');
  }
  out.push('  <VehAvailRSCore>');
  out.push(`    <VehRentalCore${attrs({ PickUpDateTime: req.pickUp, ReturnDateTime: req.dropOff })}>`);
  out.push(`      <PickUpLocation${attrs({ LocationCode: location })}/>`);
  out.push(`      <ReturnLocation${attrs({ LocationCode: location })}/>`);
  out.push('    </VehRentalCore>');
  out.push('    <VehVendorAvails>');
  out.push('      <VehVendorAvail>');
  out.push(`        <Vendor${attrs({ Code: channelVendorCode(agg) })}>NCT Rental</Vendor>`);
  out.push('        <VehAvails>');
  lines.forEach(line => {
    out.push('          <VehAvail>');
    out.push(`            <VehAvailCore${attrs({ Status: line.status })}>`);
    out.push(`              <Vehicle${attrs({
      AirConditionInd: line.airCon,
      TransmissionType: line.transmission,
      Code: line.sippCode,
      CodeContext: 'SIPP',
    })}>`);
    out.push(`                <VehMakeModel${attrs({ Name: `${line.model} or similar`, Code: line.sippCode })}/>`);
    out.push('              </Vehicle>');
    if (line.status !== 'Closed') {
      out.push('              <RentalRate>');
      out.push('                <RateDistance Unlimited="true" DistUnitName="Km" VehiclePeriodUnitName="RentalPeriod"/>');
      out.push('                <VehicleCharges>');
      out.push(`                  <VehicleCharge${attrs({ Purpose: 1, TaxInclusive: true, IncludedInRate: false, Amount: money(line.baseTotal), CurrencyCode: currency })}>`);
      out.push(`                    <Calculation${attrs({ UnitCharge: money(line.dailyRate), UnitName: 'Day', Quantity: line.days })}/>`);
      out.push('                  </VehicleCharge>');
      out.push('                </VehicleCharges>');
      out.push(`                <RateQualifier${attrs({ RateQualifier: line.plan?.id, RatePeriod: 'Daily' })}/>`);
      out.push('              </RentalRate>');
      out.push(`              <TotalCharge${attrs({ RateTotalAmount: money(line.baseTotal), EstimatedTotalAmount: money(line.total), CurrencyCode: currency })}/>`);
      if (line.extras.length > 0) {
        out.push('              <PricedEquips>');
        line.extras.forEach(({ extra, total }) => {
          out.push('                <PricedEquip>');
          out.push(`                  <Equipment${attrs({ EquipType: extra.otaEquipType || extra.id, Quantity: 1 })}>`);
          out.push(`                    <Description>${escapeXml(extra.name)}</Description>`);
          out.push('                  </Equipment>');
          out.push(`                  <Charge${attrs({ Amount: money(total), CurrencyCode: currency, TaxInclusive: true, IncludedInRate: false })}>`);
          out.push(`                    <Calculation${attrs({ UnitCharge: money(Number(extra.price || 0)), UnitName: 'Day', Quantity: line.days })}/>`);
          out.push('                  </Charge>');
          out.push('                </PricedEquip>');
        });
        out.push('              </PricedEquips>');
      }
    } else if (line.closedReason) {
      out.push(`              <!-- ${escapeXml(line.closedReason).replace(/--/g, '- -')} -->`);
    }
    out.push('            </VehAvailCore>');
    out.push('          </VehAvail>');
  });
  out.push('        </VehAvails>');
  out.push('      </VehVendorAvail>');
  out.push('    </VehVendorAvails>');
  out.push('  </VehAvailRSCore>');
  out.push('</OTA_VehAvailRateRS>');
  return out.join('\n');
};

/** Returns null when the XML is well-formed, otherwise the parser's message. */
export const checkWellFormed = (xml: string): string | null => {
  if (typeof DOMParser === 'undefined') return null;
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const err = doc.getElementsByTagName('parsererror')[0];
  return err ? (err.textContent || 'XML is not well-formed').trim() : null;
};

/** Short, stable fingerprint (FNV-1a) used to identify a published rate sheet. */
export const fingerprint = (text: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0').toUpperCase();
};

// ---------------------------------------------------------------------------
// Publish state
// ---------------------------------------------------------------------------

const normalisePlans = (plans: RatePlan[]) =>
  JSON.stringify(
    [...(plans || [])]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(p => ({
        id: p.id, name: p.name, s: p.startDate, e: p.endDate,
        r: [...(p.sippRates || [])]
          .sort((a, b) => (a.sippCode || '').localeCompare(b.sippCode || ''))
          .map(r => ({ c: r.sippCode, t: sortedTiers(r).map(t => [t.fromDay, isOpenEnded(t.toDay) ? null : t.toDay, Number(t.dailyPrice)]) })),
      })),
  );

export const hasUnpublishedChanges = (agg: Aggregator): boolean => {
  const latest = (agg.ratePlanHistory || [])[0];
  if (!latest) return (agg.currentRatePlans || []).length > 0;
  return normalisePlans(latest.ratePlans) !== normalisePlans(agg.currentRatePlans || []);
};

export const nextVersion = (agg: Aggregator): number => {
  const history = agg.ratePlanHistory || [];
  const max = history.reduce((m, s, i) => Math.max(m, s.version ?? history.length - i), 0);
  return max + 1;
};

export const submissionVersion = (agg: Aggregator, index: number): number => {
  const history = agg.ratePlanHistory || [];
  return history[index]?.version ?? history.length - index;
};

/** Counts SIPP/tier prices that changed between two snapshots. */
export const diffPlans = (before: RatePlan[], after: RatePlan[]) => {
  const key = (p: RatePlan, r: SippRate, t: RateTier) =>
    `${p.id}|${(r.sippCode || '').toUpperCase()}|${t.fromDay}-${isOpenEnded(t.toDay) ? 'inf' : t.toDay}`;
  const index = (plans: RatePlan[]) => {
    const m = new Map<string, number>();
    (plans || []).forEach(p => (p.sippRates || []).forEach(r => (r.tiers || []).forEach(t => m.set(key(p, r, t), Number(t.dailyPrice || 0)))));
    return m;
  };
  const a = index(before);
  const b = index(after);
  let added = 0, removed = 0, increased = 0, decreased = 0;
  b.forEach((price, k) => {
    if (!a.has(k)) added++;
    else if (price > (a.get(k) as number)) increased++;
    else if (price < (a.get(k) as number)) decreased++;
  });
  a.forEach((_, k) => { if (!b.has(k)) removed++; });
  return { added, removed, increased, decreased, total: added + removed + increased + decreased };
};

/** Lowest daily price for a SIPP code in a period (used for the rate matrix). */
export const fromPrice = (plan: RatePlan, sippCode: string): number | null => {
  const rate = (plan.sippRates || []).find(r => (r.sippCode || '').toUpperCase() === sippCode);
  if (!rate) return null;
  const prices = (rate.tiers || []).map(t => Number(t.dailyPrice)).filter(n => n > 0);
  return prices.length ? Math.min(...prices) : null;
};

// ---------------------------------------------------------------------------
// Partner access (inbound XML API served by the backend under /ota/v1)
// ---------------------------------------------------------------------------

/** Code used in partner URLs — the channel code when set, else the internal id (matches the server). */
export const partnerUrlCode = (agg: Aggregator) => agg.channelCode || agg.id;

export const partnerEndpoints = (apiBase: string, agg: Aggregator) => {
  const base = `${apiBase.replace(/\/$/, '')}/ota/v1/${encodeURIComponent(partnerUrlCode(agg))}`;
  const root = apiBase.replace(/\/$/, '');
  const code = encodeURIComponent(partnerUrlCode(agg));
  return {
    availRate: `${base}/OTA_VehAvailRate`,
    rateSheet: `${base}/ratesheet`,
    ping: `${base}/ping`,
    // Booking API (same key)
    locSearch: `${base}/OTA_VehLocSearch`,
    vehRes: `${base}/OTA_VehRes`,
    retRes: `${base}/OTA_VehRetRes`,
    modify: `${base}/OTA_VehModify`,
    cancel: `${base}/OTA_VehCancel`,
    nativeXml: `${root}/xml/v1`,
    rest: `${root}/partner/v1/${code}`,
  };
};

/** 32 random bytes, base64url — shown to staff once and never stored in clear. */
export const generateFeedKey = (): string => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let bin = '';
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return `nct_${btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
};

export const sha256Hex = async (text: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
};

/** The channel as partners see it: rates from the last published version, not the draft. */
export const publishedView = (agg: Aggregator): Aggregator => ({
  ...agg,
  currentRatePlans: (agg.ratePlanHistory || [])[0]?.ratePlans || [],
});
