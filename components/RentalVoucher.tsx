import React from 'react';
import { Reservation, RentalSource, RentalLocation, CompanyDetails } from '../types';

interface RentalVoucherProps {
  reservation: Reservation;
  sources: RentalSource[];
  rentalLocations?: RentalLocation[];
  companyDetails: CompanyDetails;
  onClose: () => void;
}

const RentalVoucher: React.FC<RentalVoucherProps> = ({
  reservation,
  sources,
  rentalLocations = [],
  companyDetails,
  onClose,
}) => {
  const sourceName = sources.find(s => s.id === reservation.source)?.name || reservation.source || '—';
  const locationName = rentalLocations.find(l => l.id === reservation.locationName)?.name || reservation.locationName || '—';

  const formatDateTime = (dateStr: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
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
      month: 'long',
      day: 'numeric'
    });
  };

  const getDurationDays = () => {
    if (!reservation.startDate || !reservation.endDate) return 0;
    const start = new Date(reservation.startDate);
    const end = new Date(reservation.endDate);
    const diff = end.getTime() - start.getTime();
    return Math.max(1, Math.ceil(diff / (1000 * 3600 * 24)));
  };
  const durationDays = getDurationDays();

  const handlePrint = () => {
    // Open a new window for printing
    const printWindow = window.open('', '_blank', 'width=900,height=800');
    if (!printWindow) return;

    // Build HTML content
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Rental Voucher - ${reservation.bookingId}</title>
        <style>
          /* Reset and base */
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          body {
            font-family: 'Segoe UI', 'Roboto', Arial, sans-serif;
            background: white;
            color: #1e293b;
            padding: 0;
            margin: 0;
          }
          /* A4 page settings */
          @page {
            size: A4;
            margin: 1.5cm;
          }
          /* Main container */
          .voucher {
            max-width: 100%;
            background: white;
          }
          /* Header */
          .header {
            text-align: center;
            border-bottom: 2px solid #334155;
            padding-bottom: 8px;
            margin-bottom: 16px;
          }
          .header h1 {
            font-size: 24pt;
            margin: 0 0 4px;
            color: #0f172a;
          }
          .header p {
            font-size: 10pt;
            margin: 2px 0;
            color: #475569;
          }
          /* Title */
          .title {
            text-align: center;
            margin-bottom: 16px;
          }
          .title h2 {
            font-size: 18pt;
            margin: 0;
            color: #0f172a;
          }
          .title p {
            font-size: 10pt;
            color: #475569;
            margin-top: 4px;
          }
          /* Sections */
          .section {
            margin-bottom: 16px;
            break-inside: avoid;
          }
          .section h3 {
            font-size: 14pt;
            border-bottom: 1px solid #cbd5e1;
            padding-bottom: 2px;
            margin-bottom: 8px;
            color: #0f172a;
          }
          /* Two‑column grid */
          .grid-2 {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
          }
          .grid-item {
            break-inside: avoid;
          }
          .grid-item p {
            margin: 4px 0;
          }
          .label {
            font-weight: 600;
            font-size: 9pt;
            color: #334155;
          }
          .value {
            font-size: 10pt;
          }
          /* Financial section */
          .financial {
            margin-top: 4px;
          }
          .financial-row {
            display: flex;
            justify-content: space-between;
            margin: 4px 0;
          }
          .financial-total {
            display: flex;
            justify-content: space-between;
            font-weight: bold;
            font-size: 12pt;
            margin-top: 8px;
            padding-top: 4px;
            border-top: 1px solid #cbd5e1;
          }
          .extras-list {
            margin-left: 16px;
            margin-top: 4px;
          }
          .extras-list div {
            display: flex;
            justify-content: space-between;
            font-size: 9pt;
            margin-bottom: 2px;
          }
          /* Signatures */
          .signatures {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 30px;
            margin-top: 12px;
          }
          .signature-box {
            text-align: center;
          }
          .signature-line {
            border-top: 1px solid #334155;
            margin-top: 6px;
            padding-top: 4px;
            font-size: 8pt;
          }
          .signature-date {
            font-size: 7pt;
            color: #475569;
            margin-top: 2px;
          }
          /* Footer */
          .footer {
            text-align: center;
            font-size: 7pt;
            color: #64748b;
            margin-top: 16px;
            border-top: 1px solid #cbd5e1;
            padding-top: 6px;
          }
        </style>
      </head>
      <body>
        <div class="voucher">
          <div class="header">
            <h1>${companyDetails.name}</h1>
            <p>${companyDetails.address}</p>
            <p>Tel: ${companyDetails.phone} | Email: ${companyDetails.email}</p>
            <p>Tax Number: ${companyDetails.taxNumber}</p>
          </div>
          <div class="title">
            <h2>RENTAL VOUCHER / AGREEMENT</h2>
            <p>Booking ID: ${reservation.bookingId}</p>
          </div>
          <div class="section">
            <h3>Renter Information</h3>
            <div class="grid-2">
              <div class="grid-item"><p class="label">Full Name</p><p class="value">${reservation.personName}</p></div>
              <div class="grid-item"><p class="label">Contact Number</p><p class="value">${reservation.contactNumber || '—'}</p></div>
              <div class="grid-item"><p class="label">Email</p><p class="value">${reservation.customerEmail || '—'}</p></div>
              <div class="grid-item"><p class="label">Booking Source</p><p class="value">${sourceName}</p></div>
              <div class="grid-item"><p class="label">Booking Date</p><p class="value">${reservation.bookingDate ? formatDateOnly(reservation.bookingDate) : '—'}</p></div>
            </div>
          </div>
          <div class="section">
            <h3>Vehicle & Rental Details</h3>
            <div class="grid-2">
              <div class="grid-item"><p class="label">Vehicle Model</p><p class="value">${reservation.carModel}</p></div>
              <div class="grid-item"><p class="label">License Plate</p><p class="value">${reservation.licensePlate || '—'}</p></div>
              <div class="grid-item"><p class="label">Pickup Date/Time</p><p class="value">${formatDateTime(reservation.startDate)}</p></div>
              <div class="grid-item"><p class="label">Return Date/Time</p><p class="value">${formatDateTime(reservation.endDate)}</p></div>
              <div class="grid-item"><p class="label">Pickup Location</p><p class="value">${locationName}</p></div>
              <div class="grid-item"><p class="label">Return Location</p><p class="value">${locationName}</p></div>
              <div class="grid-item"><p class="label">Duration</p><p class="value">${durationDays} day${durationDays > 1 ? 's' : ''}</p></div>
            </div>
          </div>
          <div class="section">
            <h3>Financial Summary</h3>
            <div class="financial">
              <div class="financial-row"><span class="label">Base Rental Amount:</span><span>$${(reservation.baseAmount || reservation.amount || 0).toFixed(2)}</span></div>
              ${reservation.extras && reservation.extras.length > 0 ? `
                <div class="label" style="margin-top: 4px;">Extras:</div>
                <div class="extras-list">
                  ${reservation.extras.map(extra => `
                    <div><span>${extra.name}</span><span>$${extra.price.toFixed(2)}</span></div>
                  `).join('')}
                </div>
              ` : ''}
              <div class="financial-total"><span>Total Amount:</span><span>$${(reservation.amount || 0).toFixed(2)}</span></div>
              <div class="financial-row" style="margin-top: 4px;"><span class="label">Security Deposit:</span><span>$${(reservation.securityDeposit || 0).toFixed(2)}</span></div>
              <div class="financial-row"><span class="label">Excess:</span><span>$${(reservation.excess || 0).toFixed(2)}</span></div>
            </div>
          </div>
          ${reservation.notes ? `
          <div class="section">
            <h3>Notes</h3>
            <p class="value" style="white-space: pre-wrap;">${reservation.notes}</p>
          </div>
          ` : ''}
          <div class="section">
            <h3>Signatures</h3>
            <div class="signatures">
              <div class="signature-box">
                <div style="min-height: 30px; border-bottom: 1px solid #334155;">
                  ${reservation.pickupRenterSignature ? `<img src="${reservation.pickupRenterSignature}" style="max-height: 30px;" />` : '<div style="height: 20px;"></div>'}
                </div>
                <div class="signature-line">Renter Signature</div>
                <div class="signature-date">${reservation.pickupDateTime ? formatDateTime(reservation.pickupDateTime) : ''}</div>
              </div>
              <div class="signature-box">
                <div style="min-height: 30px; border-bottom: 1px solid #334155;">
                  ${reservation.pickupAgentSignature ? `<img src="${reservation.pickupAgentSignature}" style="max-height: 30px;" />` : '<div style="height: 20px;"></div>'}
                </div>
                <div class="signature-line">Agent Signature</div>
                <div class="signature-date">${reservation.pickupAgentName || ''}</div>
              </div>
            </div>
          </div>
          <div class="footer">
            <p>This is a legally binding rental agreement. Please read all terms and conditions.</p>
            <p>© ${new Date().getFullYear()} ${companyDetails.name}. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  // Modal preview (same as before, but not used for printing)
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

        {/* Screen preview content (kept as is) */}
        <div className="p-6">
          {/* ... same preview content as before ... */}
          <div className="text-center border-b-2 border-gray-800 pb-3 mb-5">
            <h1 className="text-2xl font-bold">{companyDetails.name}</h1>
            <p className="text-sm text-gray-600">{companyDetails.address}</p>
            <p className="text-sm text-gray-600">Tel: {companyDetails.phone} | Email: {companyDetails.email}</p>
            <p className="text-sm text-gray-600">Tax Number: {companyDetails.taxNumber}</p>
          </div>
          <div className="text-center mb-5">
            <h2 className="text-xl font-semibold">RENTAL VOUCHER / AGREEMENT</h2>
            <p className="text-sm text-gray-500">Booking ID: {reservation.bookingId}</p>
          </div>
          <div className="mb-5">
            <h3 className="text-lg font-semibold border-b border-gray-300 pb-1 mb-2">Renter Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div><p className="text-sm text-gray-600">Full Name</p><p className="font-medium">{reservation.personName}</p></div>
              <div><p className="text-sm text-gray-600">Contact Number</p><p className="font-medium">{reservation.contactNumber || '—'}</p></div>
              <div><p className="text-sm text-gray-600">Email</p><p className="font-medium">{reservation.customerEmail || '—'}</p></div>
              <div><p className="text-sm text-gray-600">Booking Source</p><p className="font-medium">{sourceName}</p></div>
              <div><p className="text-sm text-gray-600">Booking Date</p><p className="font-medium">{reservation.bookingDate ? formatDateOnly(reservation.bookingDate) : '—'}</p></div>
            </div>
          </div>
          <div className="mb-5">
            <h3 className="text-lg font-semibold border-b border-gray-300 pb-1 mb-2">Vehicle & Rental Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div><p className="text-sm text-gray-600">Vehicle Model</p><p className="font-medium">{reservation.carModel}</p></div>
              <div><p className="text-sm text-gray-600">License Plate</p><p className="font-medium">{reservation.licensePlate || '—'}</p></div>
              <div><p className="text-sm text-gray-600">Pickup Date/Time</p><p className="font-medium">{formatDateTime(reservation.startDate)}</p></div>
              <div><p className="text-sm text-gray-600">Return Date/Time</p><p className="font-medium">{formatDateTime(reservation.endDate)}</p></div>
              <div><p className="text-sm text-gray-600">Pickup Location</p><p className="font-medium">{locationName}</p></div>
              <div><p className="text-sm text-gray-600">Return Location</p><p className="font-medium">{locationName}</p></div>
              <div><p className="text-sm text-gray-600">Duration</p><p className="font-medium">{durationDays} day{durationDays > 1 ? 's' : ''}</p></div>
            </div>
          </div>
          <div className="mb-5">
            <h3 className="text-lg font-semibold border-b border-gray-300 pb-1 mb-2">Financial Summary</h3>
            <div className="space-y-1">
              <div className="flex justify-between"><span>Base Rental Amount:</span><span>${(reservation.baseAmount || reservation.amount || 0).toFixed(2)}</span></div>
              {reservation.extras && reservation.extras.length > 0 && (
                <>
                  <div className="font-medium mt-2">Extras:</div>
                  {reservation.extras.map((extra, idx) => (
                    <div key={idx} className="flex justify-between text-sm ml-4"><span>{extra.name}</span><span>${extra.price.toFixed(2)}</span></div>
                  ))}
                </>
              )}
              <div className="flex justify-between font-bold text-lg border-t border-gray-300 pt-2 mt-2"><span>Total Amount:</span><span>${(reservation.amount || 0).toFixed(2)}</span></div>
              <div className="flex justify-between text-sm"><span>Security Deposit:</span><span>${(reservation.securityDeposit || 0).toFixed(2)}</span></div>
              <div className="flex justify-between text-sm"><span>Excess:</span><span>${(reservation.excess || 0).toFixed(2)}</span></div>
            </div>
          </div>
          {reservation.notes && (
            <div className="mb-5">
              <h3 className="text-lg font-semibold border-b border-gray-300 pb-1 mb-2">Notes</h3>
              <p className="text-sm whitespace-pre-wrap">{reservation.notes}</p>
            </div>
          )}
          <div className="mb-5">
            <h3 className="text-lg font-semibold border-b border-gray-300 pb-1 mb-2">Signatures</h3>
            <div className="grid grid-cols-2 gap-8 mt-4">
              <div>
                <div className="border-b border-gray-400 mb-1 pb-1">
                  {reservation.pickupRenterSignature ? (
                    <img src={reservation.pickupRenterSignature} alt="Renter signature" className="max-h-16" />
                  ) : <div className="h-10"></div>}
                </div>
                <p className="text-sm text-center">Renter Signature</p>
                <p className="text-xs text-center text-gray-500">{reservation.pickupDateTime ? formatDateTime(reservation.pickupDateTime) : ''}</p>
              </div>
              <div>
                <div className="border-b border-gray-400 mb-1 pb-1">
                  {reservation.pickupAgentSignature ? (
                    <img src={reservation.pickupAgentSignature} alt="Agent signature" className="max-h-16" />
                  ) : <div className="h-10"></div>}
                </div>
                <p className="text-sm text-center">Agent Signature</p>
                <p className="text-xs text-center text-gray-500">{reservation.pickupAgentName || ''}</p>
              </div>
            </div>
          </div>
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
