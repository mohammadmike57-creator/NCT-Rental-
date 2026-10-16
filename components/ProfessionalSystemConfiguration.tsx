import React, { useState, useMemo } from 'react';
import {
  CogIcon,
  ServerIcon,
  DatabaseIcon,
  ShieldCheckIcon,
  CloudIcon,
  BoltIcon,
  ChartBarIcon,
  CheckCircleIcon,
  AlertIcon,
  MailIcon,
  CreditCardIcon,
  PhoneIcon,
  GlobeAltIcon,
  LockClosedIcon,
  KeyIcon,
  UploadIcon,
  DownloadIcon,
  RefreshIcon,
  SaveIcon,
  PlusIcon,
  TrashIcon,
  EyeIcon,
  CodeBracketIcon
} from './icons';

interface SystemHealth {
  database: 'healthy' | 'warning' | 'error';
  api: 'healthy' | 'warning' | 'error';
  email: 'healthy' | 'warning' | 'error';
  storage: 'healthy' | 'warning' | 'error';
}

interface SystemInfo {
  frontendVersion: string;
  backendVersion: string;
  databaseVersion: string;
  environment: 'development' | 'staging' | 'production';
  lastDeployment: string;
  deployedBy: string;
  uptime: string;
}

interface EmailConfig {
  provider: 'smtp' | 'sendgrid' | 'aws-ses' | 'mailgun';
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  apiKey?: string;
  fromEmail: string;
  fromName: string;
  enabled: boolean;
}

interface PaymentConfig {
  provider: 'stripe' | 'paypal' | 'square';
  publicKey: string;
  secretKey: string;
  webhookSecret: string;
  enabled: boolean;
  testMode: boolean;
}

interface SMSConfig {
  provider: 'twilio' | 'nexmo' | 'aws-sns';
  accountSid?: string;
  authToken?: string;
  apiKey?: string;
  apiSecret?: string;
  fromNumber: string;
  enabled: boolean;
}

interface StorageConfig {
  provider: 'aws-s3' | 'azure-blob' | 'google-cloud';
  bucket: string;
  region: string;
  accessKey: string;
  secretKey: string;
  enabled: boolean;
}

interface OTAChannel {
  id: string;
  name: 'Booking.com' | 'Expedia' | 'Airbnb';
  apiKey: string;
  hotelId: string;
  enabled: boolean;
  syncEnabled: boolean;
  webhookUrl: string;
}

interface SecurityConfig {
  authMethod: 'local' | 'oauth' | 'saml' | 'ldap';
  twoFactorEnabled: boolean;
  sessionTimeout: number;
  ipWhitelist: string[];
  corsOrigins: string[];
  rateLimit: number;
  encryptionAlgorithm: string;
}

export const ProfessionalSystemConfiguration: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'overview' | 'settings' | 'integrations' | 'channels' | 'security' | 'database' | 'api'>('overview');
  const [showPassword, setShowPassword] = useState<Record<string, boolean>>({});
  const [testResults, setTestResults] = useState<Record<string, 'success' | 'error' | null>>({});

  // System Health State
  const [systemHealth, setSystemHealth] = useState<SystemHealth>({
    database: 'healthy',
    api: 'healthy',
    email: 'healthy',
    storage: 'healthy'
  });

  // System Info State
  const [systemInfo] = useState<SystemInfo>({
    frontendVersion: '2.5.1',
    backendVersion: '3.2.0',
    databaseVersion: 'PostgreSQL 14.5',
    environment: 'production',
    lastDeployment: '2026-10-10 14:30:00',
    deployedBy: 'admin@nct-rental.com',
    uptime: '45 days, 12 hours'
  });

  // Application Settings
  const [appSettings, setAppSettings] = useState({
    companyName: 'NCT Rental System',
    companyLogo: '',
    primaryColor: '#3B82F6',
    secondaryColor: '#10B981',
    language: 'en',
    timezone: 'America/New_York',
    currency: 'USD',
    dateFormat: 'MM/DD/YYYY',
    timeFormat: '12h',
    defaultRentalDuration: 1,
    defaultDeposit: 500,
    taxRate: 8.5,
    features: {
      onlineBooking: true,
      channelManager: true,
      analytics: true,
      multiCurrency: false,
      multilingual: false
    }
  });

  // Email Configuration
  const [emailConfig, setEmailConfig] = useState<EmailConfig>({
    provider: 'smtp',
    host: 'smtp.gmail.com',
    port: 587,
    username: 'noreply@nct-rental.com',
    password: '',
    fromEmail: 'noreply@nct-rental.com',
    fromName: 'NCT Rental System',
    enabled: true
  });

  // Payment Configuration
  const [paymentConfig, setPaymentConfig] = useState<PaymentConfig>({
    provider: 'stripe',
    publicKey: '',
    secretKey: '',
    webhookSecret: '',
    enabled: true,
    testMode: false
  });

  // SMS Configuration
  const [smsConfig, setSmsConfig] = useState<SMSConfig>({
    provider: 'twilio',
    accountSid: '',
    authToken: '',
    fromNumber: '',
    enabled: false
  });

  // Storage Configuration
  const [storageConfig, setStorageConfig] = useState<StorageConfig>({
    provider: 'aws-s3',
    bucket: 'nct-rental-uploads',
    region: 'us-east-1',
    accessKey: '',
    secretKey: '',
    enabled: true
  });

  // OTA Channels
  const [otaChannels, setOtaChannels] = useState<OTAChannel[]>([
    {
      id: '1',
      name: 'Booking.com',
      apiKey: '',
      hotelId: '',
      enabled: false,
      syncEnabled: true,
      webhookUrl: 'https://api.nct-rental.com/webhooks/booking'
    },
    {
      id: '2',
      name: 'Expedia',
      apiKey: '',
      hotelId: '',
      enabled: false,
      syncEnabled: true,
      webhookUrl: 'https://api.nct-rental.com/webhooks/expedia'
    },
    {
      id: '3',
      name: 'Airbnb',
      apiKey: '',
      hotelId: '',
      enabled: false,
      syncEnabled: true,
      webhookUrl: 'https://api.nct-rental.com/webhooks/airbnb'
    }
  ]);

  // Security Configuration
  const [securityConfig, setSecurityConfig] = useState<SecurityConfig>({
    authMethod: 'local',
    twoFactorEnabled: true,
    sessionTimeout: 3600,
    ipWhitelist: [],
    corsOrigins: ['https://nct-rental.com'],
    rateLimit: 100,
    encryptionAlgorithm: 'AES-256-GCM'
  });

  // Database Configuration
  const [databaseConfig, setDatabaseConfig] = useState({
    type: 'postgresql',
    host: 'localhost',
    port: 5432,
    database: 'nct_rental',
    username: 'postgres',
    password: '',
    poolSize: 20,
    maxConnections: 100,
    backupSchedule: '0 2 * * *',
    retentionDays: 30
  });

  // API Configuration
  const [apiConfig, setApiConfig] = useState({
    restEndpoint: 'https://api.nct-rental.com/v1',
    graphqlEndpoint: 'https://api.nct-rental.com/graphql',
    websocketEndpoint: 'wss://api.nct-rental.com/ws',
    apiVersion: 'v1',
    docsUrl: 'https://api.nct-rental.com/docs',
    rateLimits: {
      '/api/bookings': 50,
      '/api/vehicles': 100,
      '/api/customers': 50,
      '/api/reports': 20
    }
  });

  const testConnection = async (service: string) => {
    setTestResults({ ...testResults, [service]: null });
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1500));
    const success = Math.random() > 0.3;
    setTestResults({ ...testResults, [service]: success ? 'success' : 'error' });
  };

  const exportConfig = () => {
    const config = {
      appSettings,
      emailConfig,
      paymentConfig,
      smsConfig,
      storageConfig,
      otaChannels,
      securityConfig,
      databaseConfig,
      apiConfig,
      exportedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nct-rental-config-${systemInfo.environment}-${Date.now()}.json`;
    a.click();
  };

  const importConfig = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const config = JSON.parse(e.target?.result as string);
          if (config.appSettings) setAppSettings(config.appSettings);
          if (config.emailConfig) setEmailConfig(config.emailConfig);
          if (config.paymentConfig) setPaymentConfig(config.paymentConfig);
          if (config.smsConfig) setSmsConfig(config.smsConfig);
          if (config.storageConfig) setStorageConfig(config.storageConfig);
          if (config.otaChannels) setOtaChannels(config.otaChannels);
          if (config.securityConfig) setSecurityConfig(config.securityConfig);
          if (config.databaseConfig) setDatabaseConfig(config.databaseConfig);
          if (config.apiConfig) setApiConfig(config.apiConfig);
          alert('Configuration imported successfully!');
        } catch (error) {
          alert('Error importing configuration. Please check the file format.');
        }
      };
      reader.readAsText(file);
    }
  };

  const getStatusColor = (status: 'healthy' | 'warning' | 'error') => {
    switch (status) {
      case 'healthy': return 'text-green-600 bg-green-50';
      case 'warning': return 'text-yellow-600 bg-yellow-50';
      case 'error': return 'text-red-600 bg-red-50';
    }
  };

  const getStatusIcon = (status: 'healthy' | 'warning' | 'error') => {
    switch (status) {
      case 'healthy': return <CheckCircleIcon className="w-5 h-5" />;
      case 'warning': return <AlertIcon className="w-5 h-5" />;
      case 'error': return <AlertIcon className="w-5 h-5" />;
    }
  };

  const tabs = [
    { id: 'overview', label: 'System Overview', icon: <ServerIcon className="w-5 h-5" /> },
    { id: 'settings', label: 'Application Settings', icon: <CogIcon className="w-5 h-5" /> },
    { id: 'integrations', label: 'Integrations', icon: <BoltIcon className="w-5 h-5" /> },
    { id: 'channels', label: 'OTA Channels', icon: <GlobeAltIcon className="w-5 h-5" /> },
    { id: 'security', label: 'Security', icon: <ShieldCheckIcon className="w-5 h-5" /> },
    { id: 'database', label: 'Database', icon: <DatabaseIcon className="w-5 h-5" /> },
    { id: 'api', label: 'API Configuration', icon: <CodeBracketIcon className="w-5 h-5" /> }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-xl p-8 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg">
                <CogIcon className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">System Configuration</h1>
                <p className="text-gray-600 mt-1">Enterprise-grade system settings and integration management</p>
              </div>
            </div>
            <div className="flex space-x-3">
              <label className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold cursor-pointer transition-all duration-200 flex items-center space-x-2 shadow-lg hover:shadow-xl">
                <UploadIcon className="w-5 h-5" />
                <span>Import Config</span>
                <input type="file" accept=".json" onChange={importConfig} className="hidden" />
              </label>
              <button
                onClick={exportConfig}
                className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold transition-all duration-200 flex items-center space-x-2 shadow-lg hover:shadow-xl"
              >
                <DownloadIcon className="w-5 h-5" />
                <span>Export Config</span>
              </button>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="bg-white rounded-2xl shadow-xl mb-6 overflow-x-auto">
          <div className="flex border-b border-gray-200">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center space-x-2 px-6 py-4 font-semibold transition-all duration-200 whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {/* System Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">System Overview</h2>

              {/* System Health */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {Object.entries(systemHealth).map(([key, status]) => (
                  <div key={key} className={`p-6 rounded-xl border-2 ${getStatusColor(status)}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold capitalize">{key}</span>
                      {getStatusIcon(status)}
                    </div>
                    <div className="text-2xl font-bold capitalize">{status}</div>
                  </div>
                ))}
              </div>

              {/* System Information */}
              <div className="bg-gradient-to-br from-slate-50 to-blue-50 rounded-xl p-6">
                <h3 className="text-xl font-bold text-gray-900 mb-4">System Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-white p-4 rounded-lg">
                    <div className="text-sm text-gray-600">Frontend Version</div>
                    <div className="text-lg font-semibold text-gray-900">{systemInfo.frontendVersion}</div>
                  </div>
                  <div className="bg-white p-4 rounded-lg">
                    <div className="text-sm text-gray-600">Backend Version</div>
                    <div className="text-lg font-semibold text-gray-900">{systemInfo.backendVersion}</div>
                  </div>
                  <div className="bg-white p-4 rounded-lg">
                    <div className="text-sm text-gray-600">Database Version</div>
                    <div className="text-lg font-semibold text-gray-900">{systemInfo.databaseVersion}</div>
                  </div>
                  <div className="bg-white p-4 rounded-lg">
                    <div className="text-sm text-gray-600">Environment</div>
                    <div className="text-lg font-semibold">
                      <span className={`px-3 py-1 rounded-full text-sm ${
                        systemInfo.environment === 'production' ? 'bg-red-100 text-red-700' :
                        systemInfo.environment === 'staging' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-green-100 text-green-700'
                      }`}>
                        {systemInfo.environment.toUpperCase()}
                      </span>
                    </div>
                  </div>
                  <div className="bg-white p-4 rounded-lg">
                    <div className="text-sm text-gray-600">Last Deployment</div>
                    <div className="text-lg font-semibold text-gray-900">{systemInfo.lastDeployment}</div>
                  </div>
                  <div className="bg-white p-4 rounded-lg">
                    <div className="text-sm text-gray-600">Deployed By</div>
                    <div className="text-lg font-semibold text-gray-900">{systemInfo.deployedBy}</div>
                  </div>
                  <div className="bg-white p-4 rounded-lg md:col-span-2">
                    <div className="text-sm text-gray-600">System Uptime</div>
                    <div className="text-lg font-semibold text-gray-900">{systemInfo.uptime}</div>
                  </div>
                </div>
              </div>

              {/* Performance Metrics */}
              <div className="bg-gradient-to-br from-slate-50 to-blue-50 rounded-xl p-6">
                <h3 className="text-xl font-bold text-gray-900 mb-4">Performance Metrics</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-white p-4 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-gray-600">CPU Usage</span>
                      <ChartBarIcon className="w-5 h-5 text-blue-600" />
                    </div>
                    <div className="text-2xl font-bold text-gray-900">34%</div>
                    <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                      <div className="bg-blue-600 h-2 rounded-full" style={{ width: '34%' }}></div>
                    </div>
                  </div>
                  <div className="bg-white p-4 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-gray-600">Memory Usage</span>
                      <ChartBarIcon className="w-5 h-5 text-green-600" />
                    </div>
                    <div className="text-2xl font-bold text-gray-900">56%</div>
                    <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                      <div className="bg-green-600 h-2 rounded-full" style={{ width: '56%' }}></div>
                    </div>
                  </div>
                  <div className="bg-white p-4 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-gray-600">Disk Usage</span>
                      <ChartBarIcon className="w-5 h-5 text-yellow-600" />
                    </div>
                    <div className="text-2xl font-bold text-gray-900">72%</div>
                    <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                      <div className="bg-yellow-600 h-2 rounded-full" style={{ width: '72%' }}></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Application Settings Tab */}
          {activeTab === 'settings' && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Application Settings</h2>

              {/* Company Branding */}
              <div className="bg-gradient-to-br from-slate-50 to-blue-50 rounded-xl p-6">
                <h3 className="text-xl font-bold text-gray-900 mb-4">Company Branding</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Company Name</label>
                    <input
                      type="text"
                      value={appSettings.companyName}
                      onChange={(e) => setAppSettings({ ...appSettings, companyName: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Company Logo URL</label>
                    <input
                      type="text"
                      value={appSettings.companyLogo}
                      onChange={(e) => setAppSettings({ ...appSettings, companyLogo: e.target.value })}
                      placeholder="https://example.com/logo.png"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Primary Color</label>
                    <div className="flex space-x-2">
                      <input
                        type="color"
                        value={appSettings.primaryColor}
                        onChange={(e) => setAppSettings({ ...appSettings, primaryColor: e.target.value })}
                        className="h-10 w-20 rounded-lg cursor-pointer"
                      />
                      <input
                        type="text"
                        value={appSettings.primaryColor}
                        onChange={(e) => setAppSettings({ ...appSettings, primaryColor: e.target.value })}
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Secondary Color</label>
                    <div className="flex space-x-2">
                      <input
                        type="color"
                        value={appSettings.secondaryColor}
                        onChange={(e) => setAppSettings({ ...appSettings, secondaryColor: e.target.value })}
                        className="h-10 w-20 rounded-lg cursor-pointer"
                      />
                      <input
                        type="text"
                        value={appSettings.secondaryColor}
                        onChange={(e) => setAppSettings({ ...appSettings, secondaryColor: e.target.value })}
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Localization */}
              <div className="bg-gradient-to-br from-slate-50 to-blue-50 rounded-xl p-6">
                <h3 className="text-xl font-bold text-gray-900 mb-4">Localization</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Language</label>
                    <select
                      value={appSettings.language}
                      onChange={(e) => setAppSettings({ ...appSettings, language: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="en">English</option>
                      <option value="es">Spanish</option>
                      <option value="fr">French</option>
                      <option value="de">German</option>
                      <option value="zh">Chinese</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Timezone</label>
                    <select
                      value={appSettings.timezone}
                      onChange={(e) => setAppSettings({ ...appSettings, timezone: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="America/New_York">Eastern Time (ET)</option>
                      <option value="America/Chicago">Central Time (CT)</option>
                      <option value="America/Denver">Mountain Time (MT)</option>
                      <option value="America/Los_Angeles">Pacific Time (PT)</option>
                      <option value="Europe/London">GMT</option>
                      <option value="Europe/Paris">Central European Time</option>
                      <option value="Asia/Tokyo">Japan Time</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Currency</label>
                    <select
                      value={appSettings.currency}
                      onChange={(e) => setAppSettings({ ...appSettings, currency: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="USD">USD - US Dollar</option>
                      <option value="EUR">EUR - Euro</option>
                      <option value="GBP">GBP - British Pound</option>
                      <option value="JPY">JPY - Japanese Yen</option>
                      <option value="CNY">CNY - Chinese Yuan</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Date Format</label>
                    <select
                      value={appSettings.dateFormat}
                      onChange={(e) => setAppSettings({ ...appSettings, dateFormat: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                      <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                      <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Default Values */}
              <div className="bg-gradient-to-br from-slate-50 to-blue-50 rounded-xl p-6">
                <h3 className="text-xl font-bold text-gray-900 mb-4">Default Values</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Default Rental Duration (days)</label>
                    <input
                      type="number"
                      value={appSettings.defaultRentalDuration}
                      onChange={(e) => setAppSettings({ ...appSettings, defaultRentalDuration: parseInt(e.target.value) })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Default Deposit ($)</label>
                    <input
                      type="number"
                      value={appSettings.defaultDeposit}
                      onChange={(e) => setAppSettings({ ...appSettings, defaultDeposit: parseFloat(e.target.value) })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Tax Rate (%)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={appSettings.taxRate}
                      onChange={(e) => setAppSettings({ ...appSettings, taxRate: parseFloat(e.target.value) })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>

              {/* Feature Flags */}
              <div className="bg-gradient-to-br from-slate-50 to-blue-50 rounded-xl p-6">
                <h3 className="text-xl font-bold text-gray-900 mb-4">Feature Flags</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.entries(appSettings.features).map(([key, value]) => (
                    <label key={key} className="flex items-center space-x-3 p-4 bg-white rounded-lg cursor-pointer hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={value}
                        onChange={(e) => setAppSettings({
                          ...appSettings,
                          features: { ...appSettings.features, [key]: e.target.checked }
                        })}
                        className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="font-semibold text-gray-900 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex justify-end">
                <button className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-all duration-200 flex items-center space-x-2 shadow-lg hover:shadow-xl">
                  <SaveIcon className="w-5 h-5" />
                  <span>Save Settings</span>
                </button>
              </div>
            </div>
          )}

          {/* Integrations Tab */}
          {activeTab === 'integrations' && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Third-Party Integrations</h2>

              {/* Email Configuration */}
              <div className="bg-gradient-to-br from-slate-50 to-blue-50 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <MailIcon className="w-6 h-6 text-blue-600" />
                    <h3 className="text-xl font-bold text-gray-900">Email Provider</h3>
                  </div>
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={emailConfig.enabled}
                      onChange={(e) => setEmailConfig({ ...emailConfig, enabled: e.target.checked })}
                      className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="font-semibold text-gray-700">Enabled</span>
                  </label>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Provider</label>
                    <select
                      value={emailConfig.provider}
                      onChange={(e) => setEmailConfig({ ...emailConfig, provider: e.target.value as any })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="smtp">SMTP</option>
                      <option value="sendgrid">SendGrid</option>
                      <option value="aws-ses">AWS SES</option>
                      <option value="mailgun">Mailgun</option>
                    </select>
                  </div>
                  {emailConfig.provider === 'smtp' && (
                    <>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">SMTP Host</label>
                        <input
                          type="text"
                          value={emailConfig.host}
                          onChange={(e) => setEmailConfig({ ...emailConfig, host: e.target.value })}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">SMTP Port</label>
                        <input
                          type="number"
                          value={emailConfig.port}
                          onChange={(e) => setEmailConfig({ ...emailConfig, port: parseInt(e.target.value) })}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">Username</label>
                        <input
                          type="text"
                          value={emailConfig.username}
                          onChange={(e) => setEmailConfig({ ...emailConfig, username: e.target.value })}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">Password</label>
                        <div className="relative">
                          <input
                            type={showPassword['email'] ? 'text' : 'password'}
                            value={emailConfig.password}
                            onChange={(e) => setEmailConfig({ ...emailConfig, password: e.target.value })}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-10"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword({ ...showPassword, email: !showPassword['email'] })}
                            className="absolute right-2 top-2 text-gray-500 hover:text-gray-700"
                          >
                            <EyeIcon className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">From Email</label>
                    <input
                      type="email"
                      value={emailConfig.fromEmail}
                      onChange={(e) => setEmailConfig({ ...emailConfig, fromEmail: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">From Name</label>
                    <input
                      type="text"
                      value={emailConfig.fromName}
                      onChange={(e) => setEmailConfig({ ...emailConfig, fromName: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
                <div className="mt-4 flex justify-end">
                  <button
                    onClick={() => testConnection('email')}
                    className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-all duration-200 flex items-center space-x-2"
                  >
                    <RefreshIcon className={`w-5 h-5 ${testResults['email'] === null ? 'animate-spin' : ''}`} />
                    <span>Test Connection</span>
                  </button>
                  {testResults['email'] && (
                    <span className={`ml-3 px-4 py-2 rounded-lg font-semibold ${
                      testResults['email'] === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {testResults['email'] === 'success' ? 'Connection successful!' : 'Connection failed!'}
                    </span>
                  )}
                </div>
              </div>

              {/* Payment Gateway */}
              <div className="bg-gradient-to-br from-slate-50 to-blue-50 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <CreditCardIcon className="w-6 h-6 text-green-600" />
                    <h3 className="text-xl font-bold text-gray-900">Payment Gateway</h3>
                  </div>
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={paymentConfig.enabled}
                      onChange={(e) => setPaymentConfig({ ...paymentConfig, enabled: e.target.checked })}
                      className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="font-semibold text-gray-700">Enabled</span>
                  </label>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Provider</label>
                    <select
                      value={paymentConfig.provider}
                      onChange={(e) => setPaymentConfig({ ...paymentConfig, provider: e.target.value as any })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="stripe">Stripe</option>
                      <option value="paypal">PayPal</option>
                      <option value="square">Square</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      <div className="flex items-center space-x-2">
                        <span>Test Mode</span>
                        <input
                          type="checkbox"
                          checked={paymentConfig.testMode}
                          onChange={(e) => setPaymentConfig({ ...paymentConfig, testMode: e.target.checked })}
                          className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </label>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Public Key</label>
                    <input
                      type="text"
                      value={paymentConfig.publicKey}
                      onChange={(e) => setPaymentConfig({ ...paymentConfig, publicKey: e.target.value })}
                      placeholder="pk_test_..."
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Secret Key</label>
                    <div className="relative">
                      <input
                        type={showPassword['payment'] ? 'text' : 'password'}
                        value={paymentConfig.secretKey}
                        onChange={(e) => setPaymentConfig({ ...paymentConfig, secretKey: e.target.value })}
                        placeholder="sk_test_..."
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword({ ...showPassword, payment: !showPassword['payment'] })}
                        className="absolute right-2 top-2 text-gray-500 hover:text-gray-700"
                      >
                        <EyeIcon className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Webhook Secret</label>
                    <div className="relative">
                      <input
                        type={showPassword['webhook'] ? 'text' : 'password'}
                        value={paymentConfig.webhookSecret}
                        onChange={(e) => setPaymentConfig({ ...paymentConfig, webhookSecret: e.target.value })}
                        placeholder="whsec_..."
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword({ ...showPassword, webhook: !showPassword['webhook'] })}
                        className="absolute right-2 top-2 text-gray-500 hover:text-gray-700"
                      >
                        <EyeIcon className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex justify-end">
                  <button
                    onClick={() => testConnection('payment')}
                    className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-all duration-200 flex items-center space-x-2"
                  >
                    <RefreshIcon className={`w-5 h-5 ${testResults['payment'] === null ? 'animate-spin' : ''}`} />
                    <span>Test Connection</span>
                  </button>
                  {testResults['payment'] && (
                    <span className={`ml-3 px-4 py-2 rounded-lg font-semibold ${
                      testResults['payment'] === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {testResults['payment'] === 'success' ? 'Connection successful!' : 'Connection failed!'}
                    </span>
                  )}
                </div>
              </div>

              {/* SMS Provider */}
              <div className="bg-gradient-to-br from-slate-50 to-blue-50 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <PhoneIcon className="w-6 h-6 text-purple-600" />
                    <h3 className="text-xl font-bold text-gray-900">SMS Provider</h3>
                  </div>
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={smsConfig.enabled}
                      onChange={(e) => setSmsConfig({ ...smsConfig, enabled: e.target.checked })}
                      className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="font-semibold text-gray-700">Enabled</span>
                  </label>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Provider</label>
                    <select
                      value={smsConfig.provider}
                      onChange={(e) => setSmsConfig({ ...smsConfig, provider: e.target.value as any })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="twilio">Twilio</option>
                      <option value="nexmo">Nexmo</option>
                      <option value="aws-sns">AWS SNS</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">From Number</label>
                    <input
                      type="tel"
                      value={smsConfig.fromNumber}
                      onChange={(e) => setSmsConfig({ ...smsConfig, fromNumber: e.target.value })}
                      placeholder="+1234567890"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  {smsConfig.provider === 'twilio' && (
                    <>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">Account SID</label>
                        <input
                          type="text"
                          value={smsConfig.accountSid}
                          onChange={(e) => setSmsConfig({ ...smsConfig, accountSid: e.target.value })}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">Auth Token</label>
                        <div className="relative">
                          <input
                            type={showPassword['sms'] ? 'text' : 'password'}
                            value={smsConfig.authToken}
                            onChange={(e) => setSmsConfig({ ...smsConfig, authToken: e.target.value })}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-10"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword({ ...showPassword, sms: !showPassword['sms'] })}
                            className="absolute right-2 top-2 text-gray-500 hover:text-gray-700"
                          >
                            <EyeIcon className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
                <div className="mt-4 flex justify-end">
                  <button
                    onClick={() => testConnection('sms')}
                    className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-all duration-200 flex items-center space-x-2"
                  >
                    <RefreshIcon className={`w-5 h-5 ${testResults['sms'] === null ? 'animate-spin' : ''}`} />
                    <span>Test Connection</span>
                  </button>
                  {testResults['sms'] && (
                    <span className={`ml-3 px-4 py-2 rounded-lg font-semibold ${
                      testResults['sms'] === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {testResults['sms'] === 'success' ? 'Connection successful!' : 'Connection failed!'}
                    </span>
                  )}
                </div>
              </div>

              {/* Cloud Storage */}
              <div className="bg-gradient-to-br from-slate-50 to-blue-50 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <CloudIcon className="w-6 h-6 text-indigo-600" />
                    <h3 className="text-xl font-bold text-gray-900">Cloud Storage</h3>
                  </div>
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={storageConfig.enabled}
                      onChange={(e) => setStorageConfig({ ...storageConfig, enabled: e.target.checked })}
                      className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="font-semibold text-gray-700">Enabled</span>
                  </label>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Provider</label>
                    <select
                      value={storageConfig.provider}
                      onChange={(e) => setStorageConfig({ ...storageConfig, provider: e.target.value as any })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="aws-s3">AWS S3</option>
                      <option value="azure-blob">Azure Blob Storage</option>
                      <option value="google-cloud">Google Cloud Storage</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Bucket Name</label>
                    <input
                      type="text"
                      value={storageConfig.bucket}
                      onChange={(e) => setStorageConfig({ ...storageConfig, bucket: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Region</label>
                    <input
                      type="text"
                      value={storageConfig.region}
                      onChange={(e) => setStorageConfig({ ...storageConfig, region: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Access Key</label>
                    <input
                      type="text"
                      value={storageConfig.accessKey}
                      onChange={(e) => setStorageConfig({ ...storageConfig, accessKey: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Secret Key</label>
                    <div className="relative">
                      <input
                        type={showPassword['storage'] ? 'text' : 'password'}
                        value={storageConfig.secretKey}
                        onChange={(e) => setStorageConfig({ ...storageConfig, secretKey: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword({ ...showPassword, storage: !showPassword['storage'] })}
                        className="absolute right-2 top-2 text-gray-500 hover:text-gray-700"
                      >
                        <EyeIcon className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex justify-end">
                  <button
                    onClick={() => testConnection('storage')}
                    className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-all duration-200 flex items-center space-x-2"
                  >
                    <RefreshIcon className={`w-5 h-5 ${testResults['storage'] === null ? 'animate-spin' : ''}`} />
                    <span>Test Connection</span>
                  </button>
                  {testResults['storage'] && (
                    <span className={`ml-3 px-4 py-2 rounded-lg font-semibold ${
                      testResults['storage'] === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {testResults['storage'] === 'success' ? 'Connection successful!' : 'Connection failed!'}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex justify-end">
                <button className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-all duration-200 flex items-center space-x-2 shadow-lg hover:shadow-xl">
                  <SaveIcon className="w-5 h-5" />
                  <span>Save Integration Settings</span>
                </button>
              </div>
            </div>
          )}

          {/* OTA Channels Tab */}
          {activeTab === 'channels' && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">OTA Channel Configuration</h2>

              {otaChannels.map((channel) => (
                <div key={channel.id} className="bg-gradient-to-br from-slate-50 to-blue-50 rounded-xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <GlobeAltIcon className="w-6 h-6 text-blue-600" />
                      <h3 className="text-xl font-bold text-gray-900">{channel.name}</h3>
                    </div>
                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={channel.enabled}
                        onChange={(e) => setOtaChannels(otaChannels.map(c =>
                          c.id === channel.id ? { ...c, enabled: e.target.checked } : c
                        ))}
                        className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="font-semibold text-gray-700">Enabled</span>
                    </label>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">API Key</label>
                      <div className="relative">
                        <input
                          type={showPassword[channel.id] ? 'text' : 'password'}
                          value={channel.apiKey}
                          onChange={(e) => setOtaChannels(otaChannels.map(c =>
                            c.id === channel.id ? { ...c, apiKey: e.target.value } : c
                          ))}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword({ ...showPassword, [channel.id]: !showPassword[channel.id] })}
                          className="absolute right-2 top-2 text-gray-500 hover:text-gray-700"
                        >
                          <EyeIcon className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Hotel/Property ID</label>
                      <input
                        type="text"
                        value={channel.hotelId}
                        onChange={(e) => setOtaChannels(otaChannels.map(c =>
                          c.id === channel.id ? { ...c, hotelId: e.target.value } : c
                        ))}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Webhook URL</label>
                      <input
                        type="text"
                        value={channel.webhookUrl}
                        onChange={(e) => setOtaChannels(otaChannels.map(c =>
                          c.id === channel.id ? { ...c, webhookUrl: e.target.value } : c
                        ))}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={channel.syncEnabled}
                          onChange={(e) => setOtaChannels(otaChannels.map(c =>
                            c.id === channel.id ? { ...c, syncEnabled: e.target.checked } : c
                          ))}
                          className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                        />
                        <span className="font-semibold text-gray-700">Enable Automatic Sync</span>
                      </label>
                    </div>
                  </div>
                  <div className="mt-4 flex justify-end">
                    <button
                      onClick={() => testConnection(`channel-${channel.id}`)}
                      className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-all duration-200 flex items-center space-x-2"
                    >
                      <RefreshIcon className={`w-5 h-5 ${testResults[`channel-${channel.id}`] === null ? 'animate-spin' : ''}`} />
                      <span>Test Connection</span>
                    </button>
                    {testResults[`channel-${channel.id}`] && (
                      <span className={`ml-3 px-4 py-2 rounded-lg font-semibold ${
                        testResults[`channel-${channel.id}`] === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {testResults[`channel-${channel.id}`] === 'success' ? 'Connection successful!' : 'Connection failed!'}
                      </span>
                    )}
                  </div>
                </div>
              ))}

              <div className="flex justify-end">
                <button className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-all duration-200 flex items-center space-x-2 shadow-lg hover:shadow-xl">
                  <SaveIcon className="w-5 h-5" />
                  <span>Save Channel Settings</span>
                </button>
              </div>
            </div>
          )}

          {/* Security Tab */}
          {activeTab === 'security' && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Security Configuration</h2>

              {/* Authentication */}
              <div className="bg-gradient-to-br from-slate-50 to-blue-50 rounded-xl p-6">
                <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center space-x-2">
                  <LockClosedIcon className="w-6 h-6 text-blue-600" />
                  <span>Authentication</span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Authentication Method</label>
                    <select
                      value={securityConfig.authMethod}
                      onChange={(e) => setSecurityConfig({ ...securityConfig, authMethod: e.target.value as any })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="local">Local (Username/Password)</option>
                      <option value="oauth">OAuth 2.0</option>
                      <option value="saml">SAML 2.0</option>
                      <option value="ldap">LDAP</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Session Timeout (seconds)</label>
                    <input
                      type="number"
                      value={securityConfig.sessionTimeout}
                      onChange={(e) => setSecurityConfig({ ...securityConfig, sessionTimeout: parseInt(e.target.value) })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={securityConfig.twoFactorEnabled}
                        onChange={(e) => setSecurityConfig({ ...securityConfig, twoFactorEnabled: e.target.checked })}
                        className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="font-semibold text-gray-700">Enable Two-Factor Authentication (2FA)</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Access Control */}
              <div className="bg-gradient-to-br from-slate-50 to-blue-50 rounded-xl p-6">
                <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center space-x-2">
                  <ShieldCheckIcon className="w-6 h-6 text-green-600" />
                  <span>Access Control</span>
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">IP Whitelist (one per line)</label>
                    <textarea
                      value={securityConfig.ipWhitelist.join('\n')}
                      onChange={(e) => setSecurityConfig({
                        ...securityConfig,
                        ipWhitelist: e.target.value.split('\n').filter(ip => ip.trim())
                      })}
                      rows={5}
                      placeholder="192.168.1.1&#10;10.0.0.0/8"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">CORS Allowed Origins (one per line)</label>
                    <textarea
                      value={securityConfig.corsOrigins.join('\n')}
                      onChange={(e) => setSecurityConfig({
                        ...securityConfig,
                        corsOrigins: e.target.value.split('\n').filter(origin => origin.trim())
                      })}
                      rows={5}
                      placeholder="https://example.com&#10;https://app.example.com"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Rate Limiting & Encryption */}
              <div className="bg-gradient-to-br from-slate-50 to-blue-50 rounded-xl p-6">
                <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center space-x-2">
                  <BoltIcon className="w-6 h-6 text-yellow-600" />
                  <span>Rate Limiting & Encryption</span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Rate Limit (requests/minute)</label>
                    <input
                      type="number"
                      value={securityConfig.rateLimit}
                      onChange={(e) => setSecurityConfig({ ...securityConfig, rateLimit: parseInt(e.target.value) })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Encryption Algorithm</label>
                    <select
                      value={securityConfig.encryptionAlgorithm}
                      onChange={(e) => setSecurityConfig({ ...securityConfig, encryptionAlgorithm: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="AES-256-GCM">AES-256-GCM</option>
                      <option value="AES-256-CBC">AES-256-CBC</option>
                      <option value="ChaCha20-Poly1305">ChaCha20-Poly1305</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <button className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-all duration-200 flex items-center space-x-2 shadow-lg hover:shadow-xl">
                  <SaveIcon className="w-5 h-5" />
                  <span>Save Security Settings</span>
                </button>
              </div>
            </div>
          )}

          {/* Database Tab */}
          {activeTab === 'database' && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Database Configuration</h2>

              {/* Connection Settings */}
              <div className="bg-gradient-to-br from-slate-50 to-blue-50 rounded-xl p-6">
                <h3 className="text-xl font-bold text-gray-900 mb-4">Connection Settings</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Database Type</label>
                    <select
                      value={databaseConfig.type}
                      onChange={(e) => setDatabaseConfig({ ...databaseConfig, type: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="postgresql">PostgreSQL</option>
                      <option value="mysql">MySQL</option>
                      <option value="mariadb">MariaDB</option>
                      <option value="oracle">Oracle</option>
                      <option value="mssql">Microsoft SQL Server</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Host</label>
                    <input
                      type="text"
                      value={databaseConfig.host}
                      onChange={(e) => setDatabaseConfig({ ...databaseConfig, host: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Port</label>
                    <input
                      type="number"
                      value={databaseConfig.port}
                      onChange={(e) => setDatabaseConfig({ ...databaseConfig, port: parseInt(e.target.value) })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Database Name</label>
                    <input
                      type="text"
                      value={databaseConfig.database}
                      onChange={(e) => setDatabaseConfig({ ...databaseConfig, database: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Username</label>
                    <input
                      type="text"
                      value={databaseConfig.username}
                      onChange={(e) => setDatabaseConfig({ ...databaseConfig, username: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Password</label>
                    <div className="relative">
                      <input
                        type={showPassword['database'] ? 'text' : 'password'}
                        value={databaseConfig.password}
                        onChange={(e) => setDatabaseConfig({ ...databaseConfig, password: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword({ ...showPassword, database: !showPassword['database'] })}
                        className="absolute right-2 top-2 text-gray-500 hover:text-gray-700"
                      >
                        <EyeIcon className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex justify-end">
                  <button
                    onClick={() => testConnection('database')}
                    className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-all duration-200 flex items-center space-x-2"
                  >
                    <RefreshIcon className={`w-5 h-5 ${testResults['database'] === null ? 'animate-spin' : ''}`} />
                    <span>Test Connection</span>
                  </button>
                  {testResults['database'] && (
                    <span className={`ml-3 px-4 py-2 rounded-lg font-semibold ${
                      testResults['database'] === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {testResults['database'] === 'success' ? 'Connection successful!' : 'Connection failed!'}
                    </span>
                  )}
                </div>
              </div>

              {/* Pool Configuration */}
              <div className="bg-gradient-to-br from-slate-50 to-blue-50 rounded-xl p-6">
                <h3 className="text-xl font-bold text-gray-900 mb-4">Connection Pool</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Pool Size</label>
                    <input
                      type="number"
                      value={databaseConfig.poolSize}
                      onChange={(e) => setDatabaseConfig({ ...databaseConfig, poolSize: parseInt(e.target.value) })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Max Connections</label>
                    <input
                      type="number"
                      value={databaseConfig.maxConnections}
                      onChange={(e) => setDatabaseConfig({ ...databaseConfig, maxConnections: parseInt(e.target.value) })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>

              {/* Backup Configuration */}
              <div className="bg-gradient-to-br from-slate-50 to-blue-50 rounded-xl p-6">
                <h3 className="text-xl font-bold text-gray-900 mb-4">Backup & Retention</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Backup Schedule (Cron)</label>
                    <input
                      type="text"
                      value={databaseConfig.backupSchedule}
                      onChange={(e) => setDatabaseConfig({ ...databaseConfig, backupSchedule: e.target.value })}
                      placeholder="0 2 * * *"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
                    />
                    <p className="text-xs text-gray-500 mt-1">Current: Daily at 2:00 AM</p>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Retention Period (days)</label>
                    <input
                      type="number"
                      value={databaseConfig.retentionDays}
                      onChange={(e) => setDatabaseConfig({ ...databaseConfig, retentionDays: parseInt(e.target.value) })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <button className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-all duration-200 flex items-center space-x-2 shadow-lg hover:shadow-xl">
                  <SaveIcon className="w-5 h-5" />
                  <span>Save Database Settings</span>
                </button>
              </div>
            </div>
          )}

          {/* API Configuration Tab */}
          {activeTab === 'api' && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">API Configuration</h2>

              {/* Endpoints */}
              <div className="bg-gradient-to-br from-slate-50 to-blue-50 rounded-xl p-6">
                <h3 className="text-xl font-bold text-gray-900 mb-4">API Endpoints</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">REST API Endpoint</label>
                    <input
                      type="text"
                      value={apiConfig.restEndpoint}
                      onChange={(e) => setApiConfig({ ...apiConfig, restEndpoint: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">GraphQL Endpoint</label>
                    <input
                      type="text"
                      value={apiConfig.graphqlEndpoint}
                      onChange={(e) => setApiConfig({ ...apiConfig, graphqlEndpoint: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">WebSocket Endpoint</label>
                    <input
                      type="text"
                      value={apiConfig.websocketEndpoint}
                      onChange={(e) => setApiConfig({ ...apiConfig, websocketEndpoint: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">API Version</label>
                      <input
                        type="text"
                        value={apiConfig.apiVersion}
                        onChange={(e) => setApiConfig({ ...apiConfig, apiVersion: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Documentation URL</label>
                      <input
                        type="text"
                        value={apiConfig.docsUrl}
                        onChange={(e) => setApiConfig({ ...apiConfig, docsUrl: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Rate Limits */}
              <div className="bg-gradient-to-br from-slate-50 to-blue-50 rounded-xl p-6">
                <h3 className="text-xl font-bold text-gray-900 mb-4">Endpoint Rate Limits (requests/minute)</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.entries(apiConfig.rateLimits).map(([endpoint, limit]) => (
                    <div key={endpoint}>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">{endpoint}</label>
                      <input
                        type="number"
                        value={limit}
                        onChange={(e) => setApiConfig({
                          ...apiConfig,
                          rateLimits: { ...apiConfig.rateLimits, [endpoint]: parseInt(e.target.value) }
                        })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end">
                <button className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-all duration-200 flex items-center space-x-2 shadow-lg hover:shadow-xl">
                  <SaveIcon className="w-5 h-5" />
                  <span>Save API Settings</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProfessionalSystemConfiguration;
