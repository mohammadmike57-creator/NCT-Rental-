
import { isPrepaid as bookingIsPrepaid } from '../services/paymentType';
import React from 'react';
import { Reservation, CompanyDetails, RentalSource, PaymentType } from '../types';
import { URDRIVE_LOGO_B64 } from '../constants';
import { MailIcon, PhoneIcon, UserIcon, CarIcon, CalendarIcon, PdfIcon } from './icons';
import { Button } from './ui/Crm';
import { brandFields, deliverCustomerEmail, supportLine } from '../services/emailBrand';
import jsPDF from 'jspdf';

// Forward declaration for html2canvas from CDN

interface ReceiptProps {
    reservation: Reservation;
    companyDetails: CompanyDetails;
    sources: RentalSource[];
    onClose: () => void;
}

const DetailItem: React.FC<{ icon: React.ReactNode, label: string, value?: string | React.ReactNode }> = ({ icon, label, value }) => (
    <div className="flex items-start">
        <div className="flex-shrink-0 text-gray-400 mt-0.5">{icon}</div>
        <div className="ml-3">
            <p className="text-xs text-gray-500">{label}</p>
            <p className="text-sm font-medium text-gray-800">{value || 'N/A'}</p>
        </div>
    </div>
);


const Receipt: React.FC<ReceiptProps> = ({ reservation, companyDetails, sources, onClose }) => {
    
    const formatCurrency = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
    
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

    const rentalDays = calculateDays(reservation.startDate, reservation.endDate);
    
    const extrasTotal = reservation.extras?.reduce((sum, extra) => {
        const extraCost = extra.isComplementary ? 0 : extra.dailyPrice * rentalDays;
        return sum + extraCost;
    }, 0) ?? 0;

    const baseRentalFee = (reservation.baseAmount ?? (reservation.amount || 0));
    const totalCharges = baseRentalFee + extrasTotal;
    
    const isPrepaid = bookingIsPrepaid(reservation, sources);

    const amountPaid = isPrepaid ? baseRentalFee : totalCharges;
    const balanceDue = isPrepaid ? extrasTotal : 0;

    const handleDownloadPDF = async () => {
        const element = document.querySelector('.printable-area') as HTMLElement | null;
        if (!element) {
            alert('Could not generate PDF. A required library might be missing.');
            return;
        }
        const html2canvas = (await import('html2canvas')).default;

        html2canvas(element, { scale: 2 }).then((canvas: any) => {
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();
            const imgProps = pdf.getImageProperties(imgData);
            const imgWidth = imgProps.width;
            const imgHeight = imgProps.height;
            const ratio = Math.min(pdfWidth / imgWidth, pdfHeight / imgHeight);
            
            pdf.addImage(imgData, 'PNG', 0, 0, imgWidth * ratio, imgHeight * ratio);
            pdf.save(`receipt_${reservation.bookingId}.pdf`);
        });
    };

    const handleSendEmail = () => {
        if (!reservation.customerEmail) {
            alert("Customer email is not available for this reservation.");
            return;
        }
        const period = (d: string) => new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        const settled = balanceDue <= 0;
        void deliverCustomerEmail({
            to: reservation.customerEmail,
            subject: `Payment Receipt RCPT-${reservation.bookingId} – Booking ${reservation.bookingId} | ${companyDetails.name}`,
            heading: 'Thank you for your payment',
            intro: `Dear ${reservation.personName},\n\nThank you for your payment. We confirm receipt of the amount below for your rental with ${companyDetails.name}. Please retain this email as your receipt.`,
            rows: [
                ['Receipt number', `RCPT-${reservation.bookingId}`],
                ['Booking reference', reservation.bookingId],
                ['Vehicle', `${reservation.carModel || '—'}${reservation.licensePlate ? ` · ${reservation.licensePlate}` : ''}`],
                ['Rental period', `${period(reservation.startDate)} – ${period(reservation.endDate)}`],
                ['Total charges', formatCurrency(totalCharges)],
                ['Amount paid', formatCurrency(amountPaid)],
                ['Balance due', formatCurrency(balanceDue)],
            ],
            closing: settled
                ? `Your account for this booking is fully settled and no further payment is required.\n\nThank you for choosing ${companyDetails.name}. We look forward to serving you again.`
                : `A balance of ${formatCurrency(balanceDue)} remains outstanding on this booking. We kindly request settlement at your earliest convenience, quoting your booking reference.\n\nShould you have any questions regarding this receipt, please contact our customer support team on ${supportLine(companyDetails)}.`,
            ...brandFields(companyDetails),
            badge: settled ? 'PAID IN FULL' : 'PAYMENT RECEIVED',
            tone: settled ? 'success' : 'info',
            highlightLabel: 'Amount paid',
            highlightValue: formatCurrency(amountPaid),
        }, companyDetails);
    };


    return (
        <div className="bg-slate-50 font-sans w-full max-w-3xl mx-auto -m-4 sm:m-0 h-[100dvh] sm:h-auto sm:max-h-[92vh] sm:rounded-xl shadow-2xl flex flex-col overflow-hidden" role="dialog" aria-modal="true">
            <div className="flex items-start justify-between gap-3 px-5 py-4 bg-white border-b border-slate-200 no-print">
                <div className="min-w-0">
                    <h3 className="text-base font-semibold text-slate-900">Payment receipt</h3>
                    <p className="text-xs text-slate-500 mt-0.5 truncate"><span className="font-mono">RCPT-{reservation.bookingId || 'N/A'}</span> · {reservation.personName}</p>
                </div>
                <button onClick={onClose} aria-label="Close" className="w-8 h-8 shrink-0 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-slate-800 hover:bg-slate-100">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 sm:p-5">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 sm:p-8 overflow-x-auto">
            <div className="printable-area">
                <header className="flex justify-between items-start pb-6 border-b-2 border-slate-900">
                    <div>
                        <img src={URDRIVE_LOGO_B64} alt={`${companyDetails.name} Logo`} className="h-10 mb-3" />
                        <div className="text-sm text-slate-500 font-medium">
                            <p className="font-black text-xl text-slate-900 uppercase tracking-tight">{companyDetails.name}</p>
                            <p>{companyDetails.address}</p>
                            <p className="mt-0.5">TEL: {companyDetails.phone}</p>
                            <p>EMAIL: {companyDetails.email}</p>
                        </div>
                    </div>
                    <div className="text-right">
                        <h1 className="text-3xl font-black uppercase text-slate-900 tracking-tight">Receipt</h1>
                        <p className="text-base text-slate-500 font-bold mt-1">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mr-2">Receipt ID:</span> RCPT-{reservation.bookingId || 'N/A'}
                        </p>
                         <p className="text-base text-slate-500 font-bold mt-0.5">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mr-2">Date:</span> {new Date().toLocaleDateString()}
                        </p>
                    </div>
                </header>

                <section className="my-8">
                    <h2 className="text-base font-black text-slate-900 border-b border-slate-100 pb-3 mb-6 uppercase tracking-widest">Transaction Details</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                            <h3 className="font-black text-indigo-600 mb-3 uppercase text-[10px] tracking-widest">Billed To</h3>
                            <div className="space-y-3">
                                <DetailItem icon={<UserIcon className="w-4 h-4" />} label="Name" value={<span className="text-base font-bold">{reservation.personName}</span>} />
                                <DetailItem icon={<MailIcon className="w-4 h-4" />} label="Email" value={<span className="text-base font-bold">{reservation.customerEmail}</span>} />
                            </div>
                        </div>
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                            <h3 className="font-black text-indigo-600 mb-3 uppercase text-[10px] tracking-widest">Rental Summary</h3>
                            <div className="space-y-3">
                                <DetailItem icon={<CarIcon className="w-4 h-4" />} label="Vehicle" value={<span className="text-base font-bold">{reservation.carModel}</span>} />
                                <DetailItem icon={<CalendarIcon className="w-4 h-4" />} label="Rental Period" value={<span className="text-base font-bold">{reservation.startDate} to {reservation.endDate}</span>} />
                            </div>
                        </div>
                    </div>
                </section>
                
                <section>
                     <h2 className="text-base font-black text-slate-900 border-b border-slate-100 pb-3 mb-6 uppercase tracking-widest">Payment Summary</h2>
                     <div className="overflow-x-auto bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                        <table className="min-w-full text-sm">
                            <thead>
                                <tr className="bg-slate-900 text-white">
                                    <th className="text-left font-black p-3 uppercase text-[10px] tracking-widest">Description</th>
                                    <th className="text-right font-black p-3 uppercase text-[10px] tracking-widest">Amount</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                <tr className="hover:bg-slate-50 transition-colors">
                                    <td className="p-3 text-slate-600 font-medium">Base Rental Fee ({rentalDays} day(s))</td>
                                    <td className="p-3 text-right font-black text-slate-900">{formatCurrency(baseRentalFee)}</td>
                                </tr>
                                {(reservation.extras?.length || 0) > 0 && (
                                    <>
                                        {reservation.extras?.map((extra, i) => (
                                             <tr key={i} className="hover:bg-slate-50 transition-colors">
                                                <td className="p-3 text-slate-500 pl-6 text-xs italic">{extra.name}</td>
                                                <td className="p-3 text-right font-bold text-slate-900">
                                                    {extra.isComplementary ? 'Free' : formatCurrency(extra.dailyPrice * rentalDays)}
                                                </td>
                                            </tr>
                                        ))}
                                    </>
                                )}
                            </tbody>
                            <tfoot className="bg-slate-50 border-t border-slate-200">
                                <tr>
                                    <td className="text-right font-bold p-3 pt-4 text-slate-500 uppercase text-[9px] tracking-widest">Total Charges:</td>
                                    <td className="text-right font-black p-3 pt-4 text-slate-900 text-lg">{formatCurrency(totalCharges)}</td>
                                </tr>
                                <tr>
                                    <td className="text-right font-bold p-3 text-emerald-600 uppercase text-[9px] tracking-widest">Amount Paid:</td>
                                    <td className="text-right font-black p-3 text-emerald-600 text-lg">{formatCurrency(amountPaid)}</td>
                                </tr>
                                <tr className="bg-indigo-600 text-white">
                                    <td className="text-right font-black text-base p-4 uppercase tracking-widest">Balance Due:</td>
                                    <td className="text-right font-black text-2xl p-4 tracking-tight">{formatCurrency(balanceDue)}</td>
                                </tr>
                            </tfoot>
                        </table>
                     </div>
                </section>
                
                <footer className="pt-6 border-t mt-8 text-center">
                    <p className="text-lg font-semibold text-gray-800">Thank you for your business!</p>
                    <p className="text-xs text-gray-500 mt-2">{companyDetails.name} - {companyDetails.subName}</p>
                </footer>
            </div>
            
            </div>
            </div>
             <div className="px-5 py-3 bg-white border-t border-slate-200 flex flex-wrap justify-between items-center gap-2 no-print">
                <Button variant="secondary" onClick={onClose} className="max-sm:hidden">Close</Button>
                <div className="flex items-center gap-2 max-sm:w-full [&>*]:max-sm:flex-1">
                    <Button
                        variant="secondary"
                        onClick={handleSendEmail}
                        disabled={!reservation.customerEmail}
                        title={!reservation.customerEmail ? "Customer email not available" : "Send receipt via email"}
                        icon={<MailIcon className="w-4 h-4" />}
                    >
                        Email
                    </Button>
                    <Button variant="primary" onClick={handleDownloadPDF} icon={<PdfIcon className="w-4 h-4" />}>
                        Download
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default Receipt;
