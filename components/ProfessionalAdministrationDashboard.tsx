import React, { useState, useMemo } from 'react';

// Types
interface CompanyDetails {
  name: string;
  address: string;
  phone: string;
  email: string;
  website?: string;
  taxId?: string;
  vatNumber?: string;
  logoUrl?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
}

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  status: 'active' | 'inactive' | 'suspended';
  lastLogin?: Date;
  createdAt: Date;
}

interface Fleet {
  totalVehicles: number;
  availableVehicles: number;
  rentedVehicles: number;
  maintenanceVehicles: number;
}

interface ActivityLog {
  id: string;
  timestamp: Date;
  userId: string;
  userName: string;
  action: string;
  actionType: 'login' | 'logout' | 'create' | 'update' | 'delete' | 'system' | 'error' | 'security';
  details: string;
  ipAddress?: string;
  severity?: 'info' | 'warning' | 'error' | 'critical';
}

interface SystemMetrics {
  totalUsers: number;
  activeSessions: number;
  systemUptime: string;
  databaseSize: string;
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
  apiResponseTime: number;
}

interface ProfessionalAdministrationDashboardProps {
  companyDetails: CompanyDetails;
  onUpdateCompanyDetails: (details: CompanyDetails) => void;
  users: User[];
  fleet: Fleet;
  activityLog: ActivityLog[];
  systemSettings?: any;
  onUpdateSettings?: (settings: any) => void;
}

// Simple Icons
const CogIcon: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const ShieldCheckIcon: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
  </svg>
);

const UserIcon: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  </svg>
);

const UsersIcon: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
  </svg>
);

const CarIcon: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h8M3 10l1-3h16l1 3M3 10v6a2 2 0 002 2h2a2 2 0 002-2v-1m10 1v1a2 2 0 002 2h2a2 2 0 002-2v-6M7 16a2 2 0 100-4 2 2 0 000 4zm10 0a2 2 0 100-4 2 2 0 000 4z" />
  </svg>
);

const ChartBarIcon: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
);

const ClockIcon: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const DatabaseIcon: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
  </svg>
);

const ServerIcon: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
  </svg>
);

const BellIcon: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
  </svg>
);

const SaveIcon: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
  </svg>
);

const UploadIcon: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
  </svg>
);

const DownloadIcon: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
  </svg>
);

const TrashIcon: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);

const RefreshIcon: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);

const CheckCircleIcon: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const AlertIcon: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
  </svg>
);

const CloseIcon: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const PencilIcon: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
  </svg>
);

const DocumentIcon: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);

const CreditCardIcon: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
  </svg>
);

const CalendarIcon: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);

const PlusIcon: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
);

const ProfessionalAdministrationDashboard: React.FC<ProfessionalAdministrationDashboardProps> = ({
  companyDetails,
  onUpdateCompanyDetails,
  users,
  fleet,
  activityLog,
  systemSettings = {},
  onUpdateSettings = () => {},
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'company' | 'financial' | 'system' | 'activity'>('overview');
  const [editedCompanyDetails, setEditedCompanyDetails] = useState<CompanyDetails>(companyDetails);
  const [showNotification, setShowNotification] = useState<{ type: 'success' | 'error' | 'warning'; message: string } | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(companyDetails.logoUrl || null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['general']));

  // Financial Settings State
  const [financialSettings, setFinancialSettings] = useState({
    stripePublicKey: systemSettings.stripePublicKey || '',
    stripeSecretKey: systemSettings.stripeSecretKey || '',
    paypalClientId: systemSettings.paypalClientId || '',
    paypalSecret: systemSettings.paypalSecret || '',
    commissionRate: systemSettings.commissionRate || 10,
    lateFeePerDay: systemSettings.lateFeePerDay || 25,
    cancellationFee: systemSettings.cancellationFee || 50,
    depositPercentage: systemSettings.depositPercentage || 20,
    requireApproval: systemSettings.requireApproval || false,
    invoicePrefix: systemSettings.invoicePrefix || 'INV',
  });

  // System Settings State
  const [sysSettings, setSysSettings] = useState({
    databaseHost: systemSettings.databaseHost || 'localhost',
    databasePort: systemSettings.databasePort || '5432',
    databaseName: systemSettings.databaseName || 'carrental',
    apiBaseUrl: systemSettings.apiBaseUrl || 'http://localhost:8080/api',
    smtpHost: systemSettings.smtpHost || 'smtp.gmail.com',
    smtpPort: systemSettings.smtpPort || '587',
    smtpUser: systemSettings.smtpUser || '',
    smtpPassword: systemSettings.smtpPassword || '',
    smsGateway: systemSettings.smsGateway || 'twilio',
    smsApiKey: systemSettings.smsApiKey || '',
    backupSchedule: systemSettings.backupSchedule || 'daily',
    dataRetentionDays: systemSettings.dataRetentionDays || 365,
    enable2FA: systemSettings.enable2FA || true,
    sessionTimeout: systemSettings.sessionTimeout || 30,
    loggingLevel: systemSettings.loggingLevel || 'info',
  });

  // Activity Log Filters
  const [logFilters, setLogFilters] = useState({
    actionType: 'all',
    dateRange: 'today',
    searchTerm: '',
  });

  // System Metrics (simulated - in real app would come from backend)
  const systemMetrics: SystemMetrics = useMemo(() => ({
    totalUsers: users.length,
    activeSessions: users.filter(u => u.status === 'active').length,
    systemUptime: '99.9%',
    databaseSize: '2.4 GB',
    cpuUsage: 45,
    memoryUsage: 62,
    diskUsage: 38,
    apiResponseTime: 145,
  }), [users]);

  // Recent Activities
  const recentActivities = useMemo(() => {
    return activityLog.slice(0, 10).map(log => ({
      ...log,
      timeAgo: getTimeAgo(log.timestamp),
    }));
  }, [activityLog]);

  // Filtered Activity Log
  const filteredActivityLog = useMemo(() => {
    let filtered = [...activityLog];

    if (logFilters.actionType !== 'all') {
      filtered = filtered.filter(log => log.actionType === logFilters.actionType);
    }

    if (logFilters.searchTerm) {
      const term = logFilters.searchTerm.toLowerCase();
      filtered = filtered.filter(log =>
        log.userName.toLowerCase().includes(term) ||
        log.action.toLowerCase().includes(term) ||
        log.details.toLowerCase().includes(term)
      );
    }

    if (logFilters.dateRange === 'today') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      filtered = filtered.filter(log => new Date(log.timestamp) >= today);
    } else if (logFilters.dateRange === 'week') {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      filtered = filtered.filter(log => new Date(log.timestamp) >= weekAgo);
    }

    return filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [activityLog, logFilters]);

  // Critical Alerts
  const criticalAlerts = useMemo(() => {
    const alerts = [];

    if (systemMetrics.cpuUsage > 80) {
      alerts.push({ type: 'error', message: 'High CPU usage detected' });
    }
    if (systemMetrics.memoryUsage > 85) {
      alerts.push({ type: 'warning', message: 'Memory usage approaching limit' });
    }
    if (fleet.maintenanceVehicles > 5) {
      alerts.push({ type: 'warning', message: `${fleet.maintenanceVehicles} vehicles in maintenance` });
    }

    const failedLogins = activityLog.filter(log =>
      log.actionType === 'security' &&
      log.action.includes('failed') &&
      new Date(log.timestamp) > new Date(Date.now() - 24 * 60 * 60 * 1000)
    ).length;

    if (failedLogins > 10) {
      alerts.push({ type: 'error', message: `${failedLogins} failed login attempts in last 24h` });
    }

    return alerts;
  }, [systemMetrics, fleet, activityLog]);

  // Helper Functions
  function getTimeAgo(date: Date): string {
    const seconds = Math.floor((new Date().getTime() - new Date(date).getTime()) / 1000);

    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  }

  function toggleSection(section: string) {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  }

  // Handlers
  const handleSaveCompanyDetails = () => {
    onUpdateCompanyDetails(editedCompanyDetails);
    setShowNotification({ type: 'success', message: 'Company details saved successfully!' });
    setTimeout(() => setShowNotification(null), 3000);
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        setLogoPreview(result);
        setEditedCompanyDetails({ ...editedCompanyDetails, logoUrl: result });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveFinancialSettings = () => {
    onUpdateSettings({ ...systemSettings, ...financialSettings });
    setShowNotification({ type: 'success', message: 'Financial settings saved successfully!' });
    setTimeout(() => setShowNotification(null), 3000);
  };

  const handleSaveSystemSettings = () => {
    onUpdateSettings({ ...systemSettings, ...sysSettings });
    setShowNotification({ type: 'success', message: 'System settings saved successfully!' });
    setTimeout(() => setShowNotification(null), 3000);
  };

  const handleQuickAction = (action: string) => {
    setShowNotification({ type: 'success', message: `${action} initiated successfully!` });
    setTimeout(() => setShowNotification(null), 3000);
  };

  const handleExportLogs = () => {
    const csv = [
      ['Timestamp', 'User', 'Action Type', 'Action', 'Details', 'IP Address', 'Severity'],
      ...filteredActivityLog.map(log => [
        new Date(log.timestamp).toISOString(),
        log.userName,
        log.actionType,
        log.action,
        log.details,
        log.ipAddress || 'N/A',
        log.severity || 'info',
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `activity_log_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    setShowNotification({ type: 'success', message: 'Activity log exported successfully!' });
    setTimeout(() => setShowNotification(null), 3000);
  };

  const getSeverityColor = (severity?: string) => {
    switch (severity) {
      case 'critical': return 'text-red-600 bg-red-50';
      case 'error': return 'text-red-500 bg-red-50';
      case 'warning': return 'text-yellow-600 bg-yellow-50';
      default: return 'text-blue-600 bg-blue-50';
    }
  };

  const getActionTypeIcon = (type: string) => {
    switch (type) {
      case 'login': return <UserIcon className="w-4 h-4" />;
      case 'logout': return <UserIcon className="w-4 h-4" />;
      case 'create': return <PlusIcon className="w-4 h-4" />;
      case 'update': return <PencilIcon className="w-4 h-4" />;
      case 'delete': return <TrashIcon className="w-4 h-4" />;
      case 'security': return <ShieldCheckIcon className="w-4 h-4" />;
      case 'error': return <AlertIcon className="w-4 h-4" />;
      default: return <ClockIcon className="w-4 h-4" />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 via-blue-600 to-purple-600 text-white shadow-2xl">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="bg-white/20 backdrop-blur-lg p-4 rounded-2xl shadow-lg">
                <ShieldCheckIcon className="w-8 h-8" />
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight">Administration Dashboard</h1>
                <p className="text-blue-100 mt-1">System Control Center</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-right">
                <div className="text-sm text-blue-100">System Status</div>
                <div className="flex items-center space-x-2 mt-1">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                  <span className="font-semibold">Operational</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Notification */}
      {showNotification && (
        <div className={`fixed top-4 right-4 z-50 px-6 py-4 rounded-xl shadow-2xl transform transition-all duration-300 ${
          showNotification.type === 'success' ? 'bg-green-500' :
          showNotification.type === 'error' ? 'bg-red-500' :
          'bg-yellow-500'
        } text-white`}>
          <div className="flex items-center space-x-3">
            {showNotification.type === 'success' && <CheckCircleIcon className="w-6 h-6" />}
            {showNotification.type === 'error' && <AlertIcon className="w-6 h-6" />}
            {showNotification.type === 'warning' && <AlertIcon className="w-6 h-6" />}
            <span className="font-medium">{showNotification.message}</span>
            <button onClick={() => setShowNotification(null)} className="ml-4">
              <CloseIcon className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Tab Navigation */}
        <div className="bg-white rounded-2xl shadow-lg mb-8 p-2 flex space-x-2">
          {[
            { id: 'overview', label: 'Overview', icon: ChartBarIcon },
            { id: 'company', label: 'Company Settings', icon: CogIcon },
            { id: 'financial', label: 'Financial', icon: CreditCardIcon },
            { id: 'system', label: 'System Config', icon: ServerIcon },
            { id: 'activity', label: 'Activity Log', icon: ClockIcon },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex-1 flex items-center justify-center space-x-2 px-6 py-3 rounded-xl font-semibold transition-all duration-200 ${
                activeTab === tab.id
                  ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-lg'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <tab.icon className="w-5 h-5" />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-8">
            {/* Critical Alerts */}
            {criticalAlerts.length > 0 && (
              <div className="bg-white rounded-2xl shadow-lg p-6">
                <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
                  <BellIcon className="w-6 h-6 mr-2 text-red-500" />
                  Critical Alerts
                </h2>
                <div className="space-y-3">
                  {criticalAlerts.map((alert, index) => (
                    <div
                      key={index}
                      className={`flex items-center space-x-3 p-4 rounded-xl ${
                        alert.type === 'error' ? 'bg-red-50 border-l-4 border-red-500' :
                        'bg-yellow-50 border-l-4 border-yellow-500'
                      }`}
                    >
                      <AlertIcon className={`w-6 h-6 ${alert.type === 'error' ? 'text-red-500' : 'text-yellow-500'}`} />
                      <span className="font-medium text-gray-800">{alert.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* System Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl shadow-lg p-6 text-white">
                <div className="flex items-center justify-between mb-4">
                  <UsersIcon className="w-8 h-8 opacity-80" />
                  <div className="text-3xl font-bold">{systemMetrics.totalUsers}</div>
                </div>
                <div className="text-blue-100">Total Users</div>
                <div className="mt-2 text-sm text-blue-200">
                  {users.filter(u => u.status === 'active').length} active
                </div>
              </div>

              <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-2xl shadow-lg p-6 text-white">
                <div className="flex items-center justify-between mb-4">
                  <ClockIcon className="w-8 h-8 opacity-80" />
                  <div className="text-3xl font-bold">{systemMetrics.activeSessions}</div>
                </div>
                <div className="text-green-100">Active Sessions</div>
                <div className="mt-2 text-sm text-green-200">Real-time monitoring</div>
              </div>

              <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl shadow-lg p-6 text-white">
                <div className="flex items-center justify-between mb-4">
                  <ServerIcon className="w-8 h-8 opacity-80" />
                  <div className="text-3xl font-bold">{systemMetrics.systemUptime}</div>
                </div>
                <div className="text-purple-100">System Uptime</div>
                <div className="mt-2 text-sm text-purple-200">Last 30 days</div>
              </div>

              <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl shadow-lg p-6 text-white">
                <div className="flex items-center justify-between mb-4">
                  <DatabaseIcon className="w-8 h-8 opacity-80" />
                  <div className="text-3xl font-bold">{systemMetrics.databaseSize}</div>
                </div>
                <div className="text-orange-100">Database Size</div>
                <div className="mt-2 text-sm text-orange-200">Growing 0.2GB/month</div>
              </div>
            </div>

            {/* Performance Indicators */}
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center">
                <ChartBarIcon className="w-6 h-6 mr-2 text-indigo-600" />
                Real-time Performance
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-600">CPU Usage</span>
                    <span className="text-sm font-bold text-gray-800">{systemMetrics.cpuUsage}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div
                      className={`h-3 rounded-full transition-all duration-500 ${
                        systemMetrics.cpuUsage > 80 ? 'bg-red-500' :
                        systemMetrics.cpuUsage > 60 ? 'bg-yellow-500' :
                        'bg-green-500'
                      }`}
                      style={{ width: `${systemMetrics.cpuUsage}%` }}
                    ></div>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-600">Memory Usage</span>
                    <span className="text-sm font-bold text-gray-800">{systemMetrics.memoryUsage}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div
                      className={`h-3 rounded-full transition-all duration-500 ${
                        systemMetrics.memoryUsage > 80 ? 'bg-red-500' :
                        systemMetrics.memoryUsage > 60 ? 'bg-yellow-500' :
                        'bg-green-500'
                      }`}
                      style={{ width: `${systemMetrics.memoryUsage}%` }}
                    ></div>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-600">Disk Usage</span>
                    <span className="text-sm font-bold text-gray-800">{systemMetrics.diskUsage}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div
                      className={`h-3 rounded-full transition-all duration-500 ${
                        systemMetrics.diskUsage > 80 ? 'bg-red-500' :
                        systemMetrics.diskUsage > 60 ? 'bg-yellow-500' :
                        'bg-green-500'
                      }`}
                      style={{ width: `${systemMetrics.diskUsage}%` }}
                    ></div>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-6 border-t border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-gray-600">API Response Time</div>
                    <div className="text-2xl font-bold text-gray-800 mt-1">{systemMetrics.apiResponseTime}ms</div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <CheckCircleIcon className="w-6 h-6 text-green-500" />
                    <span className="text-sm font-medium text-green-600">Healthy</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center">
                <CogIcon className="w-6 h-6 mr-2 text-indigo-600" />
                Quick Actions
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Create User', icon: UserIcon, color: 'blue' },
                  { label: 'Add Vehicle', icon: CarIcon, color: 'green' },
                  { label: 'New Reservation', icon: CalendarIcon, color: 'purple' },
                  { label: 'Generate Invoice', icon: DocumentIcon, color: 'orange' },
                  { label: 'Import XML', icon: UploadIcon, color: 'indigo' },
                  { label: 'Backup Database', icon: DatabaseIcon, color: 'red' },
                  { label: 'Clear Cache', icon: TrashIcon, color: 'yellow' },
                  { label: 'System Diagnostics', icon: ServerIcon, color: 'pink' },
                ].map((action, index) => (
                  <button
                    key={index}
                    onClick={() => handleQuickAction(action.label)}
                    className={`p-4 rounded-xl border-2 border-${action.color}-200 bg-${action.color}-50 hover:bg-${action.color}-100 transition-all duration-200 group`}
                  >
                    <action.icon className={`w-6 h-6 text-${action.color}-600 mx-auto mb-2 group-hover:scale-110 transition-transform`} />
                    <div className={`text-sm font-medium text-${action.color}-700`}>{action.label}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Recent Activity */}
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center">
                <ClockIcon className="w-6 h-6 mr-2 text-indigo-600" />
                Recent System Activities
              </h2>
              <div className="space-y-3">
                {recentActivities.map((activity) => (
                  <div
                    key={activity.id}
                    className="flex items-center justify-between p-4 rounded-xl bg-gray-50 hover:bg-gray-100 transition-all duration-200"
                  >
                    <div className="flex items-center space-x-4">
                      <div className={`p-2 rounded-lg ${getSeverityColor(activity.severity)}`}>
                        {getActionTypeIcon(activity.actionType)}
                      </div>
                      <div>
                        <div className="font-medium text-gray-800">{activity.action}</div>
                        <div className="text-sm text-gray-600">{activity.userName} - {activity.details}</div>
                      </div>
                    </div>
                    <div className="text-sm text-gray-500">{activity.timeAgo}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Fleet Status */}
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center">
                <CarIcon className="w-6 h-6 mr-2 text-indigo-600" />
                Fleet Status
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-blue-50 rounded-xl">
                  <div className="text-3xl font-bold text-blue-600">{fleet.totalVehicles}</div>
                  <div className="text-sm text-gray-600 mt-1">Total Vehicles</div>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-xl">
                  <div className="text-3xl font-bold text-green-600">{fleet.availableVehicles}</div>
                  <div className="text-sm text-gray-600 mt-1">Available</div>
                </div>
                <div className="text-center p-4 bg-orange-50 rounded-xl">
                  <div className="text-3xl font-bold text-orange-600">{fleet.rentedVehicles}</div>
                  <div className="text-sm text-gray-600 mt-1">Rented</div>
                </div>
                <div className="text-center p-4 bg-red-50 rounded-xl">
                  <div className="text-3xl font-bold text-red-600">{fleet.maintenanceVehicles}</div>
                  <div className="text-sm text-gray-600 mt-1">Maintenance</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Company Settings Tab */}
        {activeTab === 'company' && (
          <div className="space-y-8">
            <div className="bg-white rounded-2xl shadow-lg p-8">
              <h2 className="text-2xl font-bold text-gray-800 mb-8 flex items-center">
                <CogIcon className="w-7 h-7 mr-3 text-indigo-600" />
                Company Information
              </h2>

              {/* Logo Upload */}
              <div className="mb-8 pb-8 border-b border-gray-200">
                <label className="block text-sm font-semibold text-gray-700 mb-3">Company Logo</label>
                <div className="flex items-center space-x-6">
                  {logoPreview ? (
                    <div className="w-32 h-32 rounded-xl border-2 border-gray-200 overflow-hidden bg-white shadow-lg">
                      <img src={logoPreview} alt="Logo" className="w-full h-full object-contain" />
                    </div>
                  ) : (
                    <div className="w-32 h-32 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center bg-gray-50">
                      <UploadIcon className="w-8 h-8 text-gray-400" />
                    </div>
                  )}
                  <div>
                    <label className="cursor-pointer bg-indigo-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-indigo-700 transition-colors inline-flex items-center space-x-2">
                      <UploadIcon className="w-5 h-5" />
                      <span>Upload Logo</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleLogoUpload}
                        className="hidden"
                      />
                    </label>
                    <p className="text-sm text-gray-500 mt-2">PNG, JPG up to 2MB</p>
                  </div>
                </div>
              </div>

              {/* Basic Information */}
              <div className="mb-6">
                <button
                  onClick={() => toggleSection('general')}
                  className="w-full flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
                >
                  <span className="font-semibold text-gray-800">General Information</span>
                  <span className="text-gray-500">{expandedSections.has('general') ? '−' : '+'}</span>
                </button>
                {expandedSections.has('general') && (
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Company Name</label>
                      <input
                        type="text"
                        value={editedCompanyDetails.name}
                        onChange={(e) => setEditedCompanyDetails({ ...editedCompanyDetails, name: e.target.value })}
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Email</label>
                      <input
                        type="email"
                        value={editedCompanyDetails.email}
                        onChange={(e) => setEditedCompanyDetails({ ...editedCompanyDetails, email: e.target.value })}
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Phone</label>
                      <input
                        type="tel"
                        value={editedCompanyDetails.phone}
                        onChange={(e) => setEditedCompanyDetails({ ...editedCompanyDetails, phone: e.target.value })}
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Website</label>
                      <input
                        type="url"
                        value={editedCompanyDetails.website || ''}
                        onChange={(e) => setEditedCompanyDetails({ ...editedCompanyDetails, website: e.target.value })}
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Address</label>
                      <input
                        type="text"
                        value={editedCompanyDetails.address}
                        onChange={(e) => setEditedCompanyDetails({ ...editedCompanyDetails, address: e.target.value })}
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">City</label>
                      <input
                        type="text"
                        value={editedCompanyDetails.city || ''}
                        onChange={(e) => setEditedCompanyDetails({ ...editedCompanyDetails, city: e.target.value })}
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">State/Province</label>
                      <input
                        type="text"
                        value={editedCompanyDetails.state || ''}
                        onChange={(e) => setEditedCompanyDetails({ ...editedCompanyDetails, state: e.target.value })}
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">ZIP/Postal Code</label>
                      <input
                        type="text"
                        value={editedCompanyDetails.zipCode || ''}
                        onChange={(e) => setEditedCompanyDetails({ ...editedCompanyDetails, zipCode: e.target.value })}
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Country</label>
                      <input
                        type="text"
                        value={editedCompanyDetails.country || ''}
                        onChange={(e) => setEditedCompanyDetails({ ...editedCompanyDetails, country: e.target.value })}
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Tax Information */}
              <div className="mb-6">
                <button
                  onClick={() => toggleSection('tax')}
                  className="w-full flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
                >
                  <span className="font-semibold text-gray-800">Tax Configuration</span>
                  <span className="text-gray-500">{expandedSections.has('tax') ? '−' : '+'}</span>
                </button>
                {expandedSections.has('tax') && (
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Tax ID</label>
                      <input
                        type="text"
                        value={editedCompanyDetails.taxId || ''}
                        onChange={(e) => setEditedCompanyDetails({ ...editedCompanyDetails, taxId: e.target.value })}
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">VAT Number</label>
                      <input
                        type="text"
                        value={editedCompanyDetails.vatNumber || ''}
                        onChange={(e) => setEditedCompanyDetails({ ...editedCompanyDetails, vatNumber: e.target.value })}
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end mt-8">
                <button
                  onClick={handleSaveCompanyDetails}
                  className="bg-gradient-to-r from-indigo-600 to-blue-600 text-white px-8 py-3 rounded-xl font-semibold hover:from-indigo-700 hover:to-blue-700 transition-all shadow-lg flex items-center space-x-2"
                >
                  <SaveIcon className="w-5 h-5" />
                  <span>Save Company Details</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Financial Settings Tab */}
        {activeTab === 'financial' && (
          <div className="space-y-8">
            <div className="bg-white rounded-2xl shadow-lg p-8">
              <h2 className="text-2xl font-bold text-gray-800 mb-8 flex items-center">
                <CreditCardIcon className="w-7 h-7 mr-3 text-indigo-600" />
                Financial Configuration
              </h2>

              {/* Payment Gateways */}
              <div className="mb-6">
                <button
                  onClick={() => toggleSection('payment')}
                  className="w-full flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
                >
                  <span className="font-semibold text-gray-800">Payment Gateway Settings</span>
                  <span className="text-gray-500">{expandedSections.has('payment') ? '−' : '+'}</span>
                </button>
                {expandedSections.has('payment') && (
                  <div className="mt-4 space-y-6">
                    <div className="p-6 bg-blue-50 rounded-xl border border-blue-200">
                      <h3 className="font-semibold text-gray-800 mb-4 flex items-center">
                        <CreditCardIcon className="w-5 h-5 mr-2 text-blue-600" />
                        Stripe Configuration
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-2">Public Key</label>
                          <input
                            type="text"
                            value={financialSettings.stripePublicKey}
                            onChange={(e) => setFinancialSettings({ ...financialSettings, stripePublicKey: e.target.value })}
                            placeholder="pk_live_..."
                            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-2">Secret Key</label>
                          <input
                            type="password"
                            value={financialSettings.stripeSecretKey}
                            onChange={(e) => setFinancialSettings({ ...financialSettings, stripeSecretKey: e.target.value })}
                            placeholder="sk_live_..."
                            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="p-6 bg-purple-50 rounded-xl border border-purple-200">
                      <h3 className="font-semibold text-gray-800 mb-4 flex items-center">
                        <CreditCardIcon className="w-5 h-5 mr-2 text-purple-600" />
                        PayPal Configuration
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-2">Client ID</label>
                          <input
                            type="text"
                            value={financialSettings.paypalClientId}
                            onChange={(e) => setFinancialSettings({ ...financialSettings, paypalClientId: e.target.value })}
                            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-2">Secret</label>
                          <input
                            type="password"
                            value={financialSettings.paypalSecret}
                            onChange={(e) => setFinancialSettings({ ...financialSettings, paypalSecret: e.target.value })}
                            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Pricing & Policies */}
              <div className="mb-6">
                <button
                  onClick={() => toggleSection('pricing')}
                  className="w-full flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
                >
                  <span className="font-semibold text-gray-800">Pricing & Policies</span>
                  <span className="text-gray-500">{expandedSections.has('pricing') ? '−' : '+'}</span>
                </button>
                {expandedSections.has('pricing') && (
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Commission Rate (%)</label>
                      <input
                        type="number"
                        value={financialSettings.commissionRate}
                        onChange={(e) => setFinancialSettings({ ...financialSettings, commissionRate: Number(e.target.value) })}
                        min="0"
                        max="100"
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Late Fee (per day)</label>
                      <input
                        type="number"
                        value={financialSettings.lateFeePerDay}
                        onChange={(e) => setFinancialSettings({ ...financialSettings, lateFeePerDay: Number(e.target.value) })}
                        min="0"
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Cancellation Fee</label>
                      <input
                        type="number"
                        value={financialSettings.cancellationFee}
                        onChange={(e) => setFinancialSettings({ ...financialSettings, cancellationFee: Number(e.target.value) })}
                        min="0"
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Security Deposit (%)</label>
                      <input
                        type="number"
                        value={financialSettings.depositPercentage}
                        onChange={(e) => setFinancialSettings({ ...financialSettings, depositPercentage: Number(e.target.value) })}
                        min="0"
                        max="100"
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Invoice Prefix</label>
                      <input
                        type="text"
                        value={financialSettings.invoicePrefix}
                        onChange={(e) => setFinancialSettings({ ...financialSettings, invoicePrefix: e.target.value })}
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                      />
                    </div>

                    <div className="flex items-center space-x-3 p-4 bg-gray-50 rounded-xl">
                      <input
                        type="checkbox"
                        id="requireApproval"
                        checked={financialSettings.requireApproval}
                        onChange={(e) => setFinancialSettings({ ...financialSettings, requireApproval: e.target.checked })}
                        className="w-5 h-5 text-indigo-600 rounded focus:ring-2 focus:ring-indigo-500"
                      />
                      <label htmlFor="requireApproval" className="font-medium text-gray-700">
                        Require Payment Approval
                      </label>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end mt-8">
                <button
                  onClick={handleSaveFinancialSettings}
                  className="bg-gradient-to-r from-indigo-600 to-blue-600 text-white px-8 py-3 rounded-xl font-semibold hover:from-indigo-700 hover:to-blue-700 transition-all shadow-lg flex items-center space-x-2"
                >
                  <SaveIcon className="w-5 h-5" />
                  <span>Save Financial Settings</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* System Configuration Tab */}
        {activeTab === 'system' && (
          <div className="space-y-8">
            <div className="bg-white rounded-2xl shadow-lg p-8">
              <h2 className="text-2xl font-bold text-gray-800 mb-8 flex items-center">
                <ServerIcon className="w-7 h-7 mr-3 text-indigo-600" />
                System Configuration
              </h2>

              {/* Database Settings */}
              <div className="mb-6">
                <button
                  onClick={() => toggleSection('database')}
                  className="w-full flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
                >
                  <span className="font-semibold text-gray-800">Database Configuration</span>
                  <span className="text-gray-500">{expandedSections.has('database') ? '−' : '+'}</span>
                </button>
                {expandedSections.has('database') && (
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Host</label>
                      <input
                        type="text"
                        value={sysSettings.databaseHost}
                        onChange={(e) => setSysSettings({ ...sysSettings, databaseHost: e.target.value })}
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Port</label>
                      <input
                        type="text"
                        value={sysSettings.databasePort}
                        onChange={(e) => setSysSettings({ ...sysSettings, databasePort: e.target.value })}
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Database Name</label>
                      <input
                        type="text"
                        value={sysSettings.databaseName}
                        onChange={(e) => setSysSettings({ ...sysSettings, databaseName: e.target.value })}
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Email Settings */}
              <div className="mb-6">
                <button
                  onClick={() => toggleSection('email')}
                  className="w-full flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
                >
                  <span className="font-semibold text-gray-800">Email Server (SMTP)</span>
                  <span className="text-gray-500">{expandedSections.has('email') ? '−' : '+'}</span>
                </button>
                {expandedSections.has('email') && (
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">SMTP Host</label>
                      <input
                        type="text"
                        value={sysSettings.smtpHost}
                        onChange={(e) => setSysSettings({ ...sysSettings, smtpHost: e.target.value })}
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">SMTP Port</label>
                      <input
                        type="text"
                        value={sysSettings.smtpPort}
                        onChange={(e) => setSysSettings({ ...sysSettings, smtpPort: e.target.value })}
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">SMTP User</label>
                      <input
                        type="email"
                        value={sysSettings.smtpUser}
                        onChange={(e) => setSysSettings({ ...sysSettings, smtpUser: e.target.value })}
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">SMTP Password</label>
                      <input
                        type="password"
                        value={sysSettings.smtpPassword}
                        onChange={(e) => setSysSettings({ ...sysSettings, smtpPassword: e.target.value })}
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Security Settings */}
              <div className="mb-6">
                <button
                  onClick={() => toggleSection('security')}
                  className="w-full flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
                >
                  <span className="font-semibold text-gray-800">Security Settings</span>
                  <span className="text-gray-500">{expandedSections.has('security') ? '−' : '+'}</span>
                </button>
                {expandedSections.has('security') && (
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="flex items-center space-x-3 p-4 bg-gray-50 rounded-xl">
                      <input
                        type="checkbox"
                        id="enable2FA"
                        checked={sysSettings.enable2FA}
                        onChange={(e) => setSysSettings({ ...sysSettings, enable2FA: e.target.checked })}
                        className="w-5 h-5 text-indigo-600 rounded focus:ring-2 focus:ring-indigo-500"
                      />
                      <label htmlFor="enable2FA" className="font-medium text-gray-700">
                        Enable Two-Factor Authentication
                      </label>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Session Timeout (minutes)</label>
                      <input
                        type="number"
                        value={sysSettings.sessionTimeout}
                        onChange={(e) => setSysSettings({ ...sysSettings, sessionTimeout: Number(e.target.value) })}
                        min="5"
                        max="120"
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Logging Level</label>
                      <select
                        value={sysSettings.loggingLevel}
                        onChange={(e) => setSysSettings({ ...sysSettings, loggingLevel: e.target.value })}
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                      >
                        <option value="debug">Debug</option>
                        <option value="info">Info</option>
                        <option value="warning">Warning</option>
                        <option value="error">Error</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Data Retention (days)</label>
                      <input
                        type="number"
                        value={sysSettings.dataRetentionDays}
                        onChange={(e) => setSysSettings({ ...sysSettings, dataRetentionDays: Number(e.target.value) })}
                        min="30"
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Backup Settings */}
              <div className="mb-6">
                <button
                  onClick={() => toggleSection('backup')}
                  className="w-full flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
                >
                  <span className="font-semibold text-gray-800">Backup & Maintenance</span>
                  <span className="text-gray-500">{expandedSections.has('backup') ? '−' : '+'}</span>
                </button>
                {expandedSections.has('backup') && (
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Backup Schedule</label>
                      <select
                        value={sysSettings.backupSchedule}
                        onChange={(e) => setSysSettings({ ...sysSettings, backupSchedule: e.target.value })}
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                      >
                        <option value="hourly">Hourly</option>
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">API Base URL</label>
                      <input
                        type="url"
                        value={sysSettings.apiBaseUrl}
                        onChange={(e) => setSysSettings({ ...sysSettings, apiBaseUrl: e.target.value })}
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end mt-8">
                <button
                  onClick={handleSaveSystemSettings}
                  className="bg-gradient-to-r from-indigo-600 to-blue-600 text-white px-8 py-3 rounded-xl font-semibold hover:from-indigo-700 hover:to-blue-700 transition-all shadow-lg flex items-center space-x-2"
                >
                  <SaveIcon className="w-5 h-5" />
                  <span>Save System Settings</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Activity Log Tab */}
        {activeTab === 'activity' && (
          <div className="space-y-8">
            <div className="bg-white rounded-2xl shadow-lg p-8">
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-2xl font-bold text-gray-800 flex items-center">
                  <ClockIcon className="w-7 h-7 mr-3 text-indigo-600" />
                  Activity Log
                </h2>
                <button
                  onClick={handleExportLogs}
                  className="bg-gradient-to-r from-green-600 to-green-700 text-white px-6 py-3 rounded-xl font-semibold hover:from-green-700 hover:to-green-800 transition-all shadow-lg flex items-center space-x-2"
                >
                  <DownloadIcon className="w-5 h-5" />
                  <span>Export Logs</span>
                </button>
              </div>

              {/* Filters */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6 p-6 bg-gray-50 rounded-xl">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Action Type</label>
                  <select
                    value={logFilters.actionType}
                    onChange={(e) => setLogFilters({ ...logFilters, actionType: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  >
                    <option value="all">All Actions</option>
                    <option value="login">Login</option>
                    <option value="logout">Logout</option>
                    <option value="create">Create</option>
                    <option value="update">Update</option>
                    <option value="delete">Delete</option>
                    <option value="system">System</option>
                    <option value="error">Error</option>
                    <option value="security">Security</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Date Range</label>
                  <select
                    value={logFilters.dateRange}
                    onChange={(e) => setLogFilters({ ...logFilters, dateRange: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  >
                    <option value="today">Today</option>
                    <option value="week">Last 7 Days</option>
                    <option value="month">Last 30 Days</option>
                    <option value="all">All Time</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Search</label>
                  <input
                    type="text"
                    value={logFilters.searchTerm}
                    onChange={(e) => setLogFilters({ ...logFilters, searchTerm: e.target.value })}
                    placeholder="Search user, action, details..."
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  />
                </div>
              </div>

              {/* Activity Table */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gradient-to-r from-indigo-600 to-blue-600 text-white">
                    <tr>
                      <th className="px-6 py-4 text-left text-sm font-semibold rounded-tl-xl">Timestamp</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold">User</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold">Type</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold">Action</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold">Details</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold">IP Address</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold rounded-tr-xl">Severity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredActivityLog.slice(0, 50).map((log, index) => (
                      <tr
                        key={log.id}
                        className={`hover:bg-gray-50 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}
                      >
                        <td className="px-6 py-4 text-sm text-gray-600 whitespace-nowrap">
                          {new Date(log.timestamp).toLocaleString()}
                        </td>
                        <td className="px-6 py-4 text-sm font-medium text-gray-800">{log.userName}</td>
                        <td className="px-6 py-4 text-sm">
                          <div className="flex items-center space-x-2">
                            {getActionTypeIcon(log.actionType)}
                            <span className="text-gray-700 capitalize">{log.actionType}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-800">{log.action}</td>
                        <td className="px-6 py-4 text-sm text-gray-600 max-w-xs truncate">{log.details}</td>
                        <td className="px-6 py-4 text-sm text-gray-600">{log.ipAddress || 'N/A'}</td>
                        <td className="px-6 py-4 text-sm">
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getSeverityColor(log.severity)}`}>
                            {(log.severity || 'info').toUpperCase()}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {filteredActivityLog.length === 0 && (
                <div className="text-center py-12">
                  <ClockIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500 font-medium">No activity logs found</p>
                </div>
              )}

              {filteredActivityLog.length > 50 && (
                <div className="mt-6 text-center text-sm text-gray-500">
                  Showing 50 of {filteredActivityLog.length} entries
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProfessionalAdministrationDashboard;
