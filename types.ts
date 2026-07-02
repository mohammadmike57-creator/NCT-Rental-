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

export interface DamageMarker {
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  view: CarView;
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
  personName: string;
  contactNumber?: string;
  bookingId: string;
  source: string;
  bookingDate: string;
  startDate: string;
  endDate: string;
  reservationVehicle?: string; // The vehicle requested/booked by the customer
  carModel: string; // The vehicle actually assigned from the fleet
  sippCode?: string;
  licensePlate?: string;
  locationName?: string;
  notes: string;
  status: ReservationStatus;
  amount: number;
  baseAmount?: number;
  isNew?: boolean;
  extras?: ReservationExtra[];
  upgradeInfo?: UpgradeInfo;
  voucherSubmitted?: boolean; // PICKUP completed
  dropOffCompleted?: boolean; // New
  customerEmail?: string;
  
  // Vehicle details specific to reservation
  transmission?: TransmissionType;

  // Pickup fields
  pickupDateTime?: string; // New
  pickupRenterSignature?: string; // from renterSignature
  pickupAgentSignature?: string;  // from agentSignature
  pickupAgentName?: string;       // from agentName
  pickupDamageMarkers?: DamageMarker[]; // from damageMarkers
  pickupChecklist?: { [item: string]: boolean }; // from checklist
  pickupFuelLevel?: number; // New, 0-8
  pickupKmOut?: number;
  pickupNotes?: string;

  // Drop-off fields
  dropOffDateTime?: string; // New
  dropOffRenterSignature?: string; // New
  dropOffAgentSignature?: string;  // New
  dropOffAgentName?: string;       // New
  dropOffDamageMarkers?: DamageMarker[]; // New
  dropOffChecklist?: { [item: string]: boolean }; // New
  dropOffFuelLevel?: number; // New, 0-8
  dropOffKmIn?: number;
  dropOffNotes?: string;

  carExchanges?: CarExchange[];
  securityDeposit?: number;
  excess?: number;
  originalAmount?: number;
  extensionHistory?: ExtensionInfo[];
  unpaidExtensionAmount?: number;
  deferredPaymentCollectedOn?: string;
  pickupPaymentCollected?: boolean;
  paymentConfirmationPending?: boolean;
  paymentConfirmationRequestedBy?: string;
  createdBy?: string;
  lastEditedBy?: string;
  lateReturnFee?: LateReturnFee;

  authNumber?: string;
  cardNumber?: string;
  cardExpiry?: string;

  hasDateError?: boolean;
  dateErrorDetail?: string;
  importLockedYear?: number;
  importLockedMonth?: string;
  
  assignedTo?: string; // User ID

  // Deprecated fields for migration
  checklist?: { [item: string]: boolean };
  damageMarkers?: DamageMarker[];
  renterSignature?: string;
  agentSignature?: string;
  agentName?: string;
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

export interface CompanyDetails {
  name: string;
  subName: string;
  address: string;
  phone: string;
  email: string;
  taxNumber: string;
  requirePaymentApproval?: boolean;
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
}

export interface AggregatorConnectionDetails {
    apiUrl: string;
    username: string;
    apiKey: string;
}

export interface AggregatorExtra {
    id: string; // Links to AvailableExtra id
    name: string;
    price: number;
}

export interface Aggregator {
    id: string;
    name: string;
    connectionDetails: AggregatorConnectionDetails;
    currentRatePlans: RatePlan[];
    ratePlanHistory: RatePlanSubmission[];
    extras: AggregatorExtra[];
    termsAndConditions: string;
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
}

export type Fleet = Vehicle[];

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
