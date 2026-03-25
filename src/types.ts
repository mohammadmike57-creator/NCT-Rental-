// types.ts – full file with all required types

export interface Reservation {
  id: string;
  isNew?: boolean;
  personName: string;
  contactNumber: string;
  bookingId: string;
  source: string;
  bookingDate: string;
  startDate: string;
  endDate: string;
  carModel: string;
  notes: string;
  locationName: string;
  status: ReservationStatus;
  amount: number;
  originalAmount?: number;
  unpaidExtensionAmount?: number;
  paymentConfirmationPending?: boolean;
  paymentConfirmationRequestedBy?: string;
  deferredPaymentCollectedOn?: string;
  voucherSubmitted?: boolean;
  dropOffCompleted?: boolean;
  lastEditedBy?: string;
  createdBy?: string;
  customerEmail?: string;
  extensionHistory?: ExtensionInfo[];
  upgradeHistory?: UpgradeInfo[];
  extras?: Array<{ id: string; name: string; price: number; addedAt: string }>;
  selectedExtras?: string[]; // for UI
  [key: string]: any;
}

export interface ExtensionInfo {
  extensionDate: string;
  newEndDate: string;
  cost: number;
  paymentMethod: 'payNow' | 'payLater';
}

export interface UpgradeInfo {
  date: string;
  fromCar: string;
  toCar: string;
  fee: number;
}

export enum ReservationStatus {
  CONFIRMED = 'CONFIRMED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  NO_SHOW = 'NO_SHOW'
}

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE'
}

export enum UserPermission {
  VIEW_HOME_DASHBOARD = 'VIEW_HOME_DASHBOARD',
  VIEW_RESERVATIONS = 'VIEW_RESERVATIONS',
  VIEW_TODAYS_RESERVATIONS = 'VIEW_TODAYS_RESERVATIONS',
  VIEW_INTERNAL_MESSAGES = 'VIEW_INTERNAL_MESSAGES',
  VIEW_FLEET_AVAILABILITY = 'VIEW_FLEET_AVAILABILITY',
  VIEW_MY_PROFILE = 'VIEW_MY_PROFILE',
  ACTION_RESERVATIONS_ADD = 'ACTION_RESERVATIONS_ADD',
  ACTION_RESERVATIONS_EDIT = 'ACTION_RESERVATIONS_EDIT',
  ACTION_RESERVATIONS_DELETE = 'ACTION_RESERVATIONS_DELETE',
  ACTION_RESERVATIONS_EXTEND = 'ACTION_RESERVATIONS_EXTEND',
  ACTION_RESERVATIONS_UPGRADE = 'ACTION_RESERVATIONS_UPGRADE',
  ACTION_RESERVATIONS_VIEW_VOUCHER = 'ACTION_RESERVATIONS_VIEW_VOUCHER',
  VIEW_REPORTS_YEARLY_SUMMARY = 'VIEW_REPORTS_YEARLY_SUMMARY',
  VIEW_REPORTS_SOURCE_PERFORMANCE = 'VIEW_REPORTS_SOURCE_PERFORMANCE',
  VIEW_REPORTS_INVOICE_GENERATION = 'VIEW_REPORTS_INVOICE_GENERATION',
  VIEW_FINANCIALS_ACCOUNTING = 'VIEW_FINANCIALS_ACCOUNTING',
  VIEW_FINANCIALS_PAYMENT_APPROVALS = 'VIEW_FINANCIALS_PAYMENT_APPROVALS',
  VIEW_FINANCIALS_DEFERRED_PAYMENTS = 'VIEW_FINANCIALS_DEFERRED_PAYMENTS',
  VIEW_FINANCIALS_LATE_RETURNS = 'VIEW_FINANCIALS_LATE_RETURNS',
  VIEW_TRAFFIC_TICKETS = 'VIEW_TRAFFIC_TICKETS',
  VIEW_VEHICLE_DAMAGES = 'VIEW_VEHICLE_DAMAGES',
  VIEW_ADMIN_PANEL = 'VIEW_ADMIN_PANEL',
  ACTION_ADMIN_MANAGE_USERS = 'ACTION_ADMIN_MANAGE_USERS',
  ACTION_ADMIN_MANAGE_FLEET = 'ACTION_ADMIN_MANAGE_FLEET',
  ACTION_ADMIN_MANAGE_SOURCES = 'ACTION_ADMIN_MANAGE_SOURCES',
  ACTION_ADMIN_MANAGE_EXTRAS = 'ACTION_ADMIN_MANAGE_EXTRAS',
  ACTION_ADMIN_MANAGE_LOCATIONS = 'ACTION_ADMIN_MANAGE_LOCATIONS',
  ACTION_ADMIN_MANAGE_COMPANY_DETAILS = 'ACTION_ADMIN_MANAGE_COMPANY_DETAILS',
  ACTION_ADMIN_MANAGE_YEARS = 'ACTION_ADMIN_MANAGE_YEARS',
  VIEW_SYSTEM_ACTIVITY_LOG = 'VIEW_SYSTEM_ACTIVITY_LOG',
  VIEW_AGGREGATOR_SETUP = 'VIEW_AGGREGATOR_SETUP'
}

