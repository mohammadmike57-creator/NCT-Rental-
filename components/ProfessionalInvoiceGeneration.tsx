import React, { useState, useMemo } from 'react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { Reservation, YearData, CompanyDetails, RentalSource, InvoiceData } from '../types';
import { DocumentTextIcon, PrinterIcon, PdfIcon, MailIcon, ExportIcon, SaveIcon, PlusIcon, TrashIcon, CalendarIcon, FilterIcon, SearchIcon, CheckCircleIcon, CloseIcon } from './icons';
import { MONTHS } from '../constants';

interface ProfessionalInvoiceGenerationProps {
  yearData: YearData;
  year: number;
  companyDetails: CompanyDetails;
  sources: RentalSource[];
  invoices: InvoiceData[];
  onSaveInvoice: (invoice: InvoiceData) => void;
}

interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface InvoiceForm {
  invoiceNumber: string;
  date: string;
  dueDate: string;
  customerName: string;
  customerEmail: string;
  customerAddress: string;
  customerType: 'Individual' | 'Corporate';
  source: string;
  currency: 'USD' | 'JOD' | 'EUR';
  lineItems: LineItem[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  discountPercent: number;
  discountAmount: number;
  total: number;
  paymentStatus: 'Paid' | 'Pending' | 'Overdue' | 'Cancelled';
  paymentTerms: string;
  notes: string;
  template: 'Standard' | 'Detailed' | 'Summary';
}

type DatePreset = 'This Month' | 'Last Month' | 'Quarter' | 'YTD' | 'Custom';

const ProfessionalInvoiceGeneration: React.FC<ProfessionalInvoiceGenerationProps> = ({
  yearData,
  year,
  companyDetails,
  sources,
  invoices,
  onSaveInvoice,
}) => {
  const [activeTab, setActiveTab] = useState<'create' | 'history'>('create');
  const [datePreset, setDatePreset] = useState<DatePreset>('This Month');
  const [customDateRange, setCustomDateRange] = useState({ start: '', end: '' });
  const [selectedSource, setSelectedSource] = useState<string>('All');
  const [selectedCustomerType, setSelectedCustomerType] = useState<string>('All');
  const [selectedPaymentStatus, setSelectedPaymentStatus] = useState<string>('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  // Invoice form state
  const [invoiceForm, setInvoiceForm] = useState<InvoiceForm>({
    invoiceNumber: `INV-${year}-${String(invoices.length + 1).padStart(5, '0')}`,
    date: new Date().toISOString().split('T')[0],
    dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    customerName: '',
    customerEmail: '',
    customerAddress: '',
    customerType: 'Individual',
    source: 'Direct',
    currency: 'USD',
    lineItems: [
      { id: '1', description: '', quantity: 1, unitPrice: 0, total: 0 }
    ],
    subtotal: 0,
    taxRate: 16, // Default VAT rate
    taxAmount: 0,
    discountPercent: 0,
    discountAmount: 0,
    total: 0,
    paymentStatus: 'Pending',
    paymentTerms: 'Net 30',
    notes: '',
    template: 'Standard',
  });

  // Currency symbols
  const currencySymbols = {
    USD: '$',
    JOD: 'JOD ',
    EUR: '€',
  };

  // Calculate statistics
  const statistics = useMemo(() => {
    const filteredInvoices = invoices.filter(inv => {
      if (selectedSource !== 'All' && inv.source !== selectedSource) return false;
      if (selectedCustomerType !== 'All' && inv.customerType !== selectedCustomerType) return false;
      if (selectedPaymentStatus !== 'All' && inv.paymentStatus !== selectedPaymentStatus) return false;
      return true;
    });

    const totalRevenue = filteredInvoices.reduce((sum, inv) => sum + inv.total, 0);
    const paidAmount = filteredInvoices.filter(inv => inv.paymentStatus === 'Paid').reduce((sum, inv) => sum + inv.total, 0);
    const pendingAmount = filteredInvoices.filter(inv => inv.paymentStatus === 'Pending').reduce((sum, inv) => sum + inv.total, 0);
    const overdueAmount = filteredInvoices.filter(inv => inv.paymentStatus === 'Overdue').reduce((sum, inv) => sum + inv.total, 0);

    return {
      totalInvoices: filteredInvoices.length,
      totalRevenue,
      paidAmount,
      pendingAmount,
      overdueAmount,
    };
  }, [invoices, selectedSource, selectedCustomerType, selectedPaymentStatus]);

  // Update line item calculations
  const updateLineItem = (id: string, field: keyof LineItem, value: any) => {
    setInvoiceForm(prev => {
      const updatedItems = prev.lineItems.map(item => {
        if (item.id === id) {
          const updated = { ...item, [field]: value };
          if (field === 'quantity' || field === 'unitPrice') {
            updated.total = updated.quantity * updated.unitPrice;
          }
          return updated;
        }
        return item;
      });

      const subtotal = updatedItems.reduce((sum, item) => sum + item.total, 0);
      const discountAmount = subtotal * (prev.discountPercent / 100);
      const afterDiscount = subtotal - discountAmount;
      const taxAmount = afterDiscount * (prev.taxRate / 100);
      const total = afterDiscount + taxAmount;

      return {
        ...prev,
        lineItems: updatedItems,
        subtotal,
        discountAmount,
        taxAmount,
        total,
      };
    });
  };

  // Add new line item
  const addLineItem = () => {
    setInvoiceForm(prev => ({
      ...prev,
      lineItems: [
        ...prev.lineItems,
        { id: Date.now().toString(), description: '', quantity: 1, unitPrice: 0, total: 0 }
      ]
    }));
  };

  // Remove line item
  const removeLineItem = (id: string) => {
    if (invoiceForm.lineItems.length === 1) return; // Keep at least one item
    setInvoiceForm(prev => {
      const updatedItems = prev.lineItems.filter(item => item.id !== id);
      const subtotal = updatedItems.reduce((sum, item) => sum + item.total, 0);
      const discountAmount = subtotal * (prev.discountPercent / 100);
      const afterDiscount = subtotal - discountAmount;
      const taxAmount = afterDiscount * (prev.taxRate / 100);
      const total = afterDiscount + taxAmount;

      return {
        ...prev,
        lineItems: updatedItems,
        subtotal,
        discountAmount,
        taxAmount,
        total,
      };
    });
  };

  // Update tax or discount
  const updateCalculations = (field: 'taxRate' | 'discountPercent', value: number) => {
    setInvoiceForm(prev => {
      const updated = { ...prev, [field]: value };
      const discountAmount = updated.subtotal * (updated.discountPercent / 100);
      const afterDiscount = updated.subtotal - discountAmount;
      const taxAmount = afterDiscount * (updated.taxRate / 100);
      const total = afterDiscount + taxAmount;

      return {
        ...updated,
        discountAmount,
        taxAmount,
        total,
      };
    });
  };

  // Format currency
  const formatCurrency = (amount: number, currency: string = invoiceForm.currency) => {
    const symbol = currencySymbols[currency as keyof typeof currencySymbols];
    return `${symbol}${amount.toFixed(2)}`;
  };

  // Export to PDF
  const exportToPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // Header with gradient effect (simulated with color)
    doc.setFillColor(59, 130, 246);
    doc.rect(0, 0, pageWidth, 40, 'F');

    // Company Name
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text(companyDetails.name || 'Your Company Name', 20, 20);

    // Invoice Title
    doc.setFontSize(18);
    doc.text('INVOICE', pageWidth - 60, 20);

    // Company Details
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(companyDetails.address || 'Company Address', 20, 28);
    doc.text(companyDetails.phone || 'Phone', 20, 34);

    // Invoice Details Box
    doc.setFillColor(249, 250, 251);
    doc.rect(pageWidth - 90, 50, 70, 35, 'F');

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Invoice #:', pageWidth - 85, 58);
    doc.text('Date:', pageWidth - 85, 66);
    doc.text('Due Date:', pageWidth - 85, 74);
    doc.text('Status:', pageWidth - 85, 82);

    doc.setFont('helvetica', 'normal');
    doc.text(invoiceForm.invoiceNumber, pageWidth - 50, 58);
    doc.text(invoiceForm.date, pageWidth - 50, 66);
    doc.text(invoiceForm.dueDate, pageWidth - 50, 74);

    // Status with color
    const statusColors = {
      Paid: [34, 197, 94],
      Pending: [250, 204, 21],
      Overdue: [239, 68, 68],
      Cancelled: [156, 163, 175],
    };
    const statusColor = statusColors[invoiceForm.paymentStatus];
    doc.setTextColor(statusColor[0], statusColor[1], statusColor[2]);
    doc.text(invoiceForm.paymentStatus, pageWidth - 50, 82);

    // Bill To Section
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Bill To:', 20, 58);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(invoiceForm.customerName, 20, 66);
    const addressLines = doc.splitTextToSize(invoiceForm.customerAddress, 80);
    doc.text(addressLines, 20, 72);
    doc.text(invoiceForm.customerEmail, 20, 72 + (addressLines.length * 5));

    // Line Items Table
    const tableStartY = 100;
    const tableData = invoiceForm.lineItems.map(item => [
      item.description,
      item.quantity.toString(),
      formatCurrency(item.unitPrice),
      formatCurrency(item.total),
    ]);

    (doc as any).autoTable({
      startY: tableStartY,
      head: [['Description', 'Quantity', 'Unit Price', 'Total']],
      body: tableData,
      theme: 'striped',
      headStyles: {
        fillColor: [59, 130, 246],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 11,
      },
      bodyStyles: {
        fontSize: 10,
      },
      columnStyles: {
        0: { cellWidth: 80 },
        1: { cellWidth: 30, halign: 'center' },
        2: { cellWidth: 35, halign: 'right' },
        3: { cellWidth: 35, halign: 'right' },
      },
      margin: { left: 20, right: 20 },
    });

    // Totals Section
    const finalY = (doc as any).lastAutoTable.finalY + 10;
    const totalsX = pageWidth - 90;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Subtotal:', totalsX, finalY);
    doc.text(formatCurrency(invoiceForm.subtotal), pageWidth - 25, finalY, { align: 'right' });

    if (invoiceForm.discountPercent > 0) {
      doc.text(`Discount (${invoiceForm.discountPercent}%):`, totalsX, finalY + 7);
      doc.text(`-${formatCurrency(invoiceForm.discountAmount)}`, pageWidth - 25, finalY + 7, { align: 'right' });
    }

    doc.text(`Tax (${invoiceForm.taxRate}%):`, totalsX, finalY + 14);
    doc.text(formatCurrency(invoiceForm.taxAmount), pageWidth - 25, finalY + 14, { align: 'right' });

    // Total with background
    doc.setFillColor(59, 130, 246);
    doc.rect(totalsX - 5, finalY + 18, 85, 10, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('TOTAL:', totalsX, finalY + 25);
    doc.text(formatCurrency(invoiceForm.total), pageWidth - 25, finalY + 25, { align: 'right' });

    // Payment Terms
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Payment Terms:', 20, finalY + 40);
    doc.setFont('helvetica', 'normal');
    doc.text(invoiceForm.paymentTerms, 20, finalY + 47);

    // Notes
    if (invoiceForm.notes) {
      doc.setFont('helvetica', 'bold');
      doc.text('Notes:', 20, finalY + 60);
      doc.setFont('helvetica', 'normal');
      const notesLines = doc.splitTextToSize(invoiceForm.notes, pageWidth - 40);
      doc.text(notesLines, 20, finalY + 67);
    }

    // Footer
    doc.setFontSize(8);
    doc.setTextColor(107, 114, 128);
    doc.text('Thank you for your business!', pageWidth / 2, pageHeight - 20, { align: 'center' });
    doc.text(`Generated on ${new Date().toLocaleDateString()}`, pageWidth / 2, pageHeight - 15, { align: 'center' });

    // Save PDF
    doc.save(`${invoiceForm.invoiceNumber}.pdf`);
  };

  // Export to CSV
  const exportToCSV = () => {
    const headers = ['Invoice #', 'Date', 'Customer', 'Source', 'Status', 'Subtotal', 'Tax', 'Total'];
    const rows = invoices.map(inv => [
      inv.invoiceNumber,
      inv.date,
      inv.customerName,
      inv.source,
      inv.paymentStatus,
      inv.subtotal.toFixed(2),
      inv.taxAmount.toFixed(2),
      inv.total.toFixed(2),
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `invoices-${Date.now()}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Print invoice
  const printInvoice = () => {
    window.print();
  };

  // Save invoice
  const saveInvoice = () => {
    const newInvoice: InvoiceData = {
      id: Date.now().toString(),
      ...invoiceForm,
      createdAt: new Date().toISOString(),
    };
    onSaveInvoice(newInvoice);

    // Reset form
    setInvoiceForm({
      invoiceNumber: `INV-${year}-${String(invoices.length + 2).padStart(5, '0')}`,
      date: new Date().toISOString().split('T')[0],
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      customerName: '',
      customerEmail: '',
      customerAddress: '',
      customerType: 'Individual',
      source: 'Direct',
      currency: 'USD',
      lineItems: [
        { id: '1', description: '', quantity: 1, unitPrice: 0, total: 0 }
      ],
      subtotal: 0,
      taxRate: 16,
      taxAmount: 0,
      discountPercent: 0,
      discountAmount: 0,
      total: 0,
      paymentStatus: 'Pending',
      paymentTerms: 'Net 30',
      notes: '',
      template: 'Standard',
    });

    alert('Invoice saved successfully!');
  };

  // Get status badge color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Paid':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'Pending':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'Overdue':
        return 'bg-rose-100 text-rose-800 border-rose-200';
      case 'Cancelled':
        return 'bg-slate-100 text-slate-800 border-slate-200';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };

  return (
    <div className="min-h-screen p-6 bg-slate-50">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="rounded-2xl shadow-2xl p-8 mb-8 text-white bg-slate-900">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="bg-white/20 backdrop-blur-sm rounded-xl p-4">
                <DocumentTextIcon className="w-12 h-12" />
              </div>
              <div>
                <h1 className="text-4xl font-bold mb-2">Professional Invoice Generation</h1>
                <p className="text-sky-100 text-lg">Create, manage, and track invoices with ease</p>
              </div>
            </div>
          </div>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-sky-500 hover:shadow-xl transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-500 text-sm font-medium mb-1">Total Invoices</p>
                <p className="text-3xl font-bold text-slate-900">{statistics.totalInvoices}</p>
              </div>
              <DocumentTextIcon className="w-12 h-12 text-sky-500 opacity-20" />
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-emerald-500 hover:shadow-xl transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-500 text-sm font-medium mb-1">Total Revenue</p>
                <p className="text-3xl font-bold text-slate-900">{formatCurrency(statistics.totalRevenue)}</p>
              </div>
              <div className="text-4xl">💰</div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-emerald-500 hover:shadow-xl transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-500 text-sm font-medium mb-1">Paid</p>
                <p className="text-3xl font-bold text-emerald-600">{formatCurrency(statistics.paidAmount)}</p>
              </div>
              <CheckCircleIcon className="w-12 h-12 text-emerald-500 opacity-20" />
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-amber-500 hover:shadow-xl transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-500 text-sm font-medium mb-1">Pending</p>
                <p className="text-3xl font-bold text-amber-600">{formatCurrency(statistics.pendingAmount)}</p>
              </div>
              <div className="text-4xl">⏳</div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-rose-500 hover:shadow-xl transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-500 text-sm font-medium mb-1">Overdue</p>
                <p className="text-3xl font-bold text-rose-600">{formatCurrency(statistics.overdueAmount)}</p>
              </div>
              <div className="text-4xl">⚠️</div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-xl shadow-lg mb-8">
          <div className="border-b border-slate-200">
            <div className="flex space-x-8 px-6">
              <button
                onClick={() => setActiveTab('create')}
                className={`py-4 px-2 border-b-2 font-semibold transition-colors ${
                  activeTab === 'create'
                    ? 'border-sky-600 text-sky-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                Create Invoice
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`py-4 px-2 border-b-2 font-semibold transition-colors ${
                  activeTab === 'history'
                    ? 'border-sky-600 text-sky-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                Invoice History
              </button>
            </div>
          </div>

          {/* Create Invoice Tab */}
          {activeTab === 'create' && (
            <div className="p-8">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Left Column - Invoice Form */}
                <div className="space-y-6">
                  {/* Invoice Details */}
                  <div className="rounded-xl p-6 border border-sky-200 bg-slate-50">
                    <h3 className="text-xl font-bold text-slate-900 mb-4 flex items-center">
                      <DocumentTextIcon className="w-6 h-6 mr-2 text-sky-600" />
                      Invoice Details
                    </h3>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Invoice Number</label>
                        <input
                          type="text"
                          value={invoiceForm.invoiceNumber}
                          onChange={(e) => setInvoiceForm({ ...invoiceForm, invoiceNumber: e.target.value })}
                          className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Template</label>
                        <select
                          value={invoiceForm.template}
                          onChange={(e) => setInvoiceForm({ ...invoiceForm, template: e.target.value as any })}
                          className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                        >
                          <option value="Standard">Standard</option>
                          <option value="Detailed">Detailed</option>
                          <option value="Summary">Summary</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Date</label>
                        <input
                          type="date"
                          value={invoiceForm.date}
                          onChange={(e) => setInvoiceForm({ ...invoiceForm, date: e.target.value })}
                          className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Due Date</label>
                        <input
                          type="date"
                          value={invoiceForm.dueDate}
                          onChange={(e) => setInvoiceForm({ ...invoiceForm, dueDate: e.target.value })}
                          className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Currency</label>
                        <select
                          value={invoiceForm.currency}
                          onChange={(e) => setInvoiceForm({ ...invoiceForm, currency: e.target.value as any })}
                          className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                        >
                          <option value="USD">USD ($)</option>
                          <option value="JOD">JOD (JOD)</option>
                          <option value="EUR">EUR (€)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Payment Status</label>
                        <select
                          value={invoiceForm.paymentStatus}
                          onChange={(e) => setInvoiceForm({ ...invoiceForm, paymentStatus: e.target.value as any })}
                          className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                        >
                          <option value="Pending">Pending</option>
                          <option value="Paid">Paid</option>
                          <option value="Overdue">Overdue</option>
                          <option value="Cancelled">Cancelled</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Customer Details */}
                  <div className="rounded-xl p-6 border border-emerald-200 bg-slate-50">
                    <h3 className="text-xl font-bold text-slate-900 mb-4 flex items-center">
                      <div className="text-2xl mr-2">👤</div>
                      Customer Details
                    </h3>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Customer Name</label>
                        <input
                          type="text"
                          value={invoiceForm.customerName}
                          onChange={(e) => setInvoiceForm({ ...invoiceForm, customerName: e.target.value })}
                          placeholder="John Doe"
                          className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-semibold text-slate-700 mb-2">Email</label>
                          <input
                            type="email"
                            value={invoiceForm.customerEmail}
                            onChange={(e) => setInvoiceForm({ ...invoiceForm, customerEmail: e.target.value })}
                            placeholder="john@example.com"
                            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-semibold text-slate-700 mb-2">Customer Type</label>
                          <select
                            value={invoiceForm.customerType}
                            onChange={(e) => setInvoiceForm({ ...invoiceForm, customerType: e.target.value as any })}
                            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                          >
                            <option value="Individual">Individual</option>
                            <option value="Corporate">Corporate</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Address</label>
                        <textarea
                          value={invoiceForm.customerAddress}
                          onChange={(e) => setInvoiceForm({ ...invoiceForm, customerAddress: e.target.value })}
                          placeholder="123 Main St, City, State, ZIP"
                          rows={3}
                          className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Source/Channel</label>
                        <select
                          value={invoiceForm.source}
                          onChange={(e) => setInvoiceForm({ ...invoiceForm, source: e.target.value })}
                          className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                        >
                          <option value="Direct">Direct</option>
                          <option value="Booking.com">Booking.com</option>
                          <option value="Expedia">Expedia</option>
                          <option value="Airbnb">Airbnb</option>
                          {sources.map(source => (
                            <option key={source.name} value={source.name}>{source.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Line Items */}
                  <div className="rounded-xl p-6 border border-emerald-200 bg-slate-50">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-xl font-bold text-slate-900 flex items-center">
                        <div className="text-2xl mr-2">📋</div>
                        Line Items
                      </h3>
                      <button
                        onClick={addLineItem}
                        className="flex items-center px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors shadow-md"
                      >
                        <PlusIcon className="w-5 h-5 mr-2" />
                        Add Item
                      </button>
                    </div>

                    <div className="space-y-4">
                      {invoiceForm.lineItems.map((item, index) => (
                        <div key={item.id} className="bg-white rounded-lg p-4 border border-emerald-200 shadow-sm">
                          <div className="flex items-start space-x-3">
                            <div className="flex-1 space-y-3">
                              <input
                                type="text"
                                value={item.description}
                                onChange={(e) => updateLineItem(item.id, 'description', e.target.value)}
                                placeholder="Item description"
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                              />
                              <div className="grid grid-cols-3 gap-3">
                                <div>
                                  <label className="block text-xs font-semibold text-slate-600 mb-1">Quantity</label>
                                  <input
                                    type="number"
                                    value={item.quantity}
                                    onChange={(e) => updateLineItem(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                                    min="1"
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-semibold text-slate-600 mb-1">Unit Price</label>
                                  <input
                                    type="number"
                                    value={item.unitPrice}
                                    onChange={(e) => updateLineItem(item.id, 'unitPrice', parseFloat(e.target.value) || 0)}
                                    min="0"
                                    step="0.01"
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-semibold text-slate-600 mb-1">Total</label>
                                  <div className="px-3 py-2 bg-slate-100 border border-slate-300 rounded-lg text-sm font-bold text-slate-900">
                                    {formatCurrency(item.total)}
                                  </div>
                                </div>
                              </div>
                            </div>
                            {invoiceForm.lineItems.length > 1 && (
                              <button
                                onClick={() => removeLineItem(item.id)}
                                className="p-2 text-rose-600 hover:bg-rose-100 rounded-lg transition-colors"
                              >
                                <TrashIcon className="w-5 h-5" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Calculations */}
                  <div className="rounded-xl p-6 border border-amber-200 bg-slate-50">
                    <h3 className="text-xl font-bold text-slate-900 mb-4 flex items-center">
                      <div className="text-2xl mr-2">🧮</div>
                      Calculations
                    </h3>

                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-semibold text-slate-700 mb-2">Discount (%)</label>
                          <input
                            type="number"
                            value={invoiceForm.discountPercent}
                            onChange={(e) => updateCalculations('discountPercent', parseFloat(e.target.value) || 0)}
                            min="0"
                            max="100"
                            step="0.1"
                            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-semibold text-slate-700 mb-2">Tax Rate (%)</label>
                          <input
                            type="number"
                            value={invoiceForm.taxRate}
                            onChange={(e) => updateCalculations('taxRate', parseFloat(e.target.value) || 0)}
                            min="0"
                            max="100"
                            step="0.1"
                            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                          />
                        </div>
                      </div>

                      <div className="bg-white rounded-lg p-4 border border-amber-200 space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-600">Subtotal:</span>
                          <span className="font-semibold text-slate-900">{formatCurrency(invoiceForm.subtotal)}</span>
                        </div>
                        {invoiceForm.discountPercent > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-600">Discount ({invoiceForm.discountPercent}%):</span>
                            <span className="font-semibold text-rose-600">-{formatCurrency(invoiceForm.discountAmount)}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-600">Tax ({invoiceForm.taxRate}%):</span>
                          <span className="font-semibold text-slate-900">{formatCurrency(invoiceForm.taxAmount)}</span>
                        </div>
                        <div className="border-t border-amber-200 pt-2 flex justify-between">
                          <span className="text-lg font-bold text-slate-900">Total:</span>
                          <span className="text-2xl font-bold text-amber-600">{formatCurrency(invoiceForm.total)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Additional Information */}
                  <div className="rounded-xl p-6 border border-emerald-200 bg-slate-50">
                    <h3 className="text-xl font-bold text-slate-900 mb-4 flex items-center">
                      <div className="text-2xl mr-2">📝</div>
                      Additional Information
                    </h3>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Payment Terms</label>
                        <select
                          value={invoiceForm.paymentTerms}
                          onChange={(e) => setInvoiceForm({ ...invoiceForm, paymentTerms: e.target.value })}
                          className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                        >
                          <option value="Due on Receipt">Due on Receipt</option>
                          <option value="Net 15">Net 15</option>
                          <option value="Net 30">Net 30</option>
                          <option value="Net 45">Net 45</option>
                          <option value="Net 60">Net 60</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Notes</label>
                        <textarea
                          value={invoiceForm.notes}
                          onChange={(e) => setInvoiceForm({ ...invoiceForm, notes: e.target.value })}
                          placeholder="Additional notes or payment instructions..."
                          rows={4}
                          className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-wrap gap-4">
                    <button
                      onClick={saveInvoice}
                      className="flex-1 flex items-center justify-center px-6 py-3 text-white rounded-xl transition-all shadow-lg hover:shadow-xl font-semibold bg-emerald-600 hover:bg-emerald-700"
                    >
                      <SaveIcon className="w-5 h-5 mr-2" />
                      Save Invoice
                    </button>
                    <button
                      onClick={exportToPDF}
                      className="flex items-center justify-center px-6 py-3 text-white rounded-xl transition-all shadow-lg hover:shadow-xl font-semibold bg-emerald-600 hover:bg-emerald-700"
                    >
                      <PdfIcon className="w-5 h-5 mr-2" />
                      Export PDF
                    </button>
                    <button
                      onClick={printInvoice}
                      className="flex items-center justify-center px-6 py-3 text-white rounded-xl transition-all shadow-lg hover:shadow-xl font-semibold bg-emerald-600 hover:bg-emerald-700"
                    >
                      <PrinterIcon className="w-5 h-5 mr-2" />
                      Print
                    </button>
                    <button
                      onClick={() => setShowPreview(!showPreview)}
                      className="flex items-center justify-center px-6 py-3 text-white rounded-xl transition-all shadow-lg hover:shadow-xl font-semibold bg-emerald-600 hover:bg-emerald-700"
                    >
                      {showPreview ? <CloseIcon className="w-5 h-5 mr-2" /> : <div className="text-xl mr-2">👁️</div>}
                      {showPreview ? 'Hide' : 'Preview'}
                    </button>
                  </div>
                </div>

                {/* Right Column - Preview */}
                <div className="lg:sticky lg:top-6 lg:h-fit">
                  <div className="bg-white rounded-xl shadow-2xl p-8 border border-slate-200">
                    <div className="mb-6 pb-4 border-b border-slate-200">
                      <h3 className="text-2xl font-bold text-slate-900 flex items-center">
                        <div className="text-3xl mr-3">👁️</div>
                        Invoice Preview
                      </h3>
                      <p className="text-sm text-slate-600 mt-1">Live preview of your invoice</p>
                    </div>

                    {/* Preview Content */}
                    <div className="border border-slate-300 rounded-lg p-6 bg-slate-50 space-y-6">
                      {/* Header */}
                      <div className="text-white p-6 rounded-lg -m-6 mb-6 bg-slate-900">
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="text-2xl font-bold mb-2">{companyDetails.name || 'Your Company'}</h4>
                            <p className="text-sm opacity-90">{companyDetails.address || 'Company Address'}</p>
                            <p className="text-sm opacity-90">{companyDetails.phone || 'Phone'}</p>
                          </div>
                          <div className="text-right">
                            <h5 className="text-2xl font-bold">INVOICE</h5>
                            <div className="mt-2 space-y-1 text-sm">
                              <p>{invoiceForm.invoiceNumber}</p>
                              <p>{invoiceForm.date}</p>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Bill To */}
                      <div>
                        <h6 className="text-sm font-bold text-slate-700 mb-2">BILL TO:</h6>
                        <div className="bg-white rounded-lg p-4 border border-slate-200">
                          <p className="font-semibold text-slate-900">{invoiceForm.customerName || 'Customer Name'}</p>
                          <p className="text-sm text-slate-600">{invoiceForm.customerEmail || 'customer@email.com'}</p>
                          <p className="text-sm text-slate-600">{invoiceForm.customerAddress || 'Customer Address'}</p>
                        </div>
                      </div>

                      {/* Items Table */}
                      <div>
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-slate-200 border-b border-slate-300">
                              <th className="text-left py-2 px-3 font-semibold">Description</th>
                              <th className="text-center py-2 px-3 font-semibold">Qty</th>
                              <th className="text-right py-2 px-3 font-semibold">Price</th>
                              <th className="text-right py-2 px-3 font-semibold">Total</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white">
                            {invoiceForm.lineItems.map((item, idx) => (
                              <tr key={item.id} className={idx % 2 === 0 ? 'bg-slate-50' : 'bg-white'}>
                                <td className="py-2 px-3">{item.description || '-'}</td>
                                <td className="py-2 px-3 text-center">{item.quantity}</td>
                                <td className="py-2 px-3 text-right">{formatCurrency(item.unitPrice)}</td>
                                <td className="py-2 px-3 text-right font-semibold">{formatCurrency(item.total)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Totals */}
                      <div className="bg-white rounded-lg p-4 border border-slate-200 space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-600">Subtotal:</span>
                          <span className="font-semibold">{formatCurrency(invoiceForm.subtotal)}</span>
                        </div>
                        {invoiceForm.discountPercent > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-600">Discount ({invoiceForm.discountPercent}%):</span>
                            <span className="font-semibold text-rose-600">-{formatCurrency(invoiceForm.discountAmount)}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-600">Tax ({invoiceForm.taxRate}%):</span>
                          <span className="font-semibold">{formatCurrency(invoiceForm.taxAmount)}</span>
                        </div>
                        <div className="border-t border-slate-300 pt-2 flex justify-between">
                          <span className="text-lg font-bold">TOTAL:</span>
                          <span className="text-xl font-bold text-sky-600">{formatCurrency(invoiceForm.total)}</span>
                        </div>
                      </div>

                      {/* Status Badge */}
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs text-slate-500 mb-1">Status</p>
                          <span className={`inline-block px-3 py-1 rounded-full text-sm font-semibold border ${getStatusColor(invoiceForm.paymentStatus)}`}>
                            {invoiceForm.paymentStatus}
                          </span>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-slate-500 mb-1">Due Date</p>
                          <p className="text-sm font-semibold">{invoiceForm.dueDate}</p>
                        </div>
                      </div>

                      {/* Payment Terms */}
                      {invoiceForm.paymentTerms && (
                        <div className="bg-sky-50 rounded-lg p-3 border border-sky-200">
                          <p className="text-xs font-semibold text-sky-900 mb-1">Payment Terms</p>
                          <p className="text-sm text-sky-800">{invoiceForm.paymentTerms}</p>
                        </div>
                      )}

                      {/* Notes */}
                      {invoiceForm.notes && (
                        <div className="bg-amber-50 rounded-lg p-3 border border-amber-200">
                          <p className="text-xs font-semibold text-amber-900 mb-1">Notes</p>
                          <p className="text-sm text-amber-800">{invoiceForm.notes}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Invoice History Tab */}
          {activeTab === 'history' && (
            <div className="p-8">
              {/* Filters */}
              <div className="rounded-xl p-6 mb-6 border border-slate-200 bg-slate-50">
                <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center">
                  <FilterIcon className="w-5 h-5 mr-2 text-sky-600" />
                  Filters
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Source/Channel</label>
                    <select
                      value={selectedSource}
                      onChange={(e) => setSelectedSource(e.target.value)}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                    >
                      <option value="All">All Sources</option>
                      <option value="Direct">Direct</option>
                      <option value="Booking.com">Booking.com</option>
                      <option value="Expedia">Expedia</option>
                      <option value="Airbnb">Airbnb</option>
                      {sources.map(source => (
                        <option key={source.name} value={source.name}>{source.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Customer Type</label>
                    <select
                      value={selectedCustomerType}
                      onChange={(e) => setSelectedCustomerType(e.target.value)}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                    >
                      <option value="All">All Types</option>
                      <option value="Individual">Individual</option>
                      <option value="Corporate">Corporate</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Payment Status</label>
                    <select
                      value={selectedPaymentStatus}
                      onChange={(e) => setSelectedPaymentStatus(e.target.value)}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                    >
                      <option value="All">All Status</option>
                      <option value="Paid">Paid</option>
                      <option value="Pending">Pending</option>
                      <option value="Overdue">Overdue</option>
                      <option value="Cancelled">Cancelled</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Search</label>
                    <div className="relative">
                      <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                      <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search invoices..."
                        className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex justify-end">
                  <button
                    onClick={exportToCSV}
                    className="flex items-center px-4 py-2 text-white rounded-lg transition-all shadow-md bg-emerald-600 hover:bg-emerald-700"
                  >
                    <ExportIcon className="w-5 h-5 mr-2" />
                    Export to CSV
                  </button>
                </div>
              </div>

              {/* Invoice Table */}
              <div className="bg-white rounded-xl shadow-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="text-white bg-slate-900">
                      <tr>
                        <th className="px-6 py-4 text-left text-sm font-bold">Invoice #</th>
                        <th className="px-6 py-4 text-left text-sm font-bold">Date</th>
                        <th className="px-6 py-4 text-left text-sm font-bold">Customer</th>
                        <th className="px-6 py-4 text-left text-sm font-bold">Source</th>
                        <th className="px-6 py-4 text-left text-sm font-bold">Type</th>
                        <th className="px-6 py-4 text-right text-sm font-bold">Amount</th>
                        <th className="px-6 py-4 text-center text-sm font-bold">Status</th>
                        <th className="px-6 py-4 text-center text-sm font-bold">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {invoices
                        .filter(inv => {
                          if (selectedSource !== 'All' && inv.source !== selectedSource) return false;
                          if (selectedCustomerType !== 'All' && inv.customerType !== selectedCustomerType) return false;
                          if (selectedPaymentStatus !== 'All' && inv.paymentStatus !== selectedPaymentStatus) return false;
                          if (searchTerm && !inv.customerName.toLowerCase().includes(searchTerm.toLowerCase()) &&
                              !inv.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase())) return false;
                          return true;
                        })
                        .map((invoice, idx) => (
                          <tr key={invoice.id} className={`hover:bg-sky-50 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                            <td className="px-6 py-4">
                              <span className="font-semibold text-sky-600">{invoice.invoiceNumber}</span>
                            </td>
                            <td className="px-6 py-4 text-sm text-slate-600">{invoice.date}</td>
                            <td className="px-6 py-4">
                              <div>
                                <p className="font-semibold text-slate-900">{invoice.customerName}</p>
                                <p className="text-xs text-slate-500">{invoice.customerEmail}</p>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-sm text-slate-600">{invoice.source}</td>
                            <td className="px-6 py-4">
                              <span className="inline-block px-2 py-1 bg-sky-100 text-sky-800 text-xs font-semibold rounded">
                                {invoice.customerType}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <span className="font-bold text-slate-900">{formatCurrency(invoice.total, invoice.currency)}</span>
                            </td>
                            <td className="px-6 py-4 text-center">
                              <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold border ${getStatusColor(invoice.paymentStatus)}`}>
                                {invoice.paymentStatus}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center justify-center space-x-2">
                                <button
                                  onClick={() => {
                                    setInvoiceForm(invoice);
                                    setActiveTab('create');
                                  }}
                                  className="p-2 text-sky-600 hover:bg-sky-100 rounded-lg transition-colors"
                                  title="View/Edit"
                                >
                                  <div className="text-lg">👁️</div>
                                </button>
                                <button
                                  onClick={exportToPDF}
                                  className="p-2 text-rose-600 hover:bg-rose-100 rounded-lg transition-colors"
                                  title="Export PDF"
                                >
                                  <PdfIcon className="w-5 h-5" />
                                </button>
                                <button
                                  onClick={printInvoice}
                                  className="p-2 text-emerald-600 hover:bg-emerald-100 rounded-lg transition-colors"
                                  title="Print"
                                >
                                  <PrinterIcon className="w-5 h-5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>

                  {invoices.length === 0 && (
                    <div className="text-center py-12">
                      <div className="text-6xl mb-4">📋</div>
                      <p className="text-slate-500 text-lg font-semibold">No invoices found</p>
                      <p className="text-slate-400 text-sm mt-2">Create your first invoice to get started</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProfessionalInvoiceGeneration;
