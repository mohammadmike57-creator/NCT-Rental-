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
    <div className="fixed inset-0 z-50 overflow-y-auto bg-gray-500 bg-opacity-75 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
          <h2 className="text-xl font-bold text-gray-800">Rental Voucher</h2>
          <div className="space-x-2">
            <button
              onClick={handlePrint}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Print / PDF
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50"
            >
              Close
            </button>
          </div>
        </div>

        <div ref={printRef} className="p-6">
          {/* Header */}
          <div className="text-center border-b-2 border-gray-800 pb-4 mb-6">
            <h1 className="text-2xl font-bold text-gray-900">{companyDetails.name}</h1>
            <p className="text-sm text-gray-600">{companyDetails.address}</p>
            <p className="text-sm text-gray-600">Tel: {companyDetails.phone} | Email: {companyDetails.email}</p>
            <p className="text-sm text-gray-600">Tax Number: {companyDetails.taxNumber}</p>
          </div>

          {/* Voucher Title */}
          <div className="text-center mb-6">
            <h2 className="text-xl font-semibold text-gray-800">RENTAL VOUCHER / AGREEMENT</h2>
            <p className="text-sm text-gray-500">Booking ID: {reservation.bookingId}</p>
          </div>

          {/* Renter Information */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold border-b border-gray-300 pb-2 mb-3">Renter Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600">Full Name</p>
                <p className="font-medium">{reservation.personName}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Contact Number</p>
                <p className="font-medium">{reservation.contactNumber || '—'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Email</p>
                <p className="font-medium">{reservation.customerEmail || '—'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Booking Source</p>
                <p className="font-medium">{sourceName}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Booking Date</p>
                <p className="font-medium">{reservation.bookingDate ? formatDateOnly(reservation.bookingDate) : '—'}</p>
              </div>
            </div>
          </div>

          {/* Vehicle & Rental Details */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold border-b border-gray-300 pb-2 mb-3">Vehicle & Rental Details</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600">Vehicle Model</p>
                <p className="font-medium">{reservation.carModel}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">License Plate</p>
                <p className="font-medium">{reservation.licensePlate || '—'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Pickup Date/Time</p>
                <p className="font-medium">{formatDate(reservation.startDate)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Return Date/Time</p>
                <p className="font-medium">{formatDate(reservation.endDate)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Pickup Location</p>
                <p className="font-medium">{reservation.locationName || '—'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Return Location</p>
                <p className="font-medium">{reservation.locationName || '—'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Duration</p>
                <p className="font-medium">{durationDays} day{durationDays > 1 ? 's' : ''}</p>
              </div>
            </div>
          </div>

          {/* Financial Summary */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold border-b border-gray-300 pb-2 mb-3">Financial Summary</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>Rental Amount:</span>
                <span>${reservation.amount?.toFixed(2) || '0.00'}</span>
              </div>
              {reservation.selectedExtras && reservation.selectedExtras.length > 0 && (
                <>
                  <div className="font-medium mt-2">Extras:</div>
                  {reservation.selectedExtras.map((extraId, index) => {
                    // We don't have extra details here; just show ID
                    return (
                      <div key={index} className="flex justify-between text-sm">
                        <span>Extra: {extraId}</span>
                        <span>Included</span>
                      </div>
                    );
                  })}
                </>
              )}
              <div className="flex justify-between font-bold text-lg border-t border-gray-300 pt-2 mt-2">
                <span>Total Amount:</span>
                <span>${reservation.amount?.toFixed(2) || '0.00'}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-600">
                <span>Security Deposit:</span>
                <span>${reservation.securityDeposit?.toFixed(2) || '0.00'}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-600">
                <span>Excess:</span>
                <span>${reservation.excess?.toFixed(2) || '0.00'}</span>
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
