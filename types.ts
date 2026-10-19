// types.ts

export enum PaymentType {
  PREPAID = 'Prepaid',
  PAY_ON_ARRIVAL = 'Pay on Arrival',
}

export interface RentalSource {
  id: string;
  name: string;
  paymentType: PaymentType;
}

export interface RentalLocation {
  id: string;
  name: string;
  address: string;
}

export enum UserPermission {
  ACTION_ADMIN_MANAGE_RESERVATIONS = "ACTION_ADMIN_MANAGE_RESERVATIONS",
  // --- CORE VIEWS ---
  VIEW_HOME_DASHBOARD = 'VIEW_HOME_DASHBOARD',
  VIEW_RESERVATIONS = 'VIEW_RESERVATIONS',
  VIEW_TODAYS_RESERVATIONS = 'VIEW_TODAYS_RESERVATIONS',
  VIEW_FLEET_AVAILABILITY = 'VIEW_FLEET_AVAILABILITY',
  VIEW_INTERNAL_MESSAGES = 'VIEW_INTERNAL_MESSAGES',
  VIEW_MY_PROFILE = 'VIEW_MY_PROFILE', // For users to see their own profile
  VIEW_AGREEMENTS = 'VIEW_AGREEMENTS',
  VIEW_UNLISTED_AGREEMENTS = 'VIEW_UNLISTED_AGREEMENTS',
  VIEW_IMPORT_RESERVATIONS = 'VIEW_IMPORT_RESERVATIONS',

  // --- RESERVATION ACTIONS ---
  ACTION_RESERVATIONS_ADD = 'ACTION_RESERVATIONS_ADD',
  ACTION_RESERVATIONS_EDIT = 'ACTION_RESERVATIONS_EDIT',
  ACTION_RESERVATIONS_DELETE = 'ACTION_RESERVATIONS_DELETE',
  ACTION_RESERVATIONS_EXTEND = 'ACTION_RESERVATIONS_EXTEND',
  ACTION_RESERVATIONS_STATUS_CHANGE = 'ACTION_RESERVATIONS_STATUS_CHANGE',
  ACTION_VOUCHER_MANAGE = 'ACTION_VOUCHER_MANAGE',
  ACTION_RESERVATIONS_ASSIGN = 'ACTION_RESERVATIONS_ASSIGN',
  ACTION_RESERVATIONS_UPGRADE_VEHICLE = 'ACTION_RESERVATIONS_UPGRADE_VEHICLE',
  ACTION_RESERVATIONS_MANAGE_EXTRAS = 'ACTION_RESERVATIONS_MANAGE_EXTRAS',
  ACTION_AGREEMENT_WITHOUT_RESERVATION = 'ACTION_AGREEMENT_WITHOUT_RESERVATION',
  ACTION_UNLISTED_AGREEMENTS_LIST = 'ACTION_UNLISTED_AGREEMENTS_LIST',

  // --- REPORT VIEWS ---
  VIEW_REPORTS_YEARLY_SUMMARY = 'VIEW_REPORTS_YEARLY_SUMMARY',
  VIEW_REPORTS_SOURCE_PERFORMANCE = 'VIEW_REPORTS_SOURCE_PERFORMANCE',
  VIEW_REPORTS_INVOICE_GENERATION = 'VIEW_REPORTS_INVOICE_GENERATION',

  // --- FINANCIAL VIEWS ---
  VIEW_FINANCIALS_ACCOUNTING = 'VIEW_FINANCIALS_ACCOUNTING',
  VIEW_FINANCIALS_PAYMENT_APPROVALS = 'VIEW_FINANCIALS_PAYMENT_APPROVALS',
  VIEW_FINANCIALS_DEFERRED_PAYMENTS = 'VIEW_FINANCIALS_DEFERRED_PAYMENTS',
  VIEW_FINANCIALS_LATE_RETURNS = 'VIEW_FINANCIALS_LATE_RETURNS',
  
  // --- FINANCIAL ACTIONS ---
  ACTION_FINANCIALS_MANAGE_EXPENSES = 'ACTION_FINANCIALS_MANAGE_EXPENSES',
  ACTION_FINANCIALS_MANAGE_FRANCHISE_PAYMENTS = 'ACTION_FINANCIALS_MANAGE_FRANCHISE_PAYMENTS',
  ACTION_FINANCIALS_MANAGE_PAYMENT_APPROVALS = 'ACTION_FINANCIALS_MANAGE_PAYMENT_APPROVALS',
  ACTION_FINANCIALS_MANAGE_DEFERRED_PAYMENTS = 'ACTION_FINANCIALS_MANAGE_DEFERRED_PAYMENTS',
  ACTION_FINANCIALS_MANAGE_LATE_RETURNS = 'ACTION_FINANCIALS_MANAGE_LATE_RETURNS',
  
  // --- INCIDENT VIEWS & ACTIONS ---
  VIEW_TRAFFIC_TICKETS = 'VIEW_TRAFFIC_TICKETS',
  ACTION_TRAFFIC_TICKETS_MANAGE = 'ACTION_TRAFFIC_TICKETS_MANAGE',
  VIEW_VEHICLE_DAMAGES = 'VIEW_VEHICLE_DAMAGES',
  ACTION_VEHICLE_DAMAGES_MANAGE = 'ACTION_VEHICLE_DAMAGES_MANAGE',

  // --- ADMINISTRATION ---
  VIEW_ADMIN_PANEL = 'VIEW_ADMIN_PANEL', // To view the whole Admin section
  ACTION_ADMIN_MANAGE_USERS = 'ACTION_ADMIN_MANAGE_USERS',
  ACTION_ADMIN_MANAGE_FLEET = 'ACTION_ADMIN_MANAGE_FLEET',
  ACTION_ADMIN_MANAGE_SOURCES = 'ACTION_ADMIN_MANAGE_SOURCES',
  ACTION_ADMIN_MANAGE_EXTRAS = 'ACTION_ADMIN_MANAGE_EXTRAS',
  ACTION_ADMIN_MANAGE_LOCATIONS = 'ACTION_ADMIN_MANAGE_LOCATIONS',
  ACTION_ADMIN_MANAGE_COMPANY_DETAILS = 'ACTION_ADMIN_MANAGE_COMPANY_DETAILS',
  ACTION_ADMIN_MANAGE_YEARS = 'ACTION_ADMIN_MANAGE_YEARS',
  ACTION_ADMIN_DELETE_ALL_RESERVATIONS = 'ACTION_ADMIN_DELETE_ALL_RESERVATIONS',
  VIEW_SYSTEM_ACTIVITY_LOG = 'VIEW_SYSTEM_ACTIVITY_LOG',
  ACTION_ADMIN_MANAGE_EMAIL_SETTINGS = 'ACTION_ADMIN_MANAGE_EMAIL_SETTINGS',

  // --- AGGREGATOR SETUP ---
  VIEW_AGGREGATOR_SETUP = 'VIEW_AGGREGATOR_SETUP',
  ACTION_ADMIN_MANAGE_RATE_PLANS = 'ACTION_ADMIN_MANAGE_RATE_PLANS',
  ACTION_ADMIN_MANAGE_TERMS = 'ACTION_ADMIN_MANAGE_TERMS',
}


export enum UserStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

export enum ExpenseCategory {
  SALARIES = 'Salaries',
  RENT = 'Rent',
  UTILITIES = 'Utilities',
  MAINTENANCE = 'Maintenance',
  MARKETING = 'Marketing',
  OFFICE_SUPPLIES = 'Office Supplies',
  OTHER = 'Other',
}

export enum ReservationStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  CANCELLED = 'CANCELLED',
  NO_SHOW = 'NO_SHOW',
}

export enum TrafficTicketStatus {
  COLLECTED = 'COLLECTED',
  NOT_COLLECTED = 'NOT_COLLECTED',
}

export enum VehicleDamageStatus {
  COLLECTED = 'COLLECTED',
  NOT_COLLECTED = 'NOT_COLLECTED',
}

export interface ReservationExtra {
  name: string;
  dailyPrice: number;
  isComplementary: boolean;
}

export type CarView = 'front' | 'back' | 'left' | 'right';

export type DamageType = 'scratch' | 'dent' | 'chip' | 'crack' | 'scuff' | 'broken' | 'missing' | 'other';
export type DamageSeverity = 'minor' | 'moderate' | 'major';

export interface DamageMarker {
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  view: CarView;
  type?: DamageType;
  severity?: DamageSeverity;
  /** Panel / part, e.g. "Front bumper", "Driver door". */
  part?: string;
  size?: string;
  note?: string;
}

export interface UpgradeInfo {
  originalCarModel: string;
  upgradedCarModel: string;
  dailyUpgradePrice: number;
  totalUpgradeCost: number;
}

export interface ExtensionInfo {
  extensionDate: string;
  newEndDate: string;
  days: number;
  dailyRate: number;
  extras: ReservationExtra[];
  cost: number;
  paymentMethod: 'payNow' | 'payLater';
}

export interface LateReturnFee {
  feeAppliedDate: string;
  hoursLate: number;
  amount: number;
  isWaived: boolean;
  notes?: string;
  status: 'PENDING' | 'APPLIED' | 'WAIVED';
  resolvedBy?: string;
  resolvedDate?: string;
}

export interface CarExchange {
  exchangeDate: string;
  reason: string;

  // Old car check-in
  oldCarLicensePlate: string;
  checkinRenterSignature: string;
  checkinAgentSignature: string;
  checkinAgentName: string;
  checkinDamageMarkers?: DamageMarker[];
  checkinChecklist?: { [item: string]: boolean };
  checkinFuelLevel?: number;
  checkinKmIn?: number;

  // New car check-out
  newCarLicensePlate: string;
  checkoutRenterSignature: string;
  checkoutAgentSignature: string;
  checkoutAgentName: string;
  checkoutDamageMarkers?: DamageMarker[];
  checkoutChecklist?: { [item: string]: boolean };
  checkoutFuelLevel?: number;
  checkoutKmOut?: number;
}

export enum TransmissionType {
  AUTOMATIC = 'Automatic',
  MANUAL = 'Manual',
}

export interface Reservation {
  id: string;
  uploadBatchId: string;
  createdAt: string;
  updatedAt: string;
  storageYear: number;
  storageMonth: string;
  pickupDate: string;
  dropoffDate: string;
  customer: string;
  vehicle: string;
  invoice: string;
  status: ReservationStatus;
  notes: string;
  originalRowNumber?: number;
  originalFileName?: string;

  // Business fields (keeping for UI compatibility)
  personName: string; // Alias for customer
  bookingId: string; // Alias for invoice
  startDate: string; // Alias for pickupDate
  endDate: string;   // Alias for dropoffDate
  reservationVehicle?: string; // Alias for vehicle
  
  contactNumber?: string;
  source: string;
  bookingDate: string;
  carModel: string; // Assigned car
  sippCode?: string;
  licensePlate?: string;
  locationName?: string;
  amount: number;
  baseAmount?: number;
  isNew?: boolean;
  extras?: ReservationExtra[];
  upgradeInfo?: UpgradeInfo;
  voucherSubmitted?: boolean;
  dropOffCompleted?: boolean;
  customerEmail?: string;
  transmission?: TransmissionType;

  // Pickup fields
  pickupDateTime?: string;
  pickupRenterSignature?: string;
  pickupAgentSignature?: string;
  pickupAgentName?: string;
  pickupDamageMarkers?: DamageMarker[];
  pickupChecklist?: { [item: string]: boolean };
  pickupFuelLevel?: number;
  pickupKmOut?: number;
  pickupNotes?: string;

  // Drop-off fields
  dropOffDateTime?: string;
  dropOffRenterSignature?: string;
  dropOffAgentSignature?: string;
  dropOffAgentName?: string;
  dropOffDamageMarkers?: DamageMarker[];
  dropOffChecklist?: { [item: string]: boolean };
  dropOffFuelLevel?: number;
  dropOffKmIn?: number;
  dropOffNotes?: string;

  carExchanges?: CarExchange[];
  securityDeposit?: number;
  excess?: number;
  originalAmount?: number;
  extensionHistory?: ExtensionInfo[];
  unpaidExtensionAmount?: number;
  // Agreements opened for bookings that were not in the reservation list
  awaitingConfirmation?: boolean;
  unlistedCreatedBy?: string;
  unlistedCreatedAt?: string;
  confirmedBy?: string;
  confirmedAt?: string;
  /** Reference of the counter agreement that was linked into this reservation. */
  linkedAgreementRef?: string;
  agreementEmails?: { to: string; kind: 'checkout' | 'checkin' | 'exchange' | 'extension'; sentAt: string }[];
  returnCharges?: ReturnCharges;
  upgradeHistory?: { date: string; fromCar?: string; toCar: string; fee: number; pricing?: 'free' | 'daily' | 'flat'; dailyRate?: number; days?: number; by?: string }[];
  deferredPaymentCollectedOn?: string;
  pickupPaymentCollected?: boolean;
  paymentConfirmationPending?: boolean;
  paymentConfirmationRequestedBy?: string;
  createdBy?: string;
  lastEditedBy?: string;
  lateReturnFee?: LateReturnFee;

  authNumber?: string;
  finalAmountCharged?: number;
  cardNumber?: string;
  cardExpiry?: string;
  /** How the renter pays at the counter (shown on the agreement). */
  paymentMethod?: 'card' | 'cash' | 'bank_transfer' | 'prepaid';

  /** Main driver's documents, captured at check-out. */
  driver?: DriverDetails;
  additionalDrivers?: AdditionalDriver[];

  hasDateError?: boolean;
  dateErrorDetail?: string;
  
  assignedTo?: string; // User ID

  // Deprecated fields
  checklist?: { [item: string]: boolean };
  damageMarkers?: DamageMarker[];
  renterSignature?: string;
  agentSignature?: string;
  agentName?: string;
  importLockedYear?: number;
  importLockedMonth?: string;
}

export interface ImportReport {
  imported: number;
  skipped: number;
  duplicates: number;
  invalidRows: number;
  warnings: string[];
  errors: { row: number; details: string }[];
}

export interface TrafficTicket {
  id: string;
  bookingId: string;
  ticketDate: string;
  amount: number;
  details: string;
  status: TrafficTicketStatus;
  ticketDocument?: string; // base64 data URL
  ticketDocumentFilename?: string;
}

export interface VehicleDamage {
  id: string;
  bookingId: string;
  amount: number; // Cost of physical damage in JOD
  details: string;
  status: VehicleDamageStatus; // Status of amount collection
  policeReportNumber?: string;
  policeReportAmount?: number; // Fine or collected amount (e.g., excess) in JOD
  repairInvoice?: string; // base64 data URL
  repairInvoiceFilename?: string;
  policeReportFile?: string; // base64 data URL
  policeReportFilename?: string;
  damageImage?: string; // base64 data URL
  damageImageFilename?: string;
}

export interface DriverDetails {
  licenseNumber?: string;
  licenseCountry?: string;
  licenseExpiry?: string;   // YYYY-MM-DD
  dateOfBirth?: string;     // YYYY-MM-DD
  nationality?: string;
  idType?: 'passport' | 'national_id' | 'residence';
  idNumber?: string;
  address?: string;
}

export interface AdditionalDriver {
  name: string;
  licenseNumber?: string;
  dateOfBirth?: string;
}

export interface CompanyDetails {
  name: string;
  subName: string;
  address: string;
  phone: string;
  email: string;
  taxNumber: string;
  requirePaymentApproval?: boolean;
  website?: string;
  /** Terms and conditions printed on page 2 of the rental agreement. Empty = standard template. */
  agreementTerms?: string;
  /** Arabic terms printed beside the English ones; empty = standard Arabic terms. */
  agreementTermsAr?: string;
}

export type MonthlyReservations = Reservation[];

export interface YearData {
  [month: string]: MonthlyReservations;
}

export interface AppData {
  [year: number]: YearData;
}

export interface User {
  id: string;
  email: string; // Required for Firebase Auth
  fullName: string;
  username: string;
  password?: string;
  permissions: UserPermission[];
  nationalId: string;
  sscNumber?: string;
  hireDate: string;
  position: string;
  baseSalaryJOD: number;
  status: UserStatus;
  role?: 'ADMIN' | 'MANAGER' | 'AGENT'; // For migration purposes
  
  // User Activity & Access Control
  isOnline?: boolean;
  lastSeen?: string;
  deviceType?: 'desktop' | 'mobile';
  webAppAccess?: boolean;
  passwordLastChanged?: string;
}

export interface Expense {
  id: string;
  date: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  isRecurring?: boolean;
}

export interface Message {
  id: string;
  senderId: string;
  senderName: string;
  recipientId: string;
  subject: string;
  body: string;
  timestamp: string; // ISO string
  isRead: boolean;
}

export interface InvoiceReservationItem extends Reservation {
    subtotal: number;
    tax: number;
    total: number;
}

export interface InvoiceData {
    id: string;
    invoiceNumber: string;
    issueDate: string;
    billToName: string;
    startDate: string;
    endDate: string;
    reservations: InvoiceReservationItem[];
    totalSubtotal: number;
    totalTax: number;
    grandTotal: number;
    grandTotalInWords: string;
    generatedAt: string;
    // Professional invoicing (optional so older saved invoices still load)
    lines?: InvoiceLine[];
    status?: 'issued' | 'paid' | 'void';
    currency?: 'USD' | 'JOD' | 'EUR';
    taxRate?: number;
    taxMode?: 'included' | 'added' | 'none';
    terms?: 'receipt' | 'net7' | 'net15' | 'net30' | 'net45';
    dueDate?: string;
    billToEmail?: string;
    billToAddress?: string;
    billToTaxNumber?: string;
    poNumber?: string;
    notes?: string;
    paymentInstructions?: string;
    issuedBy?: string;
    paidAt?: string;
    paymentMethod?: string;
    paymentReference?: string;
    voidedAt?: string;
    voidReason?: string;
    emails?: { to: string; sentAt: string }[];
}

export interface InvoiceLine {
    reservationId: string;
    bookingId: string;
    renter: string;
    source: string;
    carModel?: string;
    startDate: string;
    endDate: string;
    days: number;
    subtotal: number;
    tax: number;
    total: number;
}

export interface AvailableExtra {
  id: string;
  name: string;
  defaultDailyPrice: number;
}

export interface FranchisePayment {
  id: string;
  year: number;
  month: string;
  amount: number;
  currency: 'USD' | 'JOD';
  datePaid: string;
  paidBy: string;
  referenceNote?: string;
  method?: 'card' | 'bank_transfer' | 'cash' | 'cheque';
  recordedAt?: string;
}

export interface ActivityLog {
  id: string;
  timestamp: string; // ISO string
  userId: string;
  userName: string;
  action: string; // e.g., 'USER_LOGIN', 'RESERVATION_CREATED', 'DATA_EXPORTED'
  details: string; // e.g., 'User admin logged in from desktop', 'Reservation for John Doe created'
}

export interface RateTier {
  id: string;
  fromDay: number | null;
  toDay: number | null | typeof Infinity;
  dailyPrice: number | null;
}

export interface SippRate {
    id: string;
    sippCode: string;
    tiers: RateTier[];
}

export interface RatePlan { // Represents a named "Period"
    id: string;
    name: string;
    startDate: string; // YYYY-MM-DD
    endDate: string; // YYYY-MM-DD
    sippRates: SippRate[];
}


export interface RatePlanSubmission {
  id: string;
  submittedAt: string; // ISO date string
  ratePlans: RatePlan[];
  // Optional publish metadata (older submissions may not have these)
  version?: number;
  publishedBy?: string;
  note?: string;
  currency?: string;
  checksum?: string; // fingerprint of the rate sheet XML that was published
  warningCount?: number;
}

export type ChannelEnvironment = 'test' | 'production';
export type ChannelStatus = 'active' | 'testing' | 'paused';

export interface AggregatorConnectionDetails {
    apiUrl: string;
    username: string;
    apiKey: string;
    environment?: ChannelEnvironment;
    timeoutSeconds?: number;
}

export interface AggregatorExtra {
    id: string; // Links to AvailableExtra id
    name: string;
    price: number;
    otaEquipType?: string; // OTA equipment code the partner expects (EquipType)
    maxPerRental?: number; // Optional cap on the rental charge, 0 / undefined = no cap
}

export interface Aggregator {
    id: string;
    name: string;
    connectionDetails: AggregatorConnectionDetails;
    currentRatePlans: RatePlan[];
    ratePlanHistory: RatePlanSubmission[];
    extras: AggregatorExtra[];
    termsAndConditions: string;
    // Channel manager settings (optional for backward compatibility)
    channelCode?: string;        // Short partner code, e.g. BKG
    vendorCode?: string;         // Our supplier code at the partner, e.g. NCT
    locationCode?: string;       // Pick-up location code sent in XML, e.g. AMM
    currency?: string;           // ISO 4217, defaults to USD
    status?: ChannelStatus;
    commissionPercent?: number;
    contactEmail?: string;
    // Inbound partner access: only the SHA-256 hash of the feed key is stored
    feedKeyHash?: string;
    feedKeyHint?: string;      // last 4 characters, for identification
    feedKeyCreatedAt?: string;
}

export interface StopSale {
    id: string;
    type: 'vehicle' | 'category';
    target: string; // vehicle.id or category name
    startDate: string;
    endDate: string;
    reason: string;
}

export interface AllData {
  reservations: AppData;
  sources: RentalSource[];
  fleet: Fleet;
  companyDetails: CompanyDetails;
  trafficTickets: TrafficTicket[];
  vehicleDamages: VehicleDamage[];
  users: User[];
  expenses: Expense[];
  rentalLocations: RentalLocation[];
  messages: Message[];
  invoices: InvoiceData[];
  availableExtras: AvailableExtra[];
  franchisePayments: FranchisePayment[];
  activityLog: ActivityLog[];
  aggregators: Aggregator[];
  stopSales: StopSale[];
  years: number[];
}

export interface Vehicle {
  id: string;
  modelName: string;
  licensePlate: string;
  registrationExpiry: string; // YYYY-MM-DD format
  category: string;
  securityDeposit: number;
  excess: number;
  sippCode?: string;
  transmission: TransmissionType;
  /** Photo of the actual car, uploaded to /api/media (stored as "/api/media/<id>"). */
  imageUrl?: string;
}

export type Fleet = Vehicle[];
export type FleetVehicle = Vehicle;

export type DateFilter = 'today_pickup' | 'today_return' | 'open_agreements' | 'upcoming_7_days' | 'upcoming_returns_7_days' | 'closed_past_7_days' | '';

export interface ReservationFilters {
  sourceFilter: string;
  carModelFilter: string;
  statusFilter: ReservationStatus | '';
  durationFilter: string;
  bookingIdSearch: string;
  dateFilter: DateFilter;
  voucherSubmitted?: boolean;
  dropOffCompleted?: boolean;
}

// --- Charges raised when the car comes back (damage, traffic tickets, fuel…) ---
export type ReturnChargeKind = 'damage' | 'ticket' | 'fuel' | 'cleaning' | 'late' | 'other';

export interface ReturnChargeItem {
  id: string;
  kind: ReturnChargeKind;
  description: string;
  amount: number;
  view?: CarView;            // side of the car, for damage
  markerNumber?: number;     // matches the numbered mark on the return damage diagram
  photos?: string[];         // compressed JPEG data URLs
  ticketId?: string;         // existing TrafficTicket this line settles
  ticketDate?: string;
  ticketReference?: string;
}

export interface ReturnCharges {
  items: ReturnChargeItem[];
  currency: 'JOD' | 'USD';
  settlement?: 'paid' | 'claim';
  paymentMethod?: 'cash' | 'card' | 'bank_transfer' | 'deposit';
  paymentReference?: string;
  dueDate?: string;
  documentNumber?: string;
  issuedAt?: string;
  customerSignature?: string;
  signedAt?: string;
  issuedBy?: string;
  emails?: { to: string; sentAt: string }[];
}
