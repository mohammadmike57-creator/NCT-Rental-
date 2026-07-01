
import React, { useState, useMemo, useEffect } from 'react';
import jsPDF from 'jspdf';
import { Reservation, ReservationStatus, YearData, CompanyDetails, RentalSource, PaymentType, InvoiceData, InvoiceReservationItem } from '../types';
import { DocumentTextIcon, PrinterIcon, PdfIcon, MailIcon, CalendarIcon, ChevronRightIcon, ExportIcon } from './icons';
import { MONTHS, URDRIVE_LOGO_B64 } from '../constants';

// Forward declaration for html2canvas from CDN
declare const html2canvas: any;

interface InvoiceProps {
  yearData: YearData;
  year: number;
  month: string;
  companyDetails: CompanyDetails;
  sources: RentalSource[];
  invoices: InvoiceData[];
  onSaveInvoice: (invoice: InvoiceData) => void;
}

const TAX_RATE = 0.16;

const toWords = (num: number): string => {
    if (num === 0) return 'Zero';

    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
    const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const thousands = ['', 'Thousand', 'Million', 'Billion'];

    const numToWords = (n: number): string => {
        if (n === 0) return '';
        if (n < 10) return ones[n];
        if (n < 20) return teens[n - 10];
        if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 > 0 ? ' ' + ones[n % 10] : '');
        return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 > 0 ? ' ' + numToWords(n % 100) : '');
    };

    let words = '';
    let i = 0;
    let tempNum = num;

    while (tempNum > 0) {
        if (tempNum % 1000 !== 0) {
            words = numToWords(tempNum % 1000) + ' ' + thousands[i] + ' ' + words;
        }
        tempNum = Math.floor(tempNum / 1000);
        i++;
    }

    return words.trim();
};


const numberToWords = (num: number): string => {
    const integerPart = Math.floor(num);
    const decimalPart = Math.round((num - integerPart) * 100);
    const integerWords = toWords(integerPart);
    return `${integerWords} and ${decimalPart.toString().padStart(2, '0')}/100 Dollars`;
};

const calculateDays = (start: string, end: string): number => {
    if (!start || !end) return 1;
    const startDate = new Date(start);
    const endDate = new Date(end);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || endDate <= startDate) {
        return 1;
    }

    const diffInMs = endDate.getTime() - startDate.getTime();

    const oneDayInMs = 24 * 60 * 60 * 1000;
    if (diffInMs <= oneDayInMs) {
        return 1;
    }

    const gracePeriodInMs = 2 * 60 * 60 * 1000;

    const fullDays = Math.floor(diffInMs / oneDayInMs);
    const remainingMs = diffInMs % oneDayInMs;

    if (remainingMs === 0) {
        return fullDays;
    }
    
    if (remainingMs >= gracePeriodInMs) {
        return fullDays + 1;
    }
    
    return fullDays;
};

const Invoice: React.FC<InvoiceProps> = ({ yearData, year, month, companyDetails, sources, invoices, onSaveInvoice }) => {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedSourceId, setSelectedSourceId] = useState<string>('all');
  
  const [view, setView] = useState<'form' | 'success'>('form');
  const [generatedInvoiceData, setGeneratedInvoiceData] = useState<InvoiceData | null>(null);
  
  const prepaidSources = useMemo(() => sources.filter(s => s.paymentType === PaymentType.PREPAID), [sources]);

  useEffect(() => {
    const monthIndex = MONTHS.indexOf(month);
    if (monthIndex !== -1) {
        const firstDay = new Date(year, monthIndex, 1);
        const lastDay = new Date(year, monthIndex + 1, 0);

        setStartDate(firstDay.toISOString().split('T')[0]);
        setEndDate(lastDay.toISOString().split('T')[0]);
    }
  }, [year, month]);
  
  useEffect(() => {
    if (prepaidSources.length > 0) {
        setSelectedSourceId('all');
    } else {
        setSelectedSourceId('');
    }
  }, [prepaidSources]);

  const invoiceData = useMemo(() => {
    const selectedSource = prepaidSources.find(s => s.id === selectedSourceId);
    const billToName = selectedSource ? selectedSource.name : 'All Prepaid Sources';
    const prepaidSourceNames = prepaidSources.map(s => s.name);

    if (!startDate || !endDate || prepaidSources.length === 0) return null;

    const allReservations = Object.values(yearData).flat();
    
    const billableReservations: InvoiceReservationItem[] = allReservations
      .filter((r: Reservation) => {
          const sourceMatch = selectedSourceId === 'all'
            ? prepaidSourceNames.includes(r.source)
            : selectedSource ? r.source === selectedSource.name : false;

          return sourceMatch && r.status === ReservationStatus.CONFIRMED &&
            r.amount > 0 && r.startDate && r.startDate >= startDate && r.startDate <= endDate;
      })
      .map((r: Reservation) => {
          const rentalDays = calculateDays(r.startDate, r.endDate);
          const extrasTotal = (r.extras || []).reduce((sum, extra) => extra.isComplementary ? sum : sum + (extra.dailyPrice * rentalDays), 0);
          const baseAmount = r.baseAmount ?? ((r.amount || 0) - extrasTotal);
          const subtotal = baseAmount / (1 + TAX_RATE);
          const tax = baseAmount - subtotal;
          return { ...r, subtotal, tax, total: baseAmount };
      });

    const totalSubtotal = billableReservations.reduce((sum, r) => sum + r.subtotal, 0);
    const totalTax = billableReservations.reduce((sum, r) => sum + r.tax, 0);
    const grandTotal = totalSubtotal + totalTax;
    const formattedStartDate = startDate.replace(/-/g, '');
    const formattedEndDate = endDate.replace(/-/g, '');

    return {
      id: 'preview-id',
      generatedAt: new Date().toISOString(),
      reservations: billableReservations, totalSubtotal, totalTax, grandTotal,
      grandTotalInWords: numberToWords(grandTotal),
      invoiceNumber: `INV-${selectedSource?.name.replace(/\s+/g, '') || 'ALL'}-${formattedStartDate}-${formattedEndDate}`,
      issueDate: new Date().toLocaleDateString(), billToName, startDate, endDate,
    };
  }, [yearData, startDate, endDate, sources, selectedSourceId, prepaidSources]);

  const formatCurrency = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  
  const handleSubmit = () => {
      if (!invoiceData || invoiceData.reservations.length === 0) {
          alert("No data to generate invoice for.");
          return;
      }
      const finalInvoiceData: InvoiceData = {
          ...invoiceData,
          id: `invoice-${Date.now()}`,
          generatedAt: new Date().toISOString(),
      };
      onSaveInvoice(finalInvoiceData);
      setGeneratedInvoiceData(finalInvoiceData);
      setView('success');
  };
  
  const handleViewPrevious = (invoice: InvoiceData) => {
    setGeneratedInvoiceData(invoice);
    setView('success');
  };

  const handleDownloadPDF = () => {
    if (!generatedInvoiceData) return;

    const element = document.querySelector('.printable-area');
    if (!element || typeof html2canvas === 'undefined') {
        alert('Could not generate PDF. A required library might be missing.');
        return;
    }

    html2canvas(element, { scale: 2 }).then((canvas: any) => {
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        const imgProps= pdf.getImageProperties(imgData);
        const imgWidth = imgProps.width;
        const imgHeight = imgProps.height;
        const ratio = Math.min(pdfWidth / imgWidth, pdfHeight / imgHeight);
        
        pdf.addImage(imgData, 'PNG', 0, 0, imgWidth * ratio, imgHeight * ratio);
        pdf.save(`invoice_${generatedInvoiceData.invoiceNumber}.pdf`);
    });
  };
  
    const handleDownloadCSV = () => {
        if (!generatedInvoiceData || generatedInvoiceData.reservations.length === 0) {
            alert('No invoice data to export.');
            return;
        }

        const escapeCSV = (str: any): string => {
            const stringified = String(str ?? '');
            if (stringified.includes(',') || stringified.includes('"') || stringified.includes('\n')) {
                return `"${stringified.replace(/"/g, '""')}"`;
            }
            return stringified;
        };

        const headers = [
            'Renter', 'Source', 'Start Date', 'End Date', 'Days', 'Status', 'Subtotal', 'Tax (16%)', 'Total'
        ];
        
        const rows = generatedInvoiceData.reservations.map(res => [
            escapeCSV(res.personName),
            escapeCSV(res.source),
            escapeCSV(res.startDate),
            escapeCSV(res.endDate),
            escapeCSV(calculateDays(res.startDate, res.endDate)),
            escapeCSV(res.status),
            escapeCSV(res.subtotal.toFixed(2)),
            escapeCSV(res.tax.toFixed(2)),
            escapeCSV(res.total.toFixed(2)),
        ].join(','));

        const csvContent = [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        const filename = `invoice_${generatedInvoiceData.invoiceNumber}.csv`;
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };


  const handleSendEmail = () => {
    if (!generatedInvoiceData) return;
    const { billToName, grandTotal, invoiceNumber } = generatedInvoiceData;
    const subject = `Invoice ${invoiceNumber} from ${companyDetails.name}`;
    const body = `Dear ${billToName},\n\nPlease find your invoice #${invoiceNumber} for the total amount of ${formatCurrency(grandTotal)}.\n\nWe recommend downloading the PDF from the application for your records.\n\nThank you for your business!\n\nSincerely,\nThe ${companyDetails.name} Team`;
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };


  const InvoicePreview: React.FC<{data: InvoiceData}> = ({ data }) => (
     <div className="space-y-8 font-serif-professional p-4">
        <div className="grid grid-cols-2 gap-6">
          <div>
             <img src={URDRIVE_LOGO_B64} alt={`${companyDetails.name} Logo`} className="h-10" />
             <div className="mt-3">
                <h2 className="text-xl font-black text-slate-900 tracking-tight">{companyDetails.name}</h2>
                <p className="text-[10px] text-slate-500 font-medium uppercase tracking-widest">{companyDetails.subName}</p>
             </div>
            <p className="text-sm text-slate-600 mt-3">{companyDetails.address}</p>
            <p className="text-sm text-slate-600">TEL: {companyDetails.phone}</p>
            <p className="text-sm text-slate-600">EMAIL: {companyDetails.email}</p>
          </div>
          <div className="text-right">
            <h2 className="text-3xl font-black uppercase text-slate-900 tracking-tight">Invoice</h2>
            <p className="text-base text-slate-500 font-bold mt-1"><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mr-2">Invoice #:</span> {data.invoiceNumber}</p>
            <p className="text-base text-slate-500 font-bold mt-0.5"><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mr-2">Date:</span> {data.issueDate}</p>
            <p className="text-base text-slate-500 font-bold mt-0.5"><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mr-2">Tax Number:</span> {companyDetails.taxNumber}</p>
          </div>
        </div>
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
            <h5 className="font-black text-slate-400 uppercase text-[10px] tracking-widest mb-1">Bill To</h5>
            <p className="text-lg font-black text-slate-900">{data.billToName}</p>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-slate-100 shadow-sm">
            <table className="min-w-full divide-y divide-slate-100">
                <thead className="bg-slate-900 text-white">
                    <tr>
                        <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest">Renter</th>
                        <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest">Source</th>
                        <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest">Period</th>
                        <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest">Days</th>
                        <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest">Status</th>
                        <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest">Subtotal</th>
                        <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest">Tax</th>
                        <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest">Total</th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                    {data.reservations.map((res) => (
                        <tr key={res.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-slate-900">{res.personName}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-600 font-medium">{res.source}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-600 font-medium">{res.startDate} to {res.endDate}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-900 text-right font-bold">{calculateDays(res.startDate, res.endDate)}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-700">
                                <span className="px-2 py-0.5 inline-flex text-[10px] leading-5 font-black uppercase tracking-widest rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                                    {res.status}
                                </span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-700 text-right font-medium">{formatCurrency(res.subtotal)}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-700 text-right font-medium">{formatCurrency(res.tax)}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-base text-indigo-600 font-black text-right">{formatCurrency(res.total)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
        <div className="flex justify-end pt-6">
            <div className="w-full max-w-sm bg-slate-50 p-6 rounded-2xl border border-slate-100 shadow-md">
                <div className="flex justify-between items-center py-2 border-b border-slate-200">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Subtotal:</span>
                    <span className="text-base font-bold text-slate-900">{formatCurrency(data.totalSubtotal)}</span>
                </div>
                 <div className="flex justify-between items-center py-2 border-b border-slate-200">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tax (16%):</span>
                    <span className="text-base font-bold text-slate-900">{formatCurrency(data.totalTax)}</span>
                </div>
                <div className="flex justify-between items-center py-4 mt-3 border-t-2 border-slate-900">
                    <span className="text-xl font-black text-slate-900 uppercase tracking-tight">Grand Total:</span>
                    <span className="text-2xl font-black text-indigo-600 tracking-tight">{formatCurrency(data.grandTotal)}</span>
                </div>
            </div>
        </div>
        <div className="pt-6 border-t border-slate-100">
            <h5 className="font-black text-slate-400 uppercase text-[10px] tracking-widest mb-1">Amount in words</h5>
            <p className="text-base font-bold text-slate-900 mt-0.5 italic">{data.grandTotalInWords}</p>
        </div>
      </div>
  );

  return (
    <div className="p-4 sm:p-6 bg-white rounded-lg shadow-md">
      {view === 'form' ? (
        <>
          <div className="mb-6 pb-4 border-b border-gray-200">
            <h3 className="text-2xl font-bold text-gray-800">Invoice for Prepaid Bookings</h3>
            <p className="text-md text-gray-500">Select a source and date range to generate the invoice.</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
            <div>
                <label htmlFor="invoice-source" className="block text-sm font-medium text-gray-700 mb-1">Booking Source</label>
                <select id="invoice-source" value={selectedSourceId} onChange={e => setSelectedSourceId(e.target.value)} className="w-full p-2 border border-gray-300 rounded-md text-sm" disabled={prepaidSources.length === 0}>
                    <option value="all">All Prepaid Sources</option>
                    {prepaidSources.map(source => <option key={source.id} value={source.id}>{source.name}</option>)}
                </select>
            </div>
            <div>
                <label htmlFor="invoice-start-date" className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                <input type="date" id="invoice-start-date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full p-2 border border-gray-300 rounded-md text-sm" />
            </div>
            <div>
                <label htmlFor="invoice-end-date" className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                <input type="date" id="invoice-end-date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full p-2 border border-gray-300 rounded-md text-sm" />
            </div>
          </div>

          <h4 className="text-lg font-semibold text-gray-700 mb-2">Preview</h4>
          {invoiceData && invoiceData.reservations.length > 0 ? (
            <div className="p-4 border rounded-lg"><InvoicePreview data={invoiceData} /></div>
          ) : (
            <div className="text-center py-12 text-gray-500 border rounded-lg">
                {prepaidSources.length > 0 ? <p>No confirmed reservations found for the selected criteria.</p> : <p>No "Prepaid" sources configured.</p>}
            </div>
          )}

           <div className="mt-8 pt-4 border-t flex justify-end">
                <button onClick={handleSubmit} disabled={!invoiceData || invoiceData.reservations.length === 0} className="px-6 py-3 bg-primary text-white font-semibold rounded-md hover:bg-secondary disabled:bg-gray-400">
                  Generate & Finalize Invoice
                </button>
            </div>

            <div className="mt-12">
                <h3 className="text-xl font-bold text-gray-800 mb-4">Previously Generated Invoices</h3>
                <div className="space-y-3">
                    {invoices.length > 0 ? (
                        [...invoices].sort((a,b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime()).map(inv => (
                            <button key={inv.id} onClick={() => handleViewPrevious(inv)} className="w-full flex justify-between items-center p-4 bg-white border rounded-lg hover:shadow-md transition-shadow text-left">
                                <div>
                                    <p className="font-semibold text-primary">{inv.invoiceNumber}</p>
                                    <p className="text-sm text-gray-600">{inv.billToName} | {inv.startDate} to {inv.endDate}</p>
                                    <p className="text-xs text-gray-400">Generated on {new Date(inv.generatedAt).toLocaleString()}</p>
                                </div>
                                <div className="flex items-center gap-2 text-gray-500">
                                    <span className="font-bold">{formatCurrency(inv.grandTotal)}</span>
                                    <ChevronRightIcon />
                                </div>
                            </button>
                        ))
                    ) : (
                        <p className="text-center text-gray-500 py-6">No invoices have been generated yet.</p>
                    )}
                </div>
            </div>
        </>
      ) : generatedInvoiceData && (
         <div>
            <div className="p-6 mb-6 bg-green-50 border-l-4 border-green-500 rounded-r-lg no-print">
                <h3 className="text-xl font-bold text-green-800">Invoice Finalized!</h3>
                <p className="text-green-700 mt-1">You can now download or email this invoice.</p>
            </div>
            <div className="flex justify-between items-center mb-6 pb-4 border-b no-print">
                <button onClick={() => { setView('form'); setGeneratedInvoiceData(null); }} className="text-sm text-blue-600 hover:underline">
                    &larr; Create New or View History
                </button>
                <div className="flex items-center gap-2">
                    <button onClick={handleDownloadPDF} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark text-sm font-medium">
                      <PdfIcon /> Download PDF
                    </button>
                     <button onClick={handleDownloadCSV} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm font-medium">
                        <ExportIcon /> Download CSV
                    </button>
                    <button onClick={handleSendEmail} className="flex items-center gap-2 px-4 py-2 bg-slate-600 text-white rounded-md hover:bg-slate-700 text-sm font-medium">
                      <MailIcon /> Send Email
                    </button>
                </div>
            </div>
            <div className="printable-area">
                <InvoicePreview data={generatedInvoiceData} />
            </div>
        </div>
      )}
    </div>
  );
};

export default Invoice;
