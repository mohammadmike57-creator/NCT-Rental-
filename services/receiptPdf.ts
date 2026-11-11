import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Reservation } from '../types';
import { URDRIVE_LOGO_B64 } from '../constants';
import { addLogo } from './pdfImage';

const usd = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);

/** Downloads the customer's receipt for a rental as a PDF. */
export async function downloadReceiptPdf(r: Reservation, rentalDays: number): Promise<void> {
  const doc = new jsPDF();
  const extrasTotal = r.extras?.reduce((sum, extra) => extra.isComplementary ? sum : sum + (extra.dailyPrice * rentalDays), 0) ?? 0;
  const baseRentalFee = r.baseAmount ?? ((r.amount || 0) - extrasTotal);
  const totalCharges = baseRentalFee + extrasTotal;

  await addLogo(doc, URDRIVE_LOGO_B64, 14, 15, 60, 10);
  doc.setFontSize(22);
  doc.text('Receipt', 200, 22, { align: 'right' });
  doc.setFontSize(10);
  doc.text(`Receipt ID: RCPT-${r.bookingId}`, 200, 30, { align: 'right' });
  doc.text(`Date: ${new Date().toLocaleDateString()}`, 200, 35, { align: 'right' });

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Billed To:', 14, 50);
  doc.setFont('helvetica', 'normal');
  doc.text(r.personName, 14, 56);
  doc.text(r.customerEmail || 'No email', 14, 62);

  const tableBody = [
    ['Rental Fee', usd(baseRentalFee)],
    ...(r.extras || []).map(extra => [
      `Extra: ${extra.name}`,
      extra.isComplementary ? 'Free' : usd(extra.dailyPrice * rentalDays),
    ]),
  ];

  autoTable(doc, {
    startY: 75,
    head: [['Description', 'Amount']],
    body: tableBody,
    foot: [['Total Charges', usd(totalCharges)], ['Amount Paid', usd(totalCharges)], ['Balance Due', usd(0)]],
    theme: 'striped',
    headStyles: { fillColor: [71, 85, 105] },
    footStyles: { fontStyle: 'bold', fillColor: [241, 245, 249] },
  });

  doc.save(`receipt-${r.bookingId}.pdf`);
}
