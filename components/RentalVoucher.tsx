import React, { useRef } from 'react';
import { Reservation, RentalSource, CompanyDetails } from '../types';

interface RentalVoucherProps {
  reservation: Reservation;
  sources: RentalSource[];
  companyDetails: CompanyDetails;
  onClose: () => void;
}

const RentalVoucher: React.FC<RentalVoucherProps> = ({
  reservation,
  sources,
  companyDetails,
  onClose,
}) => {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (printWindow && printRef.current) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Rental Voucher - ${reservation.bookingId}</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; }
              .voucher { max-width: 800px; margin: auto; border: 1px solid #ccc; padding: 20px; }
              .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; }
              .header h1 { margin: 0; color: #333; }
              .header p { margin: 5px 0; color: #666; }
              .section { margin: 20px 0; }
              .section h3 { border-bottom: 1px solid #ccc; padding-bottom: 5px; color: #444; }
              .row { display: flex; margin: 5px 0; }
              .label { font-weight: bold; width: 150px; }
              .value { flex: 1; }
              .signatures { display: flex; justify-content: space-between; margin-top: 40px; }
              .signature-line { border-top: 1px solid #333; width: 200px; text-align: center; padding-top: 5px; }
              .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #777; }
            </style>
          </head>
          <body>${printRef.current.innerHTML}</body>
        </html>
      `);
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDateOnly = (dateStr: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const sourceName = sources.find(s => s.id === reservation.source)?.name || reservation.source || '—';

  // Calculate duration in days
  const getDurationDays = () => {
    if (!reservation.startDate || !reservation.endDate) return 0;
    const start = new Date(reservation.startDate);
    const end = new Date(reservation.endDate);
    const diff = end.getTime() - start.getTime();
    return Math.max(1, Math.ceil(diff / (1000 * 3600 * 24)));
  };

  const durationDays = getDurationDays();

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="bg-white rounded-[3rem] shadow-2xl max-w-5xl w-full max-h-[95vh] overflow-y-auto border border-slate-200">
        <div className="sticky top-0 bg-white/80 backdrop-blur-md border-b border-slate-100 px-10 py-6 flex justify-between items-center z-20">
          <h2 className="text-3xl font-black text-slate-900 tracking-tighter">Rental Agreement</h2>
          <div className="flex gap-4">
            <button
              onClick={handlePrint}
              className="px-8 py-3 bg-indigo-600 text-white rounded-2xl font-bold text-sm hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 active:scale-95"
            >
              Print / PDF
            </button>
            <button
              onClick={onClose}
              className="px-8 py-3 border border-slate-200 rounded-2xl text-slate-600 font-bold text-sm hover:bg-slate-50 transition-all active:scale-95"
            >
              Close
            </button>
          </div>
        </div>

        <div ref={printRef} className="p-12">
          {/* Header */}
          <div className="text-center border-b-4 border-slate-900 pb-8 mb-10">
            <h1 className="text-4xl font-black text-slate-900 mb-2 uppercase tracking-tight">{companyDetails.name}</h1>
            <p className="text-base text-slate-500 font-medium">{companyDetails.address}</p>
            <p className="text-sm text-gray-600">Tel: {companyDetails.phone} | Email: {companyDetails.email}</p>
            <p className="text-sm text-gray-600">Tax Number: {companyDetails.taxNumber}</p>
          </div>

          {/* Voucher Title */}
          <div className="text-center mb-10">
            <h2 className="text-3xl font-black text-slate-800 tracking-tight">RENTAL VOUCHER / AGREEMENT</h2>
            <p className="text-lg text-slate-500 font-bold mt-2">Booking ID: {reservation.bookingId}</p>
          </div>

          {/* Renter Information */}
          <div className="mb-10 bg-slate-50 p-8 rounded-[2rem] border border-slate-100">
            <h3 className="text-xl font-black border-b-2 border-slate-200 pb-4 mb-6 uppercase tracking-widest text-slate-700">Renter Information</h3>
            <div className="grid grid-cols-2 gap-8">
              <div>
                <p className="text-xs text-slate-400 font-black uppercase tracking-widest mb-1">Full Name</p>
                <p className="text-xl font-bold text-slate-900">{reservation.personName}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 font-black uppercase tracking-widest mb-1">Contact Number</p>
                <p className="text-xl font-bold text-slate-900">{reservation.contactNumber || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 font-black uppercase tracking-widest mb-1">Email Address</p>
                <p className="text-xl font-bold text-slate-900">{reservation.customerEmail || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 font-black uppercase tracking-widest mb-1">Booking Source</p>
                <p className="text-xl font-bold text-slate-900">{sourceName}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 font-black uppercase tracking-widest mb-1">Booking Date</p>
                <p className="text-xl font-bold text-slate-900">{reservation.bookingDate ? formatDateOnly(reservation.bookingDate) : '—'}</p>
              </div>
            </div>
          </div>

          {/* Vehicle & Rental Details */}
          <div className="mb-10 bg-slate-900 text-white p-10 rounded-[2.5rem] shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -mr-32 -mt-32" />
            <h3 className="text-xl font-black border-b border-white/20 pb-4 mb-8 uppercase tracking-widest text-slate-300 relative z-10">Vehicle & Rental Details</h3>
            <div className="grid grid-cols-2 gap-x-12 gap-y-8 relative z-10">
              <div>
                <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-2">Vehicle Model</p>
                <p className="text-2xl font-black">{reservation.carModel}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-2">License Plate</p>
                <p className="text-2xl font-black text-indigo-400">{reservation.licensePlate || '—'}</p>
              </div>
              <div className="border-l-2 border-emerald-500/50 pl-6">
                <p className="text-[10px] text-emerald-400 font-black uppercase tracking-widest mb-2">Pickup Date/Time</p>
                <p className="text-xl font-bold">{formatDate(reservation.startDate)}</p>
              </div>
              <div className="border-l-2 border-rose-500/50 pl-6">
                <p className="text-[10px] text-rose-400 font-black uppercase tracking-widest mb-2">Return Date/Time</p>
                <p className="text-xl font-bold">{formatDate(reservation.endDate)}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-2">Pickup Location</p>
                <p className="text-lg font-bold">{reservation.locationName || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-2">Duration</p>
                <p className="text-2xl font-black text-indigo-300">{durationDays} day{durationDays > 1 ? 's' : ''}</p>
              </div>
            </div>
          </div>

          {/* Financial Summary */}
          <div className="mb-10 bg-slate-50 p-8 rounded-[2rem] border border-slate-100">
            <h3 className="text-xl font-black border-b-2 border-slate-200 pb-4 mb-6 uppercase tracking-widest text-slate-700">Financial Summary</h3>
            <div className="space-y-4">
              <div className="flex justify-between text-lg">
                <span className="text-slate-500 font-bold uppercase tracking-widest text-xs">Rental Amount:</span>
                <span className="font-black text-slate-900">${reservation.amount?.toFixed(2) || '0.00'}</span>
              </div>
              {reservation.selectedExtras && reservation.selectedExtras.length > 0 && (
                <>
                  <div className="font-black text-xs text-indigo-600 uppercase tracking-widest mt-4">Selected Extras:</div>
                  {reservation.selectedExtras.map((extraId, index) => {
                    return (
                      <div key={index} className="flex justify-between text-base">
                        <span className="text-slate-600">{extraId}</span>
                        <span className="font-bold text-emerald-600">Included</span>
                      </div>
                    );
                  })}
                </>
              )}
              <div className="flex justify-between font-black text-3xl border-t-2 border-slate-200 pt-6 mt-6 text-slate-900 tracking-tighter">
                <span>Total Amount:</span>
                <span className="text-indigo-600">${reservation.amount?.toFixed(2) || '0.00'}</span>
              </div>
              <div className="grid grid-cols-2 gap-8 mt-6">
                <div className="p-4 bg-white rounded-2xl border border-slate-100 shadow-sm">
                  <span className="block text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">Security Deposit:</span>
                  <span className="text-xl font-black text-slate-800">${reservation.securityDeposit?.toFixed(2) || '0.00'}</span>
                </div>
                <div className="p-4 bg-white rounded-2xl border border-slate-100 shadow-sm">
                  <span className="block text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">Insurance Excess:</span>
                  <span className="text-xl font-black text-slate-800">${reservation.excess?.toFixed(2) || '0.00'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Notes */}
          {reservation.notes && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold border-b border-gray-300 pb-2 mb-3">Notes</h3>
              <p className="text-sm whitespace-pre-wrap">{reservation.notes}</p>
            </div>
          )}

          {/* Signatures */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold border-b border-gray-300 pb-2 mb-3">Signatures</h3>
            <div className="grid grid-cols-2 gap-8 mt-8">
              <div>
                <div className="border-b border-gray-400 mb-1 pb-1">
                  {reservation.pickupRenterSignature ? (
                    <img src={reservation.pickupRenterSignature} alt="Renter signature" className="max-h-16" />
                  ) : (
                    <div className="h-10"></div>
                  )}
                </div>
                <p className="text-sm text-center">Renter Signature</p>
                <p className="text-xs text-center text-gray-500">
                  {reservation.pickupDateTime ? formatDate(reservation.pickupDateTime) : ''}
                </p>
              </div>
              <div>
                <div className="border-b border-gray-400 mb-1 pb-1">
                  {reservation.pickupAgentSignature ? (
                    <img src={reservation.pickupAgentSignature} alt="Agent signature" className="max-h-16" />
                  ) : (
                    <div className="h-10"></div>
                  )}
                </div>
                <p className="text-sm text-center">Agent Signature</p>
                <p className="text-xs text-center text-gray-500">{reservation.pickupAgentName || ''}</p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="text-center text-xs text-gray-500 mt-8 pt-4 border-t border-gray-200">
            <p>This is a legally binding rental agreement. Please read all terms and conditions.</p>
            <p>© {new Date().getFullYear()} {companyDetails.name}. All rights reserved.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RentalVoucher;
