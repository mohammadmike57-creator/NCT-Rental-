import React, { useState, useMemo, useEffect } from 'react';
import { TrafficTicket, TrafficTicketStatus, AppData, Reservation, User, UserPermission, CompanyDetails } from '../types';
import { PlusIcon, TrashIcon, EditIcon, SaveIcon, CancelIcon, ExportIcon, PaperAirplaneIcon, UploadIcon, DocumentTextIcon, ShareIcon } from './icons';
import ConfirmationDialog from './ConfirmationDialog';
import SecurityKeyModal from './SecurityKeyModal';

interface TrafficTicketsProps {
  tickets: TrafficTicket[];
  allData: AppData;
  onAddTicket: (newTicket: Omit<TrafficTicket, 'id'>) => void;
  onUpdateTicket: (updatedTicket: TrafficTicket) => void;
  onDeleteTicket: (ticketId: string) => void;
  currentUser: User | null;
  companyDetails: CompanyDetails;
}

const emptyTicket: Omit<TrafficTicket, 'id'> = {
  bookingId: '',
  ticketDate: new Date().toISOString().split('T')[0],
  amount: 0,
  details: '',
  status: TrafficTicketStatus.NOT_COLLECTED,
};

const fileToBase64 = (file: File): Promise<{ data: string; name: string }> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve({ data: reader.result as string, name: file.name });
        reader.onerror = error => reject(error);
    });
};

// Helper function to convert base64 to Blob
const base64ToBlob = async (base64: string): Promise<Blob> => {
    const res = await fetch(base64);
    const blob = await res.blob();
    return blob;
};

// Download handler
const handleDownload = async (base64Data: string, filename: string) => {
    try {
        const blob = await base64ToBlob(base64Data);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Download failed:', error);
        alert('Could not download the file.');
    }
};

// Share handler
const handleShare = async (base64Data: string, filename: string) => {
    try {
        const blob = await base64ToBlob(base64Data);
        const file = new File([blob], filename, { type: blob.type });

        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
                files: [file],
                title: filename,
                text: `Check out this document: ${filename}`,
            });
        } else {
            alert('Sharing is not supported on this browser, or this file type cannot be shared.');
        }
    } catch (error) {
        if ((error as DOMException).name !== 'AbortError') {
             alert('Could not share the file.');
        }
    }
};

const FileActions: React.FC<{ fileData?: string; fileName?: string; }> = ({ fileData, fileName }) => {
    if (!fileData || !fileName) {
        return <span className="text-slate-300">-</span>;
    }

    const showShare = 'share' in navigator && 'canShare' in navigator;
    const btn = "p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800";

    return (
        <div className="inline-flex items-center gap-0.5">
            <a href={fileData} target="_blank" rel="noopener noreferrer" title={`View ${fileName}`} aria-label={`View ${fileName}`} className={btn}>
                <DocumentTextIcon className="w-4 h-4" />
            </a>
            <button type="button" onClick={() => handleDownload(fileData, fileName)} title={`Download ${fileName}`} aria-label={`Download ${fileName}`} className={btn}>
                <ExportIcon className="w-4 h-4" />
            </button>
            {showShare && (
                 <button type="button" onClick={() => handleShare(fileData, fileName)} title={`Share ${fileName}`} aria-label={`Share ${fileName}`} className={btn}>
                    <ShareIcon className="w-4 h-4" />
                </button>
            )}
        </div>
    );
};

const inputCls = "w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none";
const editCls = "w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none";
const labelCls = "block text-xs font-semibold text-slate-600 mb-1.5";
const money = (v: unknown) => {
    const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
    return (Number.isFinite(n) ? n : 0).toFixed(2);
};

const TrafficTickets: React.FC<TrafficTicketsProps> = ({ tickets, allData, onAddTicket, onUpdateTicket, onDeleteTicket, currentUser, companyDetails }) => {
  const [newTicketData, setNewTicketData] = useState<Omit<TrafficTicket, 'id'>>(emptyTicket);
  const [foundReservation, setFoundReservation] = useState<Reservation | null>(null);
  const [validationError, setValidationError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [originalTicket, setOriginalTicket] = useState<TrafficTicket | null>(null);
  const [ticketToDelete, setTicketToDelete] = useState<string | null>(null);
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ type: 'edit' | 'delete'; payload: any } | null>(null);
  const [statusFilter, setStatusFilter] = useState<TrafficTicketStatus | ''>('');
  const [showAddForm, setShowAddForm] = useState(false);
  
  const hasManagePermission = currentUser?.permissions.includes(UserPermission.ACTION_TRAFFIC_TICKETS_MANAGE);

  const findReservationByBookingId = (bookingId: string): Reservation | null => {
    if (!bookingId) return null;
    const trimmedId = bookingId.trim().toLowerCase();
    for (const year in allData) {
      for (const month in allData[year]) {
        const reservation = allData[year][month].find(r => r.bookingId && r.bookingId.trim().toLowerCase() === trimmedId);
        if (reservation) {
          return reservation;
        }
      }
    }
    return null;
  };

  useEffect(() => {
    const handler = setTimeout(() => {
      if (newTicketData.bookingId) {
        const found = findReservationByBookingId(newTicketData.bookingId);
        setFoundReservation(found);
      } else {
        setFoundReservation(null);
      }
    }, 300); // Debounce search
    return () => clearTimeout(handler);
  }, [newTicketData.bookingId, allData]);
  
  const filteredTickets = useMemo(() => {
    if (!statusFilter) {
        return tickets;
    }
    return tickets.filter(ticket => ticket.status === statusFilter);
  }, [tickets, statusFilter]);
  
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
        const file = e.target.files[0];
        try {
            const { data, name } = await fileToBase64(file);
            setNewTicketData(prev => ({ ...prev, ticketDocument: data, ticketDocumentFilename: name }));
        } catch (error) {
            console.error("Error converting file to Base64", error);
            alert("Failed to upload file. Please try again.");
        }
    }
  };

  const handleInputChange = (field: keyof Omit<TrafficTicket, 'id'>, value: any) => {
    setNewTicketData(prev => ({ ...prev, [field]: value }));
  };
  
  const handleUpdateChange = (id: string, field: keyof TrafficTicket, value: any) => {
      const ticketToUpdate = tickets.find(t => t.id === id);
      if (ticketToUpdate) {
        onUpdateTicket({ ...ticketToUpdate, [field]: value });
      }
  };
  
   const handleUpdateFileChange = async (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const { data, name } = await fileToBase64(file);
            const ticketToUpdate = tickets.find(t => t.id === id);
            if (ticketToUpdate) {
                onUpdateTicket({ ...ticketToUpdate, ticketDocument: data, ticketDocumentFilename: name });
            }
        }
    };
    
    const handleRemoveFile = (id: string) => {
        const ticketToUpdate = tickets.find(t => t.id === id);
        if (ticketToUpdate) {
            const { ticketDocument, ticketDocumentFilename, ...rest } = ticketToUpdate;
            onUpdateTicket({ ...rest });
        }
    }

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!foundReservation) {
      setValidationError('A valid and existing Booking ID is required.');
      return;
    }
    if (newTicketData.amount <= 0) {
      setValidationError('Ticket amount must be greater than zero.');
      return;
    }
    setValidationError('');
    onAddTicket(newTicketData);
    setNewTicketData(emptyTicket);
    setFoundReservation(null);
    setShowAddForm(false);
  };

  const handleEditClick = (ticket: TrafficTicket) => {
    setPendingAction({ type: 'edit', payload: ticket });
    setIsKeyModalOpen(true);
  };
  
  const handleDeleteClick = (ticketId: string) => {
    setPendingAction({ type: 'delete', payload: ticketId });
    setIsKeyModalOpen(true);
  };
  
  const handleKeySuccess = () => {
    if (!pendingAction) return;
    if (pendingAction.type === 'edit') {
      setOriginalTicket(pendingAction.payload);
      setEditingId(pendingAction.payload.id);
    } else if (pendingAction.type === 'delete') {
      setTicketToDelete(pendingAction.payload);
    }
    setIsKeyModalOpen(false);
    setPendingAction(null);
  };

  const handleSaveEdit = () => {
    setEditingId(null);
    setOriginalTicket(null);
  };

  const handleCancelEdit = () => {
    if (originalTicket) {
      onUpdateTicket(originalTicket);
    }
    setEditingId(null);
    setOriginalTicket(null);
  };

  const handleConfirmDelete = () => {
    if (ticketToDelete) {
      onDeleteTicket(ticketToDelete);
    }
    setTicketToDelete(null);
  };
  
  const handleExportCSV = () => {
    if (filteredTickets.length === 0) {
        alert('No tickets to export for the current filter selection.');
        return;
    }

    const headers = [
        'Ticket Date', 'Booking ID', 'Renter Name', 'Car Model', 'Rental Period',
        'Amount (JOD)', 'Status', 'Details'
    ];

    const escapeCSV = (str: any): string => {
        const stringified = String(str ?? '');
        if (stringified.includes(',') || stringified.includes('"') || stringified.includes('\n')) {
            return `"${stringified.replace(/"/g, '""')}"`;
        }
        return stringified;
    };

    const rows = filteredTickets.map(ticket => {
        const res = findReservationByBookingId(ticket.bookingId);
        return [
            escapeCSV(ticket.ticketDate),
            escapeCSV(ticket.bookingId),
            escapeCSV(res?.personName || 'N/A'),
            escapeCSV(res?.carModel || 'N/A'),
            escapeCSV(res ? `${res.startDate} to ${res.endDate}` : 'N/A'),
            escapeCSV(money(ticket.amount)),
            escapeCSV(ticket.status),
            escapeCSV(ticket.details),
        ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'traffic_tickets.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleSendEmail = (type: 'claim' | 'receipt', ticket: TrafficTicket, renter: Reservation) => {
    const signature = `\n\nSincerely,\nUR-Drive Jordan\n${companyDetails.address}\nPhone: ${companyDetails.phone}\nEmail: ${companyDetails.email}`;

    const subject = type === 'claim'
        ? `Action Required: Traffic Ticket for Rental ${renter.bookingId}`
        : `Receipt for Traffic Ticket Payment - Rental ${renter.bookingId}`;
    
    const body = type === 'claim'
        ? `Dear ${renter.personName},\n\nThis notice is regarding a traffic violation that occurred during your rental of a ${renter.carModel} (Booking ID: ${renter.bookingId}).\n\nTicket Details:\n- Violation Date: ${ticket.ticketDate}\n- Description: ${ticket.details}\n- Amount Due: ${money(ticket.amount)} JOD\n\nPlease contact our office at your earliest convenience to settle this amount.${signature.replace('Sincerely', 'Thank you')}`
        : `Dear ${renter.personName},\n\nThis email confirms that we have received your payment for the traffic ticket associated with your rental (Booking ID: ${renter.bookingId}).\n\nPayment Details:\n- Violation Date: ${ticket.ticketDate}\n- Amount Paid: ${money(ticket.amount)} JOD\n- Status: COLLECTED\n\nThank you for your prompt attention to this matter.${signature}`;

    window.location.href = `mailto:${renter.customerEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };


  const stats = useMemo(() => {
    let collected = 0, outstanding = 0, outstandingCount = 0;
    tickets.forEach(t => {
      const amt = parseFloat(money(t.amount));
      if (t.status === TrafficTicketStatus.COLLECTED) collected += amt;
      else { outstanding += amt; outstandingCount += 1; }
    });
    return { total: tickets.length, collected, outstanding, outstandingCount };
  }, [tickets]);

  const rows = filteredTickets.map(ticket => ({ ticket, res: findReservationByBookingId(ticket.bookingId) }));

  const statusPill = (status: TrafficTicketStatus) => (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset whitespace-nowrap ${status === TrafficTicketStatus.COLLECTED ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-amber-50 text-amber-700 ring-amber-200'}`}>
      {status === TrafficTicketStatus.COLLECTED ? 'Collected' : 'Not collected'}
    </span>
  );

  const statusSelect = (ticket: TrafficTicket) => (
    <select value={ticket.status} onChange={e => handleUpdateChange(ticket.id, 'status', e.target.value)} className={editCls}>
      <option value={TrafficTicketStatus.NOT_COLLECTED}>Not Collected</option>
      <option value={TrafficTicketStatus.COLLECTED}>Collected</option>
    </select>
  );

  const renderDocument = (ticket: TrafficTicket, isEditing: boolean, view: 'd' | 'm') => {
    if (isEditing && hasManagePermission) {
      return ticket.ticketDocument ? (
        <div className="inline-flex items-center gap-0.5">
          <a href={ticket.ticketDocument} target="_blank" rel="noopener noreferrer" title={ticket.ticketDocumentFilename} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"><DocumentTextIcon className="w-4 h-4" /></a>
          <button type="button" onClick={() => handleRemoveFile(ticket.id)} className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50" title="Remove Document"><TrashIcon className="w-4 h-4" /></button>
        </div>
      ) : (
        <>
          <input type="file" id={`edit-upload-${view}-${ticket.id}`} className="hidden" onChange={(e) => handleUpdateFileChange(ticket.id, e)} accept="image/*,.pdf" />
          <label htmlFor={`edit-upload-${view}-${ticket.id}`} className="cursor-pointer inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg ring-1 ring-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50" title="Upload Document"><UploadIcon className="w-4 h-4" /> Upload</label>
        </>
      );
    }
    return <FileActions fileData={ticket.ticketDocument} fileName={ticket.ticketDocumentFilename} />;
  };

  const renderActions = (ticket: TrafficTicket, res: Reservation | null, isEditing: boolean, full = false) => {
    const canSendEmail = !!(res && res.customerEmail);
    if (isEditing && hasManagePermission) {
      return (
        <div className={`${full ? 'grid grid-cols-2' : 'inline-flex'} gap-2`}>
          <button type="button" onClick={handleSaveEdit} className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700" title="Save"><SaveIcon className="w-4 h-4" /> Done</button>
          <button type="button" onClick={handleCancelEdit} className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-white ring-1 ring-slate-200 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-50" title="Cancel"><CancelIcon className="w-4 h-4" /> Cancel</button>
        </div>
      );
    }
    const isClaim = ticket.status === TrafficTicketStatus.NOT_COLLECTED;
    return (
      <div className={`flex items-center gap-2 ${full ? '' : 'justify-end'}`}>
        <button
          type="button"
          onClick={() => handleSendEmail(isClaim ? 'claim' : 'receipt', ticket, res!)}
          disabled={!canSendEmail}
          className={`inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold ring-1 ring-inset whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed ${full ? 'flex-1' : ''} ${isClaim ? 'bg-amber-50 text-amber-700 ring-amber-200 hover:bg-amber-100' : 'bg-emerald-50 text-emerald-700 ring-emerald-200 hover:bg-emerald-100'}`}
          title={canSendEmail ? (isClaim ? 'Send claim email to renter' : 'Send receipt email to renter') : 'Renter email not found in voucher'}
        >
          <PaperAirplaneIcon className="w-4 h-4" /> {isClaim ? 'Send claim' : 'Send receipt'}
        </button>
        {hasManagePermission && (
          <>
            <button type="button" onClick={() => handleEditClick(ticket)} className="p-2 rounded-lg text-slate-500 hover:bg-indigo-50 hover:text-indigo-600" title="Edit" aria-label="Edit ticket"><EditIcon className="w-4 h-4" /></button>
            <button type="button" onClick={() => handleDeleteClick(ticket.id)} className="p-2 rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-600" title="Delete" aria-label="Delete ticket"><TrashIcon className="w-4 h-4" /></button>
          </>
        )}
      </div>
    );
  };

  const filterOptions: { key: TrafficTicketStatus | ''; label: string }[] = [
    { key: '', label: 'All' },
    { key: TrafficTicketStatus.NOT_COLLECTED, label: 'Not collected' },
    { key: TrafficTicketStatus.COLLECTED, label: 'Collected' },
  ];

  const headers = ['Ticket date', 'Booking / renter', 'Rental period', 'Amount', 'Status', 'Details', 'Document', ''];

  return (
    <div className="space-y-5 mb-10">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
        <div className="p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
              <DocumentTextIcon className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Traffic tickets</h2>
              <p className="text-sm text-slate-500">Fines linked to bookings, with claim and receipt emails to renters.</p>
            </div>
          </div>
          <div className={`grid gap-2 sm:flex sm:items-center w-full lg:w-auto ${hasManagePermission ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <button
              onClick={handleExportCSV}
              disabled={filteredTickets.length === 0}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 text-sm font-semibold rounded-xl hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
            >
              <ExportIcon className="w-4 h-4" /> Export CSV
            </button>
            {hasManagePermission && (
              <button onClick={() => setShowAddForm(true)} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 shadow-sm whitespace-nowrap">
                <PlusIcon className="w-4 h-4" /> Add ticket
              </button>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 border-t border-slate-100 divide-x divide-y lg:divide-y-0 divide-slate-100">
          {[
            { label: 'Tickets', value: String(stats.total), tone: 'text-slate-900' },
            { label: 'Outstanding', value: String(stats.outstandingCount), tone: stats.outstandingCount ? 'text-amber-600' : 'text-slate-900' },
            { label: 'To collect (JOD)', value: stats.outstanding.toFixed(2), tone: stats.outstanding ? 'text-amber-600' : 'text-slate-900' },
            { label: 'Collected (JOD)', value: stats.collected.toFixed(2), tone: 'text-emerald-600' },
          ].map(k => (
            <div key={k.label} className="px-4 sm:px-5 py-4 min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{k.label}</p>
              <p className={`mt-1 text-2xl font-bold tabular-nums truncate ${k.tone}`}>{k.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 sm:px-5 py-3 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Recorded tickets · {filteredTickets.length}</p>
          <div className="grid grid-cols-3 sm:inline-flex p-1 bg-slate-100 rounded-xl" role="group" aria-label="Filter by status">
            {filterOptions.map(o => (
              <button key={o.label} onClick={() => setStatusFilter(o.key)}
                className={`px-3 py-1.5 text-xs sm:text-sm font-semibold rounded-lg whitespace-nowrap ${statusFilter === o.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {filteredTickets.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <div className="mx-auto w-12 h-12 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center">
              <DocumentTextIcon className="w-6 h-6" />
            </div>
            <p className="mt-3 font-semibold text-slate-700">{tickets.length > 0 ? 'No tickets match this filter' : 'No traffic tickets yet'}</p>
            <p className="text-sm text-slate-500">{tickets.length > 0 ? 'Choose a different status to see more tickets.' : 'Recorded fines will appear here, linked to their booking.'}</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                  <tr>{headers.map((h, i) => <th key={i} className={`px-4 py-3 font-semibold ${i === 3 ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map(({ ticket, res }) => {
                    const isEditing = editingId === ticket.id;
                    return (
                      <tr key={ticket.id} className={`align-top ${isEditing ? 'bg-amber-50/50' : 'hover:bg-slate-50/70'}`}>
                        <td className="px-4 py-3 whitespace-nowrap text-slate-700 tabular-nums">{isEditing ? <input type="date" value={ticket.ticketDate} onChange={e => handleUpdateChange(ticket.id, 'ticketDate', e.target.value)} className={editCls} /> : ticket.ticketDate}</td>
                        <td className="px-4 py-3 min-w-[160px]">
                          <p className="font-semibold text-slate-900">{res?.personName || <span className="text-slate-400 font-normal">Unknown renter</span>}</p>
                          <p className="text-xs text-slate-500"><span className="font-mono">#{ticket.bookingId}</span>{res?.carModel ? ` · ${res.carModel}` : ''}</p>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-600 tabular-nums">{res ? <>{res.startDate}<br />{res.endDate}</> : <span className="text-slate-400">-</span>}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-right font-semibold text-slate-900 tabular-nums">{isEditing ? <input type="number" value={ticket.amount || ''} placeholder="0.00" onChange={e => handleUpdateChange(ticket.id, 'amount', parseFloat(e.target.value) || 0)} className={`${editCls} w-28 text-right`} /> : `${money(ticket.amount)} JOD`}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{isEditing ? statusSelect(ticket) : statusPill(ticket.status)}</td>
                        <td className="px-4 py-3 text-slate-600 min-w-[200px] max-w-xs">{isEditing ? <textarea value={ticket.details} onChange={e => handleUpdateChange(ticket.id, 'details', e.target.value)} className={editCls} rows={2} /> : (ticket.details || <span className="text-slate-300">-</span>)}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{renderDocument(ticket, isEditing, 'd')}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-right">{renderActions(ticket, res, isEditing)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <ul className="md:hidden divide-y divide-slate-100">
              {rows.map(({ ticket, res }) => {
                const isEditing = editingId === ticket.id;
                return (
                  <li key={ticket.id} className={`px-4 py-4 space-y-3 ${isEditing ? 'bg-amber-50/50' : ''}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 truncate">{res?.personName || 'Unknown renter'}</p>
                        <p className="text-xs text-slate-500 truncate"><span className="font-mono">#{ticket.bookingId}</span>{res?.carModel ? ` · ${res.carModel}` : ''}</p>
                      </div>
                      {!isEditing && (
                        <div className="text-right shrink-0">
                          <p className="font-bold text-slate-900 tabular-nums">{money(ticket.amount)} JOD</p>
                          <div className="mt-1">{statusPill(ticket.status)}</div>
                        </div>
                      )}
                    </div>
                    {isEditing ? (
                      <div className="grid grid-cols-2 gap-2">
                        <div><label className={labelCls}>Ticket date</label><input type="date" value={ticket.ticketDate} onChange={e => handleUpdateChange(ticket.id, 'ticketDate', e.target.value)} className={editCls} /></div>
                        <div><label className={labelCls}>Amount (JOD)</label><input type="number" value={ticket.amount || ''} placeholder="0.00" onChange={e => handleUpdateChange(ticket.id, 'amount', parseFloat(e.target.value) || 0)} className={editCls} /></div>
                        <div className="col-span-2"><label className={labelCls}>Status</label>{statusSelect(ticket)}</div>
                        <div className="col-span-2"><label className={labelCls}>Details</label><textarea value={ticket.details} onChange={e => handleUpdateChange(ticket.id, 'details', e.target.value)} className={editCls} rows={2} /></div>
                      </div>
                    ) : (
                      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                        <dt className="text-slate-400">Ticket date</dt><dd className="text-slate-700 text-right tabular-nums">{ticket.ticketDate}</dd>
                        <dt className="text-slate-400">Rental</dt><dd className="text-slate-700 text-right tabular-nums">{res ? `${res.startDate} – ${res.endDate}` : '-'}</dd>
                        {ticket.details && <dd className="col-span-2 mt-1 text-sm text-slate-600 break-words">{ticket.details}</dd>}
                      </dl>
                    )}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Document</span>
                      {renderDocument(ticket, isEditing, 'm')}
                    </div>
                    {renderActions(ticket, res, isEditing, true)}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      {/* Add ticket modal */}
      {hasManagePermission && showAddForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 sm:p-4" onClick={() => setShowAddForm(false)}>
          <form onSubmit={handleAddSubmit} onClick={e => e.stopPropagation()} className="w-full sm:max-w-2xl max-h-[92vh] flex flex-col bg-white rounded-t-2xl sm:rounded-2xl shadow-xl">
            <div className="px-5 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-lg font-bold text-slate-900">Add traffic ticket</h3>
                <p className="text-sm text-slate-500">Link the fine to an existing booking.</p>
              </div>
              <button type="button" onClick={() => setShowAddForm(false)} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close"><CancelIcon className="w-5 h-5" /></button>
            </div>
            <div className="px-5 sm:px-6 py-5 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className={labelCls}>Booking ID</label>
                  <input type="text" value={newTicketData.bookingId} onChange={e => handleInputChange('bookingId', e.target.value)} placeholder="Enter booking ID" className={inputCls} autoFocus />
                </div>
                <div>
                  <label className={labelCls}>Ticket date</label>
                  <input type="date" value={newTicketData.ticketDate} onChange={e => handleInputChange('ticketDate', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Amount (JOD)</label>
                  <input type="number" step="0.01" value={newTicketData.amount || ''} placeholder="0.00" onChange={e => handleInputChange('amount', parseFloat(e.target.value) || 0)} className={inputCls} />
                </div>
              </div>
              {foundReservation ? (
                <div className="px-3 py-2.5 text-sm bg-emerald-50 ring-1 ring-inset ring-emerald-200 text-emerald-800 rounded-xl">
                  <span className="font-semibold">Reservation found:</span> {foundReservation.personName} ({foundReservation.carModel})
                </div>
              ) : newTicketData.bookingId ? (
                <div className="px-3 py-2.5 text-sm bg-rose-50 ring-1 ring-inset ring-rose-200 text-rose-700 rounded-xl">
                  No reservation found with this booking ID.
                </div>
              ) : null}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Details</label>
                  <textarea value={newTicketData.details} onChange={e => handleInputChange('details', e.target.value)} rows={3} placeholder="e.g. Speeding ticket on Main St." className={inputCls}></textarea>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className={labelCls}>Ticket document</label>
                    {newTicketData.ticketDocument ? (
                      <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl">
                        <DocumentTextIcon className="w-4 h-4 text-slate-400 shrink-0" />
                        <span className="text-sm text-slate-700 truncate flex-1 min-w-0" title={newTicketData.ticketDocumentFilename}>{newTicketData.ticketDocumentFilename}</span>
                        <button type="button" onClick={() => setNewTicketData(p => ({...p, ticketDocument: undefined, ticketDocumentFilename: undefined}))} className="p-1 rounded-lg text-rose-500 hover:bg-rose-50" aria-label="Remove file"><TrashIcon className="w-4 h-4" /></button>
                      </div>
                    ) : (
                      <>
                        <input type="file" id="ticket-upload" className="hidden" onChange={handleFileChange} accept="image/*,.pdf" />
                        <label htmlFor="ticket-upload" className="cursor-pointer flex items-center justify-center gap-2 px-3 py-2.5 bg-white text-slate-600 border border-dashed border-slate-300 rounded-xl hover:bg-slate-50 text-sm font-semibold">
                          <UploadIcon className="w-4 h-4" /> Select file
                        </label>
                      </>
                    )}
                  </div>
                  <div>
                    <label className={labelCls}>Status</label>
                    <select value={newTicketData.status} onChange={e => handleInputChange('status', e.target.value)} className={inputCls}>
                      <option value={TrafficTicketStatus.NOT_COLLECTED}>Not Collected</option>
                      <option value={TrafficTicketStatus.COLLECTED}>Collected</option>
                    </select>
                  </div>
                </div>
              </div>
              {validationError && <p className="text-sm font-medium text-rose-600">{validationError}</p>}
            </div>
            <div className="px-5 sm:px-6 py-4 border-t border-slate-100 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <button type="button" onClick={() => setShowAddForm(false)} className="px-4 py-2.5 bg-white border border-slate-200 text-slate-700 text-sm font-semibold rounded-xl hover:bg-slate-50">Cancel</button>
              <button type="submit" disabled={!foundReservation} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed">
                <PlusIcon className="w-4 h-4" /> Add ticket
              </button>
            </div>
          </form>
        </div>
      )}

      {ticketToDelete && (
        <ConfirmationDialog
            message="Are you sure you want to delete this traffic ticket? This action cannot be undone."
            onConfirm={handleConfirmDelete}
            onCancel={() => setTicketToDelete(null)}
            confirmButtonText="Delete"
        />
      )}
      {isKeyModalOpen && (
        <SecurityKeyModal
            onSuccess={handleKeySuccess}
            onClose={() => { setIsKeyModalOpen(false); setPendingAction(null); }}
        />
      )}
    </div>
  );
};

export default TrafficTickets;
