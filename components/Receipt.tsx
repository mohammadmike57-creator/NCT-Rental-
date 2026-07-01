
import React from 'react';
import { Reservation, CompanyDetails, RentalSource, PaymentType } from '../types';
import { URDRIVE_LOGO_B64 } from '../constants';
import { MailIcon, PhoneIcon, UserIcon, CarIcon, CalendarIcon, PrinterIcon, PdfIcon } from './icons';
import jsPDF from 'jspdf';

// Forward declaration for html2canvas from CDN
declare const html2canvas: any;

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
    
    const sourceInfo = sources.find(s => s.name === reservation.source);
    const isPrepaid = sourceInfo?.paymentType === PaymentType.PREPAID;

    const amountPaid = isPrepaid ? baseRentalFee : totalCharges;
    const balanceDue = isPrepaid ? extrasTotal : 0;

    const handleDownloadPDF = () => {
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
        const signature = `\n\nSincerely,\nUR-Drive Jordan\n${companyDetails.address}\nPhone: ${companyDetails.phone}\nEmail: ${companyDetails.email}`;

        const subject = `Your Payment Receipt from UR-Drive Jordan - Booking #${reservation.bookingId}`;
        const body = `Dear ${reservation.personName},\n\nThank you for your payment. Please find your receipt details below.\n\nReceipt Details:\n- Booking ID: ${reservation.bookingId}\n- Vehicle: ${reservation.carModel}\n- Rental Period: ${reservation.startDate} to ${reservation.endDate}\n- Total Charges: ${formatCurrency(totalCharges)}\n- Amount Paid: ${formatCurrency(amountPaid)}\n- Balance Due: ${formatCurrency(balanceDue)}\n\nWe appreciate your business.${signature}`;

        window.location.href = `mailto:${reservation.customerEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    };


    return (
        <div className="bg-white p-10 sm:p-14 rounded-[3rem] shadow-2xl font-sans w-full max-w-4xl border border-slate-200">
            <div className="printable-area">
                <header className="flex justify-between items-start pb-8 border-b-4 border-slate-900">
                    <div>
                        <img src={URDRIVE_LOGO_B64} alt={`${companyDetails.name} Logo`} className="h-12 mb-4" />
                        <div className="text-base text-slate-500 font-medium">
                            <p className="font-black text-2xl text-slate-900 uppercase tracking-tight">{companyDetails.name}</p>
                            <p>{companyDetails.address}</p>
                            <p className="mt-1">TEL: {companyDetails.phone}</p>
                            <p>EMAIL: {companyDetails.email}</p>
                        </div>
                    </div>
                    <div className="text-right">
                        <h1 className="text-5xl font-black uppercase text-slate-900 tracking-tighter">Receipt</h1>
                        <p className="text-lg text-slate-500 font-bold mt-2">
                            <span className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mr-2">Receipt ID:</span> RCPT-{reservation.bookingId || 'N/A'}
                        </p>
                         <p className="text-lg text-slate-500 font-bold mt-1">
                            <span className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mr-2">Date:</span> {new Date().toLocaleDateString()}
                        </p>
                    </div>
                </header>

                <section className="my-12">
                    <h2 className="text-xl font-black text-slate-900 border-b-2 border-slate-100 pb-4 mb-8 uppercase tracking-[0.2em]">Transaction Details</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                        <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                            <h3 className="font-black text-indigo-600 mb-4 uppercase text-xs tracking-[0.3em]">Billed To</h3>
                            <div className="space-y-4">
                                <DetailItem icon={<UserIcon />} label="Name" value={<span className="text-lg font-bold">{reservation.personName}</span>} />
                                <DetailItem icon={<MailIcon />} label="Email" value={<span className="text-lg font-bold">{reservation.customerEmail}</span>} />
                            </div>
                        </div>
                        <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                            <h3 className="font-black text-indigo-600 mb-4 uppercase text-xs tracking-[0.3em]">Rental Summary</h3>
                            <div className="space-y-4">
                                <DetailItem icon={<CarIcon />} label="Vehicle" value={<span className="text-lg font-bold">{reservation.carModel}</span>} />
                                <DetailItem icon={<CalendarIcon />} label="Rental Period" value={<span className="text-lg font-bold">{reservation.startDate} to {reservation.endDate}</span>} />
                            </div>
                        </div>
                    </div>
                </section>
                
                <section>
                     <h2 className="text-xl font-black text-slate-900 border-b-2 border-slate-100 pb-4 mb-8 uppercase tracking-[0.2em]">Payment Summary</h2>
                     <div className="overflow-x-auto bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                        <table className="min-w-full text-base">
                            <thead>
                                <tr className="bg-slate-900 text-white">
                                    <th className="text-left font-black p-4 uppercase text-xs tracking-[0.2em]">Description</th>
                                    <th className="text-right font-black p-4 uppercase text-xs tracking-[0.2em]">Amount</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                <tr className="hover:bg-slate-50 transition-colors">
                                    <td className="p-4 text-slate-600 font-medium">Base Rental Fee ({rentalDays} day(s))</td>
                                    <td className="p-4 text-right font-black text-slate-900">{formatCurrency(baseRentalFee)}</td>
                                </tr>
                                {(reservation.extras?.length || 0) > 0 && (
                                    <>
                                        {reservation.extras?.map((extra, i) => (
                                             <tr key={i} className="hover:bg-slate-50 transition-colors">
                                                <td className="p-4 text-slate-500 pl-8 text-sm italic">{extra.name}</td>
                                                <td className="p-4 text-right font-bold text-slate-900">
                                                    {extra.isComplementary ? 'Free' : formatCurrency(extra.dailyPrice * rentalDays)}
                                                </td>
                                            </tr>
                                        ))}
                                    </>
                                )}
                            </tbody>
                            <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                                <tr>
                                    <td className="text-right font-bold p-4 pt-6 text-slate-500 uppercase text-xs tracking-widest">Total Charges:</td>
                                    <td className="text-right font-black p-4 pt-6 text-slate-900 text-xl">{formatCurrency(totalCharges)}</td>
                                </tr>
                                <tr>
                                    <td className="text-right font-bold p-4 text-emerald-600 uppercase text-xs tracking-widest">Amount Paid:</td>
                                    <td className="text-right font-black p-4 text-emerald-600 text-xl">{formatCurrency(amountPaid)}</td>
                                </tr>
                                <tr className="bg-indigo-600 text-white">
                                    <td className="text-right font-black text-lg p-6 uppercase tracking-widest">Balance Due:</td>
                                    <td className="text-right font-black text-3xl p-6 tracking-tighter">{formatCurrency(balanceDue)}</td>
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
            
             <div className="mt-8 flex justify-between items-center no-print">
                <button
                    onClick={onClose}
                    className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300"
                >
                    Close
                </button>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleSendEmail}
                        disabled={!reservation.customerEmail}
                        className="px-4 py-2 bg-slate-600 text-white rounded-md hover:bg-slate-700 disabled:bg-gray-400 text-sm font-medium flex items-center gap-2"
                        title={!reservation.customerEmail ? "Customer email not available" : "Send receipt via email"}
                    >
                        <MailIcon /> Email
                    </button>
                    <button onClick={handleDownloadPDF} className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark flex items-center gap-2 text-sm font-medium">
                        <PdfIcon /> Download
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Receipt;
