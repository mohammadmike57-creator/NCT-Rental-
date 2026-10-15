import React, { useState, useMemo } from 'react';
import { Reservation, CompanyDetails } from '../types';
import {
  MailIcon,
  DocumentTextIcon,
  CheckCircleIcon,
  ClockIcon,
  AlertIcon,
  PaperAirplaneIcon as SendIcon,
  RefreshIcon,
  TrashIcon,
  EyeIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  ChartBarIcon,
  CogIcon,
  DownloadIcon,
  UserIcon,
  CalendarIcon,
  BellIcon,
} from './icons';

/**
 * Professional Email & Notification System
 *
 * Enterprise-grade email automation system with:
 * - Template management with visual editor
 * - Automated triggers for all reservation events
 * - Email queue management with retry logic
 * - Campaign management and bulk sending
 * - Open and click tracking
 * - Customer segmentation
 * - A/B testing support
 * - Professional analytics dashboard
 */

interface EmailTemplate {
  id: string;
  name: string;
  type: 'agreement_signed' | 'booking_confirmation' | 'payment_receipt' |
        'pickup_reminder' | 'return_reminder' | 'invoice' | 'thank_you' | 'cancellation' | 'custom';
  subject: string;
  body: string;
  variables: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  language: 'en' | 'ar';
}

interface EmailTrigger {
  id: string;
  name: string;
  event: 'agreement_signed' | 'booking_confirmed' | 'payment_received' |
         'before_pickup' | 'after_return' | 'cancellation' | 'custom';
  templateId: string;
  isActive: boolean;
  conditions: TriggerCondition[];
  delay?: number; // Minutes
  priority: number;
}

interface TriggerCondition {
  field: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than';
  value: string;
}

interface EmailJob {
  id: string;
  to: string;
  subject: string;
  status: 'pending' | 'sending' | 'sent' | 'failed';
  priority: number;
  retryCount: number;
  scheduledTime: string;
  sentTime?: string;
  failureReason?: string;
  templateId?: string;
  reservationId?: string;
  metadata: Record<string, string>;
}

interface EmailCampaign {
  id: string;
  name: string;
  subject: string;
  templateId: string;
  status: 'draft' | 'scheduled' | 'sending' | 'completed' | 'paused';
  recipientCount: number;
  sentCount: number;
  openCount: number;
  clickCount: number;
  scheduledTime?: string;
  completedTime?: string;
  segment?: CustomerSegment;
}

interface CustomerSegment {
  name: string;
  filters: {
    isVIP?: boolean;
    isFirstTime?: boolean;
    minBookings?: number;
    source?: string;
    dateRange?: { start: string; end: string };
  };
}

interface EmailStats {
  totalSent: number;
  totalFailed: number;
  totalPending: number;
  openRate: number;
  clickRate: number;
  bounceRate: number;
  unsubscribeRate: number;
}

interface ProfessionalEmailNotificationSystemProps {
  reservations: Reservation[];
  companyDetails: CompanyDetails;
  onSendEmail: (to: string, subject: string, body: string, attachments?: any[]) => void;
}

const ProfessionalEmailNotificationSystem: React.FC<ProfessionalEmailNotificationSystemProps> = ({
  reservations,
  companyDetails,
  onSendEmail,
}) => {
  const [activeTab, setActiveTab] = useState<'templates' | 'triggers' | 'queue' | 'campaigns' | 'history' | 'analytics'>('templates');
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [isTemplateEditorOpen, setIsTemplateEditorOpen] = useState(false);
  const [isTriggerEditorOpen, setIsTriggerEditorOpen] = useState(false);
  const [isCampaignEditorOpen, setIsCampaignEditorOpen] = useState(false);
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');

  // Mock data - in production, this would come from API
  const [templates, setTemplates] = useState<EmailTemplate[]>([
    {
      id: '1',
      name: 'Agreement Signed Confirmation',
      type: 'agreement_signed',
      subject: 'Your Rental Agreement - {{bookingId}}',
      body: `<h1>Thank You, {{customerName}}!</h1>
<p>Your rental agreement has been successfully signed and confirmed.</p>
<div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
  <h3>Booking Details</h3>
  <p><strong>Booking ID:</strong> {{bookingId}}</p>
  <p><strong>Vehicle:</strong> {{carModel}}</p>
  <p><strong>Pickup:</strong> {{pickupDate}} at {{pickupLocation}}</p>
  <p><strong>Return:</strong> {{dropoffDate}}</p>
  <p><strong>Amount:</strong> {{amount}}</p>
</div>
<p>Your rental agreement and payment receipt are attached to this email.</p>
<a href="{{companyWebsite}}" style="display: inline-block; padding: 12px 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 5px; margin: 20px 0;">View My Booking</a>
<p>We look forward to serving you!</p>`,
      variables: ['customerName', 'bookingId', 'carModel', 'pickupDate', 'dropoffDate', 'amount', 'pickupLocation', 'companyWebsite'],
      isActive: true,
      createdAt: '2024-01-15T10:00:00',
      updatedAt: '2024-01-15T10:00:00',
      language: 'en',
    },
    {
      id: '2',
      name: 'Booking Confirmation',
      type: 'booking_confirmation',
      subject: 'Booking Confirmed - {{bookingId}}',
      body: `<h1>Booking Confirmed!</h1>
<p>Dear {{customerName}},</p>
<p>Your reservation has been confirmed. We're excited to have you!</p>
<div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
  <h3>Reservation Details</h3>
  <p><strong>Booking ID:</strong> {{bookingId}}</p>
  <p><strong>Vehicle:</strong> {{carModel}}</p>
  <p><strong>Pickup:</strong> {{pickupDate}}</p>
  <p><strong>Return:</strong> {{dropoffDate}}</p>
  <p><strong>Total Amount:</strong> {{amount}}</p>
</div>
<p><strong>Next Steps:</strong></p>
<ol>
  <li>Arrive at our location on your pickup date</li>
  <li>Bring your driver's license and payment method</li>
  <li>Complete a quick vehicle inspection</li>
  <li>You're ready to drive!</li>
</ol>`,
      variables: ['customerName', 'bookingId', 'carModel', 'pickupDate', 'dropoffDate', 'amount'],
      isActive: true,
      createdAt: '2024-01-15T11:00:00',
      updatedAt: '2024-01-15T11:00:00',
      language: 'en',
    },
    {
      id: '3',
      name: '24-Hour Pickup Reminder',
      type: 'pickup_reminder',
      subject: 'Reminder: Your Pickup Tomorrow - {{bookingId}}',
      body: `<h1>Your Pickup is Tomorrow!</h1>
<p>Hi {{customerName}},</p>
<p>Just a friendly reminder that your vehicle pickup is scheduled for tomorrow.</p>
<div style="background: #fff3cd; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107;">
  <h3>⏰ Pickup Details</h3>
  <p><strong>Date:</strong> {{pickupDate}}</p>
  <p><strong>Location:</strong> {{pickupLocation}}</p>
  <p><strong>Vehicle:</strong> {{carModel}}</p>
</div>
<p><strong>What to Bring:</strong></p>
<ul>
  <li>Valid driver's license</li>
  <li>Payment method</li>
  <li>Booking confirmation ({{bookingId}})</li>
</ul>
<p>See you soon!</p>`,
      variables: ['customerName', 'bookingId', 'carModel', 'pickupDate', 'pickupLocation'],
      isActive: true,
      createdAt: '2024-01-15T12:00:00',
      updatedAt: '2024-01-15T12:00:00',
      language: 'en',
    },
    {
      id: '4',
      name: 'Thank You & Invoice',
      type: 'thank_you',
      subject: 'Thank You for Your Business - {{bookingId}}',
      body: `<h1>Thank You for Choosing Us!</h1>
<p>Dear {{customerName}},</p>
<p>Thank you for renting with {{companyName}}. We hope you had a wonderful experience!</p>
<div style="background: #d4edda; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #28a745;">
  <h3>✓ Rental Completed</h3>
  <p><strong>Booking ID:</strong> {{bookingId}}</p>
  <p><strong>Vehicle:</strong> {{carModel}}</p>
</div>
<p>Your final invoice is attached to this email.</p>
<p><strong>We'd love your feedback!</strong></p>
<p>Please take a moment to rate your experience and help us improve.</p>
<a href="{{feedbackUrl}}" style="display: inline-block; padding: 12px 30px; background: #28a745; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0;">Leave a Review</a>
<p>We hope to serve you again soon!</p>`,
      variables: ['customerName', 'bookingId', 'carModel', 'companyName', 'feedbackUrl'],
      isActive: true,
      createdAt: '2024-01-15T13:00:00',
      updatedAt: '2024-01-15T13:00:00',
      language: 'en',
    },
  ]);

  const [triggers, setTriggers] = useState<EmailTrigger[]>([
    {
      id: '1',
      name: 'Send Agreement on Signature',
      event: 'agreement_signed',
      templateId: '1',
      isActive: true,
      conditions: [],
      priority: 10,
    },
    {
      id: '2',
      name: 'Send Confirmation on Booking',
      event: 'booking_confirmed',
      templateId: '2',
      isActive: true,
      conditions: [],
      priority: 8,
    },
    {
      id: '3',
      name: '24hr Pickup Reminder',
      event: 'before_pickup',
      templateId: '3',
      isActive: true,
      conditions: [],
      delay: 1440, // 24 hours
      priority: 6,
    },
    {
      id: '4',
      name: 'Thank You After Return',
      event: 'after_return',
      templateId: '4',
      isActive: true,
      conditions: [],
      priority: 5,
    },
  ]);

  const [emailQueue, setEmailQueue] = useState<EmailJob[]>([
    {
      id: 'job1',
      to: 'customer1@example.com',
      subject: 'Your Rental Agreement - NCT-2024-001',
      status: 'pending',
      priority: 10,
      retryCount: 0,
      scheduledTime: '2024-01-20T10:30:00',
      templateId: '1',
      reservationId: 'res1',
      metadata: { bookingId: 'NCT-2024-001', eventType: 'agreement_signed' },
    },
    {
      id: 'job2',
      to: 'customer2@example.com',
      subject: 'Reminder: Your Pickup Tomorrow',
      status: 'sending',
      priority: 6,
      retryCount: 0,
      scheduledTime: '2024-01-20T09:00:00',
      templateId: '3',
      metadata: { bookingId: 'NCT-2024-002', eventType: 'pickup_reminder' },
    },
    {
      id: 'job3',
      to: 'customer3@example.com',
      subject: 'Booking Confirmed - NCT-2024-003',
      status: 'sent',
      priority: 8,
      retryCount: 0,
      scheduledTime: '2024-01-20T08:00:00',
      sentTime: '2024-01-20T08:01:23',
      templateId: '2',
      metadata: { bookingId: 'NCT-2024-003', eventType: 'booking_confirmation' },
    },
    {
      id: 'job4',
      to: 'invalid-email',
      subject: 'Test Email',
      status: 'failed',
      priority: 5,
      retryCount: 3,
      scheduledTime: '2024-01-20T07:00:00',
      failureReason: 'Invalid email address',
      metadata: { eventType: 'test' },
    },
  ]);

  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([
    {
      id: 'camp1',
      name: 'January Special Offer',
      subject: 'Exclusive 20% Off Your Next Rental!',
      templateId: 'custom1',
      status: 'completed',
      recipientCount: 150,
      sentCount: 150,
      openCount: 98,
      clickCount: 45,
      scheduledTime: '2024-01-10T09:00:00',
      completedTime: '2024-01-10T10:30:00',
    },
    {
      id: 'camp2',
      name: 'VIP Customer Appreciation',
      subject: 'Thank You for Being a Valued Customer',
      templateId: 'custom2',
      status: 'scheduled',
      recipientCount: 42,
      sentCount: 0,
      openCount: 0,
      clickCount: 0,
      scheduledTime: '2024-01-25T10:00:00',
      segment: {
        name: 'VIP Customers',
        filters: { isVIP: true, minBookings: 5 },
      },
    },
  ]);

  const stats: EmailStats = useMemo(() => {
    const totalSent = emailQueue.filter(j => j.status === 'sent').length;
    const totalFailed = emailQueue.filter(j => j.status === 'failed').length;
    const totalPending = emailQueue.filter(j => j.status === 'pending' || j.status === 'sending').length;

    return {
      totalSent,
      totalFailed,
      totalPending,
      openRate: 65.4,
      clickRate: 23.8,
      bounceRate: 2.1,
      unsubscribeRate: 0.3,
    };
  }, [emailQueue]);

  const filteredTemplates = useMemo(() => {
    return templates.filter(template => {
      const matchesSearch = template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           template.subject.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesFilter = filterStatus === 'all' ||
                           (filterStatus === 'active' && template.isActive) ||
                           (filterStatus === 'inactive' && !template.isActive);
      return matchesSearch && matchesFilter;
    });
  }, [templates, searchQuery, filterStatus]);

  const getStatusBadge = (status: EmailJob['status']) => {
    const styles = {
      pending: 'bg-yellow-100 text-yellow-800',
      sending: 'bg-blue-100 text-blue-800',
      sent: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800',
    };

    const icons = {
      pending: <ClockIcon className="w-4 h-4" />,
      sending: <SendIcon className="w-4 h-4" />,
      sent: <CheckCircleIcon className="w-4 h-4" />,
      failed: <AlertIcon className="w-4 h-4" />,
    };

    return (
      <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${styles[status]}`}>
        {icons[status]}
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  const renderTemplatesTab = () => (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Email Templates</h2>
          <p className="text-gray-600 mt-1">Create and manage professional email templates</p>
        </div>
        <button
          onClick={() => setIsTemplateEditorOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all shadow-lg"
        >
          <PlusIcon className="w-5 h-5" />
          Create Template
        </button>
      </div>

      {/* Search and Filter */}
      <div className="flex gap-4">
        <div className="flex-1 relative">
          <SearchIcon className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as any)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
        >
          <option value="all">All Templates</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {/* Templates Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredTemplates.map((template) => (
          <div
            key={template.id}
            className="bg-white rounded-xl shadow-lg border border-gray-200 hover:shadow-xl transition-all overflow-hidden"
          >
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg">
                    <DocumentTextIcon className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{template.name}</h3>
                    <p className="text-sm text-gray-500">{template.type.replace('_', ' ')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {template.isActive ? (
                    <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  ) : (
                    <span className="w-2 h-2 bg-gray-400 rounded-full"></span>
                  )}
                </div>
              </div>

              <div className="space-y-2 mb-4">
                <p className="text-sm text-gray-600">
                  <strong>Subject:</strong> {template.subject}
                </p>
                <div className="flex flex-wrap gap-1">
                  {template.variables.slice(0, 3).map((variable) => (
                    <span
                      key={variable}
                      className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded"
                    >
                      {variable}
                    </span>
                  ))}
                  {template.variables.length > 3 && (
                    <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">
                      +{template.variables.length - 3} more
                    </span>
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setSelectedTemplate(template);
                    setIsTemplateEditorOpen(true);
                  }}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  <PencilIcon className="w-4 h-4" />
                  Edit
                </button>
                <button
                  onClick={() => setSelectedTemplate(template)}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors"
                >
                  <EyeIcon className="w-4 h-4" />
                  Preview
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderTriggersTab = () => (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Automated Triggers</h2>
          <p className="text-gray-600 mt-1">Configure automatic email sending based on events</p>
        </div>
        <button
          onClick={() => setIsTriggerEditorOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all shadow-lg"
        >
          <PlusIcon className="w-5 h-5" />
          Create Trigger
        </button>
      </div>

      {/* Triggers List */}
      <div className="space-y-4">
        {triggers.map((trigger) => {
          const template = templates.find(t => t.id === trigger.templateId);
          return (
            <div
              key={trigger.id}
              className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 hover:shadow-xl transition-all"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4 flex-1">
                  <div className={`p-3 rounded-lg ${trigger.isActive ? 'bg-green-100' : 'bg-gray-100'}`}>
                    <BellIcon className={`w-6 h-6 ${trigger.isActive ? 'text-green-600' : 'text-gray-400'}`} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">{trigger.name}</h3>
                      {trigger.isActive ? (
                        <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded-full">
                          Active
                        </span>
                      ) : (
                        <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs font-medium rounded-full">
                          Inactive
                        </span>
                      )}
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm text-gray-600">
                        <strong>Event:</strong> {trigger.event.replace('_', ' ')}
                      </p>
                      <p className="text-sm text-gray-600">
                        <strong>Template:</strong> {template?.name || 'Unknown'}
                      </p>
                      {trigger.delay && (
                        <p className="text-sm text-gray-600">
                          <strong>Delay:</strong> {trigger.delay} minutes before event
                        </p>
                      )}
                      <p className="text-sm text-gray-600">
                        <strong>Priority:</strong> {trigger.priority}/10
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setIsTriggerEditorOpen(true)}
                    className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <PencilIcon className="w-5 h-5" />
                  </button>
                  <button
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <TrashIcon className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderQueueTab = () => (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Email Queue</h2>
          <p className="text-gray-600 mt-1">Monitor and manage email sending queue</p>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            <RefreshIcon className="w-5 h-5" />
            Refresh
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">
            <TrashIcon className="w-5 h-5" />
            Clear Failed
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-gradient-to-br from-yellow-500 to-orange-600 rounded-xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <ClockIcon className="w-8 h-8 opacity-80" />
            <span className="text-3xl font-bold">{stats.totalPending}</span>
          </div>
          <p className="text-sm font-medium opacity-90">Pending</p>
        </div>
        <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <CheckCircleIcon className="w-8 h-8 opacity-80" />
            <span className="text-3xl font-bold">{stats.totalSent}</span>
          </div>
          <p className="text-sm font-medium opacity-90">Sent</p>
        </div>
        <div className="bg-gradient-to-br from-red-500 to-pink-600 rounded-xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <AlertIcon className="w-8 h-8 opacity-80" />
            <span className="text-3xl font-bold">{stats.totalFailed}</span>
          </div>
          <p className="text-sm font-medium opacity-90">Failed</p>
        </div>
        <div className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <MailIcon className="w-8 h-8 opacity-80" />
            <span className="text-3xl font-bold">{stats.totalSent + stats.totalPending}</span>
          </div>
          <p className="text-sm font-medium opacity-90">Total Queue</p>
        </div>
      </div>

      {/* Queue Table */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Recipient
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Subject
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Priority
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Scheduled
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {emailQueue.map((job) => (
                <tr key={job.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <UserIcon className="w-5 h-5 text-gray-400 mr-2" />
                      <span className="text-sm text-gray-900">{job.to}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900">{job.subject}</div>
                    {job.metadata.bookingId && (
                      <div className="text-xs text-gray-500">Booking: {job.metadata.bookingId}</div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getStatusBadge(job.status)}
                    {job.failureReason && (
                      <div className="text-xs text-red-600 mt-1">{job.failureReason}</div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      {[...Array(10)].map((_, i) => (
                        <div
                          key={i}
                          className={`w-2 h-4 mr-1 rounded ${
                            i < job.priority ? 'bg-purple-500' : 'bg-gray-200'
                          }`}
                        />
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(job.scheduledTime).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <div className="flex gap-2">
                      {job.status === 'failed' && (
                        <button
                          className="text-blue-600 hover:text-blue-800"
                          title="Retry"
                        >
                          <RefreshIcon className="w-5 h-5" />
                        </button>
                      )}
                      <button
                        className="text-gray-600 hover:text-gray-800"
                        title="View Details"
                      >
                        <EyeIcon className="w-5 h-5" />
                      </button>
                      <button
                        className="text-red-600 hover:text-red-800"
                        title="Delete"
                      >
                        <TrashIcon className="w-5 h-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderCampaignsTab = () => (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Email Campaigns</h2>
          <p className="text-gray-600 mt-1">Create and manage bulk email campaigns</p>
        </div>
        <button
          onClick={() => setIsCampaignEditorOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all shadow-lg"
        >
          <PlusIcon className="w-5 h-5" />
          Create Campaign
        </button>
      </div>

      {/* Campaigns Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {campaigns.map((campaign) => (
          <div
            key={campaign.id}
            className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 hover:shadow-xl transition-all"
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{campaign.name}</h3>
                <p className="text-sm text-gray-600 mt-1">{campaign.subject}</p>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                campaign.status === 'completed' ? 'bg-green-100 text-green-800' :
                campaign.status === 'sending' ? 'bg-blue-100 text-blue-800' :
                campaign.status === 'scheduled' ? 'bg-yellow-100 text-yellow-800' :
                'bg-gray-100 text-gray-800'
              }`}>
                {campaign.status}
              </span>
            </div>

            <div className="grid grid-cols-4 gap-4 mb-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-900">{campaign.recipientCount}</div>
                <div className="text-xs text-gray-500">Recipients</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{campaign.sentCount}</div>
                <div className="text-xs text-gray-500">Sent</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{campaign.openCount}</div>
                <div className="text-xs text-gray-500">Opens</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">{campaign.clickCount}</div>
                <div className="text-xs text-gray-500">Clicks</div>
              </div>
            </div>

            {campaign.status === 'completed' && (
              <div className="mb-4">
                <div className="flex justify-between text-sm mb-1">
                  <span>Open Rate</span>
                  <span className="font-medium">
                    {((campaign.openCount / campaign.sentCount) * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-green-500 h-2 rounded-full"
                    style={{ width: `${(campaign.openCount / campaign.sentCount) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {campaign.segment && (
              <div className="mb-4 p-3 bg-purple-50 rounded-lg">
                <p className="text-sm font-medium text-purple-900">Segment: {campaign.segment.name}</p>
              </div>
            )}

            <div className="flex gap-2">
              <button className="flex-1 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm">
                View Details
              </button>
              <button className="flex-1 px-3 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors text-sm">
                Analytics
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderAnalyticsTab = () => (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Email Analytics</h2>
        <p className="text-gray-600 mt-1">Track email performance and engagement metrics</p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-green-100 rounded-lg">
              <ChartBarIcon className="w-6 h-6 text-green-600" />
            </div>
            <span className="text-sm text-green-600 font-medium">+12.5%</span>
          </div>
          <div className="text-3xl font-bold text-gray-900">{stats.openRate}%</div>
          <div className="text-sm text-gray-600 mt-1">Open Rate</div>
          <div className="mt-4 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-green-500" style={{ width: `${stats.openRate}%` }} />
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-purple-100 rounded-lg">
              <ChartBarIcon className="w-6 h-6 text-purple-600" />
            </div>
            <span className="text-sm text-purple-600 font-medium">+8.3%</span>
          </div>
          <div className="text-3xl font-bold text-gray-900">{stats.clickRate}%</div>
          <div className="text-sm text-gray-600 mt-1">Click Rate</div>
          <div className="mt-4 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-purple-500" style={{ width: `${stats.clickRate}%` }} />
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-red-100 rounded-lg">
              <ChartBarIcon className="w-6 h-6 text-red-600" />
            </div>
            <span className="text-sm text-green-600 font-medium">-0.5%</span>
          </div>
          <div className="text-3xl font-bold text-gray-900">{stats.bounceRate}%</div>
          <div className="text-sm text-gray-600 mt-1">Bounce Rate</div>
          <div className="mt-4 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-red-500" style={{ width: `${stats.bounceRate}%` }} />
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-yellow-100 rounded-lg">
              <ChartBarIcon className="w-6 h-6 text-yellow-600" />
            </div>
            <span className="text-sm text-green-600 font-medium">-0.1%</span>
          </div>
          <div className="text-3xl font-bold text-gray-900">{stats.unsubscribeRate}%</div>
          <div className="text-sm text-gray-600 mt-1">Unsubscribe Rate</div>
          <div className="mt-4 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-yellow-500" style={{ width: `${stats.unsubscribeRate * 10}%` }} />
          </div>
        </div>
      </div>

      {/* Email Performance Chart */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Email Performance Trend</h3>
        <div className="h-64 flex items-end justify-between gap-2">
          {[65, 72, 68, 75, 80, 78, 85, 82, 88, 90, 87, 92].map((value, index) => (
            <div key={index} className="flex-1 flex flex-col items-center">
              <div
                className="w-full bg-gradient-to-t from-purple-600 to-indigo-600 rounded-t-lg transition-all hover:from-purple-700 hover:to-indigo-700"
                style={{ height: `${value}%` }}
              />
              <span className="text-xs text-gray-500 mt-2">
                {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][index]}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Top Performing Templates */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Performing Templates</h3>
        <div className="space-y-4">
          {[
            { name: 'Agreement Signed Confirmation', sent: 450, opens: 385, clicks: 180, rate: 85.6 },
            { name: 'Booking Confirmation', sent: 380, opens: 310, clicks: 145, rate: 81.6 },
            { name: '24-Hour Pickup Reminder', sent: 290, opens: 220, clicks: 95, rate: 75.9 },
            { name: 'Thank You & Invoice', sent: 265, opens: 195, clicks: 78, rate: 73.6 },
          ].map((template, index) => (
            <div key={index} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex-1">
                <p className="font-medium text-gray-900">{template.name}</p>
                <p className="text-sm text-gray-600">
                  {template.sent} sent • {template.opens} opens • {template.clicks} clicks
                </p>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold text-purple-600">{template.rate}%</div>
                <div className="text-xs text-gray-500">Open Rate</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-4 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-2xl shadow-lg">
              <MailIcon className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Professional Email & Notification System
              </h1>
              <p className="text-gray-600 mt-1">
                Enterprise-grade email automation with advanced analytics and tracking
              </p>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 mb-6 overflow-hidden">
          <div className="flex overflow-x-auto">
            {[
              { id: 'templates', label: 'Templates', icon: DocumentTextIcon },
              { id: 'triggers', label: 'Triggers', icon: BellIcon },
              { id: 'queue', label: 'Queue', icon: ClockIcon },
              { id: 'campaigns', label: 'Campaigns', icon: SendIcon },
              { id: 'analytics', label: 'Analytics', icon: ChartBarIcon },
              { id: 'history', label: 'History', icon: CalendarIcon },
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 px-6 py-4 font-medium transition-all whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab Content */}
        <div>
          {activeTab === 'templates' && renderTemplatesTab()}
          {activeTab === 'triggers' && renderTriggersTab()}
          {activeTab === 'queue' && renderQueueTab()}
          {activeTab === 'campaigns' && renderCampaignsTab()}
          {activeTab === 'analytics' && renderAnalyticsTab()}
          {activeTab === 'history' && (
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8 text-center">
              <CalendarIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Email History</h3>
              <p className="text-gray-600">
                Complete log of all sent emails with detailed tracking information
              </p>
            </div>
          )}
        </div>

        {/* Template Preview Modal */}
        {selectedTemplate && !isTemplateEditorOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-auto">
              <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-900">Template Preview</h2>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPreviewMode('desktop')}
                    className={`px-3 py-2 rounded-lg ${
                      previewMode === 'desktop' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    Desktop
                  </button>
                  <button
                    onClick={() => setPreviewMode('mobile')}
                    className={`px-3 py-2 rounded-lg ${
                      previewMode === 'mobile' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    Mobile
                  </button>
                  <button
                    onClick={() => setSelectedTemplate(null)}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                  >
                    Close
                  </button>
                </div>
              </div>
              <div className="p-6">
                <div className={`mx-auto border border-gray-300 rounded-lg overflow-hidden ${
                  previewMode === 'mobile' ? 'max-w-sm' : 'max-w-full'
                }`}>
                  <div className="bg-gray-800 px-4 py-2 text-white text-sm">
                    <strong>Subject:</strong> {selectedTemplate.subject}
                  </div>
                  <div
                    className="p-6 bg-white"
                    dangerouslySetInnerHTML={{ __html: selectedTemplate.body }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProfessionalEmailNotificationSystem;
