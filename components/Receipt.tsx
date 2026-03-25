
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
        <div className="bg-white p-6 sm:p-10 rounded-lg shadow-lg font-sans voucher-container w-full max-w-2xl">
            <div className="printable-area">
                <header className="flex justify-between items-start pb-4 border-b-2 border-gray-800">
                    <div>
                        <img src={URDRIVE_LOGO_B64} alt={`${companyDetails.name} Logo`} className="h-8" />
                        <div className="mt-4 text-sm text-gray-600">
                            <p className="font-bold text-lg text-gray-800">{companyDetails.name}</p>
                            <p>{companyDetails.address}</p>
                            <p>TEL: {companyDetails.phone}</p>
                            <p>EMAIL: {companyDetails.email}</p>
                        </div>
                    </div>
                    <div className="text-right">
                        <h1 className="text-3xl font-bold uppercase text-gray-800">Receipt</h1>
                        <p className="text-sm text-gray-600 mt-1">
                            <strong>Receipt ID:</strong> RCPT-{reservation.bookingId || 'N/A'}
                        </p>
                         <p className="text-sm text-gray-600 mt-1">
                            <strong>Date:</strong> {new Date().toLocaleDateString()}
                        </p>
                    </div>
                </header>

                <section className="my-8">
                    <h2 className="text-lg font-semibold text-gray-800 border-b pb-2 mb-4">Transaction Details</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div>
                            <h3 className="font-bold text-primary mb-3">Billed To</h3>
                            <div className="space-y-3">
                                <DetailItem icon={<UserIcon />} label="Name" value={reservation.personName} />
                                <DetailItem icon={<MailIcon />} label="Email" value={reservation.customerEmail} />
                            </div>
                        </div>
                        <div>
                            <h3 className="font-bold text-primary mb-3">Rental Summary</h3>
                            <div className="space-y-3">
                                <DetailItem icon={<CarIcon />} label="Vehicle" value={reservation.carModel} />
                                <DetailItem icon={<CalendarIcon />} label="Rental Period" value={`${reservation.startDate} to ${reservation.endDate}`} />
                            </div>
                        </div>
                    </div>
                </section>
                
                <section>
                     <h2 className="text-lg font-semibold text-gray-800 border-b pb-2 mb-4">Payment Summary</h2>
                     <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead>
                                <tr className="border-b-2 border-gray-300">
                                    <th className="text-left font-semibold p-2">Description</th>
                                    <th className="text-right font-semibold p-2">Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr className="border-b border-gray-200">
                                    <td className="p-2 text-gray-600">Base Rental Fee ({rentalDays} day(s))</td>
                                    <td className="p-2 text-right font-medium">{formatCurrency(baseRentalFee)}</td>
                                </tr>
                                {(reservation.extras?.length || 0) > 0 && (
                                    <>
                                        {reservation.extras?.map((extra, i) => (
                                             <tr key={i} className="border-b border-gray-200">
                                                <td className="p-2 text-gray-600 pl-4">{extra.name}</td>
                                                <td className="p-2 text-right font-medium">
                                                    {extra.isComplementary ? 'Free' : formatCurrency(extra.dailyPrice * rentalDays)}
                                                </td>
                                            </tr>
                                        ))}
                                    </>
                                )}
                            </tbody>
                            <tfoot>
                                <tr>
                                    <td className="text-right font-bold p-2 pt-4">Total Charges:</td>
                                    <td className="text-right font-bold p-2 pt-4">{formatCurrency(totalCharges)}</td>
                                </tr>
                                <tr>
                                    <td className="text-right font-bold p-2 text-green-600">Amount Paid:</td>
                                    <td className="text-right font-bold p-2 text-green-600">{formatCurrency(amountPaid)}</td>
                                </tr>
                                <tr className="border-t-2 border-gray-800">
                                    <td className="text-right font-extrabold text-lg p-2">Balance Due:</td>
                                    <td className="text-right font-extrabold text-lg p-2">{formatCurrency(balanceDue)}</td>
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