export interface User {
  id: string;
  email: string;
  fullName: string;
  username: string;
  password: string;
  permissions: UserPermission[];
  status: UserStatus;
  webAppAccess: boolean;
  nationalId?: string;
  hireDate?: string;
  position?: string;
  baseSalaryJOD?: number;
  isOnline?: boolean;
  lastSeen?: string;
  deviceType?: string;
}

export interface RentalSource {
  id: string;
  name: string;
  type: string;
}

export interface Fleet {
  id: string;
  modelName: string;
  licensePlate: string;
  status: string;
  dailyRate: number;
  year: number;
  notes?: string;
  imageUrl?: string;
  isActive: boolean;
}

export interface CompanyDetails {
  name: string;
  subName?: string;
  address: string;
  phone: string;
  email: string;
  taxNumber: string;
  requirePaymentApproval: boolean;
}

export interface TrafficTicket {
  id: string;
  ticketNumber: string;
  date: string;
  amount: number;
  vehicleId: string;
  reservationId?: string;
  notes?: string;
  status: string;
  paid: boolean;
  paidDate?: string;
}

export interface VehicleDamage {
  id: string;
  date: string;
  vehicleId: string;
  description: string;
  cost: number;
  reservationId?: string;
  repaired: boolean;
  repairedDate?: string;
  notes?: string;
}

export interface Expense {
  id: string;
  date: string;
  category: string;
  description: string;
  amount: number;
  paidBy: string;
  receipt?: string;
}

export interface Message {
  id: string;
  senderId: string;
  senderName: string;
  recipientId: string;
  subject: string;
  body: string;
  timestamp: string;
  isRead: boolean;
}

export interface RentalLocation {
  id: string;
  name: string;
  address: string;
  phone: string;
  email: string;
}

export interface InvoiceData {
  id: string;
  reservationId: string;
  invoiceNumber: string;
  date: string;
  dueDate: string;
  total: number;
  status: string;
  items: InvoiceItem[];
}

export interface InvoiceItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface AvailableExtra {
  id: string;
  name: string;
  pricePerDay: number;
  description?: string;
}

export interface FranchisePayment {
  id: string;
  year: number;
  month: string;
  amount: number;
  paid: boolean;
  paidDate?: string;
  notes?: string;
}

export interface ActivityLog {
  id: string;
  userId: string;
  action: string;
  details: string;
  timestamp: string;
}

export interface Aggregator {
  id: string;
  name: string;
  apiKey?: string;
  enabled: boolean;
  settings: any;
}

export interface StopSale {
  id: string;
  aggregatorId: string;
  startDate: string;
  endDate: string;
  reason: string;
  active: boolean;
}

export interface AppData {
  [year: number]: YearData;
}

export interface YearData {
  [month: string]: Reservation[];
}

export interface AllData {
  reservations: AppData;
  sources: RentalSource[];
  fleet: Fleet[];
  companyDetails: CompanyDetails;
  trafficTickets: TrafficTicket[];
  vehicleDamages: VehicleDamage[];
  users: User[];
  expenses: Expense[];
  messages: Message[];
  rentalLocations: RentalLocation[];
  invoices: InvoiceData[];
  availableExtras: AvailableExtra[];
  franchisePayments: FranchisePayment[];
  activityLog: ActivityLog[];
  aggregators: Aggregator[];
  stopSales: StopSale[];
  years: number[];
}

export interface ReservationFilters {
  sourceFilter?: string;
  carModelFilter?: string;
  statusFilter?: string;
  durationFilter?: string;
  bookingIdSearch?: string;
  dateFilter?: string;
  voucherSubmitted?: boolean;
  dropOffCompleted?: boolean;
}
