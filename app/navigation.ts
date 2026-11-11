import React from 'react';
import { UserPermission } from '../types';
import { AccountingIcon, AlertIcon, BuildingOfficeIcon, CalendarCheckIcon, CalendarIcon, CarIcon, ChartBarIcon, ChartPieIcon, ClockIcon, CogIcon, CurrencyDollarIcon, DocumentReportIcon, GlobeAltIcon, HomeIcon, InboxIcon, MailIcon, PlusCircleIcon, ReceiptIcon, ShieldExclamationIcon, UploadIcon, UsersIcon, WrenchScrewdriverIcon } from '../components/icons';

export interface SidebarLink {
    name: string;
    icon: React.FC<any>;
    permission: UserPermission;
    badge?: number;
    /** Text badge (e.g. "3 new") shown instead of the number. */
    badgeText?: string;
    /** Runs instead of opening a page (e.g. opens a form). */
    action?: () => void;
}

/** Numbers shown on the menu and the one menu entry that opens a form instead of a page. */
export interface SidebarCounts {
  unlistedWaitingCount: number;
  unlistedNewCount: number;
  attentionCount: number;
  unreadCount: number;
  pendingApprovalsCount: number;
  openUnlistedAgreement: () => void;
}

/** The side menu, grouped by section. Each link opens the screen of the same name in App. */
export function sidebarLinks(c: SidebarCounts): Record<string, SidebarLink[]> {
  return {
    "Core Operations": [
        { name: 'Home', icon: HomeIcon, permission: UserPermission.VIEW_HOME_DASHBOARD },
        { name: 'Reservations', icon: CalendarIcon, permission: UserPermission.VIEW_RESERVATIONS },
        { name: 'Agreement', icon: DocumentReportIcon, permission: UserPermission.VIEW_AGREEMENTS },
        { name: 'Agreement for Unlisted Reservation', icon: PlusCircleIcon, permission: UserPermission.ACTION_AGREEMENT_WITHOUT_RESERVATION, action: c.openUnlistedAgreement },
        { name: 'Unlisted Agreements', icon: ShieldExclamationIcon, permission: UserPermission.VIEW_UNLISTED_AGREEMENTS, badge: c.unlistedWaitingCount, badgeText: c.unlistedNewCount ? `${c.unlistedNewCount} new` : undefined },
        { name: 'Reservation Add-ons', icon: ReceiptIcon, permission: UserPermission.VIEW_RESERVATION_ADDONS },
        { name: 'Today\'s Reservations', icon: CalendarCheckIcon, permission: UserPermission.VIEW_TODAYS_RESERVATIONS },
        { name: 'Needs Attention', icon: AlertIcon, permission: UserPermission.VIEW_NEEDS_ATTENTION, badge: c.attentionCount },
        { name: 'Internal Messages', icon: InboxIcon, permission: UserPermission.VIEW_INTERNAL_MESSAGES, badge: c.unreadCount },
        { name: 'Fleet Availability', icon: CarIcon, permission: UserPermission.VIEW_FLEET_AVAILABILITY },
    ],
    "Reports": [
        { name: 'Yearly Summary', icon: ChartBarIcon, permission: UserPermission.VIEW_REPORTS_YEARLY_SUMMARY },
        { name: 'Source Performance', icon: ChartPieIcon, permission: UserPermission.VIEW_REPORTS_SOURCE_PERFORMANCE },
        { name: 'Invoice Generation', icon: DocumentReportIcon, permission: UserPermission.VIEW_REPORTS_INVOICE_GENERATION },
    ],
    "Financials & Incidents": [
        { name: 'Accounting', icon: AccountingIcon, permission: UserPermission.VIEW_FINANCIALS_ACCOUNTING },
        { name: 'Payment Approvals', icon: CurrencyDollarIcon, permission: UserPermission.VIEW_FINANCIALS_PAYMENT_APPROVALS, badge: c.pendingApprovalsCount },
        { name: 'Deferred Payments', icon: CurrencyDollarIcon, permission: UserPermission.VIEW_FINANCIALS_DEFERRED_PAYMENTS },
        { name: 'Traffic Tickets', icon: ShieldExclamationIcon, permission: UserPermission.VIEW_TRAFFIC_TICKETS },
        { name: 'Vehicle Damages', icon: WrenchScrewdriverIcon, permission: UserPermission.VIEW_VEHICLE_DAMAGES },
    ],
    "Data Management": [
        { name: 'Import Reservations', icon: UploadIcon, permission: UserPermission.VIEW_IMPORT_RESERVATIONS },
    ],
    "OTA XML": [
        { name: 'OTA XML', icon: GlobeAltIcon, permission: UserPermission.VIEW_AGGREGATOR_SETUP },
    ],
    "Administration": [
        { name: 'User & Staff Management', icon: UsersIcon, permission: UserPermission.ACTION_ADMIN_MANAGE_USERS },
        { name: 'Fleet Management', icon: CarIcon, permission: UserPermission.ACTION_ADMIN_MANAGE_FLEET },
        { name: 'Website Sources', icon: CogIcon, permission: UserPermission.ACTION_ADMIN_MANAGE_SOURCES },
        { name: 'Manage Extras', icon: PlusCircleIcon, permission: UserPermission.ACTION_ADMIN_MANAGE_EXTRAS },
        { name: 'Manage Locations', icon: BuildingOfficeIcon, permission: UserPermission.ACTION_ADMIN_MANAGE_LOCATIONS },
        { name: 'Company Details', icon: BuildingOfficeIcon, permission: UserPermission.ACTION_ADMIN_MANAGE_COMPANY_DETAILS },
        { name: 'Agreement Terms', icon: DocumentReportIcon, permission: UserPermission.ACTION_ADMIN_MANAGE_COMPANY_DETAILS },
        { name: 'Email Settings', icon: MailIcon, permission: UserPermission.ACTION_ADMIN_MANAGE_EMAIL_SETTINGS },
        { name: 'Manage Years', icon: CogIcon, permission: UserPermission.ACTION_ADMIN_MANAGE_YEARS },
        { name: 'Activity Log', icon: ClockIcon, permission: UserPermission.VIEW_SYSTEM_ACTIVITY_LOG },
    ]
  };
}
