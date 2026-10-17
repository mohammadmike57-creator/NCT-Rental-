import React, { useState, useMemo, useEffect } from 'react';
import { TrafficTicket, TrafficTicketStatus, AppData, Reservation, User, UserPermission, CompanyDetails } from '../types';
import { PlusIcon, TrashIcon, EditIcon, SaveIcon, CancelIcon, ExportIcon, PaperAirplaneIcon, UploadIcon, DocumentTextIcon, ShareIcon } from './icons';
import ConfirmationDialog from './ConfirmationDialog';
import SecurityKeyModal from './SecurityKeyModal';
import { Page, PageHeader, StatGrid, Panel, Toolbar, Segmented, Badge, Button, Field, EmptyState, DetailList, SectionLabel, Dialog, Drawer, inputCls, selectCls, textareaCls, table } from './ui/Crm';

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
    const btn = "w-8 h-8 inline-flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900";

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
  const [viewId, setViewId] = useState<string | null>(null);
  
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
    <Badge tone={status === TrafficTicketStatus.COLLECTED ? 'success' : 'warning'}>
      {status === TrafficTicketStatus.COLLECTED ? 'Collected' : 'Not collected'}
    </Badge>
  );

  const statusSelect = (ticket: TrafficTicket) => (
    <select value={ticket.status} onChange={e => handleUpdateChange(ticket.id, 'status', e.target.value)} className={`${selectCls} w-full`}>
      <option value={TrafficTicketStatus.NOT_COLLECTED}>Not Collected</option>
      <option value={TrafficTicketStatus.COLLECTED}>Collected</option>
    </select>
  );

  const renderDocument = (ticket: TrafficTicket, isEditing: boolean, view: 'd' | 'm') => {
    if (isEditing && hasManagePermission) {
      return ticket.ticketDocument ? (
        <div className="inline-flex items-center gap-0.5">
          <a href={ticket.ticketDocument} target="_blank" rel="noopener noreferrer" title={ticket.ticketDocumentFilename} className="w-8 h-8 inline-flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"><DocumentTextIcon className="w-4 h-4" /></a>
          <button type="button" onClick={() => handleRemoveFile(ticket.id)} className="w-8 h-8 inline-flex items-center justify-center rounded-md text-rose-500 hover:bg-rose-50" title="Remove Document"><TrashIcon className="w-4 h-4" /></button>
        </div>
      ) : (
        <>
          <input type="file" id={`edit-upload-${view}-${ticket.id}`} className="hidden" onChange={(e) => handleUpdateFileChange(ticket.id, e)} accept="image/*,.pdf" />
          <label htmlFor={`edit-upload-${view}-${ticket.id}`} className="cursor-pointer inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-sm" title="Upload Document"><UploadIcon className="w-4 h-4" /> Upload</label>
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
          <Button variant="primary" size="sm" onClick={handleSaveEdit} title="Save" icon={<SaveIcon className="w-4 h-4" />}>Done</Button>
          <Button size="sm" onClick={handleCancelEdit} title="Cancel" icon={<CancelIcon className="w-4 h-4" />}>Cancel</Button>
        </div>
      );
    }
    const isClaim = ticket.status === TrafficTicketStatus.NOT_COLLECTED;
    return (
      <div className={`flex items-center gap-1 ${full ? '' : 'justify-end'}`}>
        <Button
          size="sm"
          onClick={() => handleSendEmail(isClaim ? 'claim' : 'receipt', ticket, res!)}
          disabled={!canSendEmail}
          className={full ? 'flex-1' : ''}
          title={canSendEmail ? (isClaim ? 'Send claim email to renter' : 'Send receipt email to renter') : 'Renter email not found in voucher'}
          icon={<PaperAirplaneIcon className="w-4 h-4" />}
        >
          {isClaim ? 'Send claim' : 'Send receipt'}
        </Button>
        {hasManagePermission && (
          <>
            <button type="button" onClick={() => handleEditClick(ticket)} className="w-8 h-8 inline-flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900" title="Edit" aria-label="Edit ticket"><EditIcon className="w-4 h-4" /></button>
            <button type="button" onClick={() => handleDeleteClick(ticket.id)} className="w-8 h-8 inline-flex items-center justify-center rounded-md text-slate-500 hover:bg-rose-50 hover:text-rose-600" title="Delete" aria-label="Delete ticket"><TrashIcon className="w-4 h-4" /></button>
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

  // Record drawer: an edit session (after the security key) takes precedence over a plain view.
  const drawerId = editingId || viewId;
  const drawerTicket = drawerId ? tickets.find(t => t.id === drawerId) || null : null;
  const drawerRes = drawerTicket ? findReservationByBookingId(drawerTicket.bookingId) : null;
  const drawerEditing = !!drawerTicket && editingId === drawerTicket.id && !!hasManagePermission;
  const closeDrawer = () => {
    if (editingId) handleSaveEdit();
    setViewId(null);
  };

  return (
    <Page>
      <PageHeader
        section="Financials & Incidents"
        title="Traffic Tickets"
        subtitle="Fines linked to bookings, with claim and receipt emails to renters."
        actions={<>
          <Button onClick={handleExportCSV} disabled={filteredTickets.length === 0} icon={<ExportIcon className="w-4 h-4" />}>Export CSV</Button>
          {hasManagePermission && (
            <Button variant="primary" onClick={() => setShowAddForm(true)} icon={<PlusIcon className="w-4 h-4" />}>Add ticket</Button>
          )}
        </>}
      />

      <StatGrid items={[
        { label: 'Tickets', value: stats.total, sub: 'all statuses', active: statusFilter === '', onClick: () => setStatusFilter('') },
        { label: 'Outstanding', value: stats.outstandingCount, sub: 'not collected', tone: stats.outstandingCount ? 'warning' : 'default', active: statusFilter === TrafficTicketStatus.NOT_COLLECTED, onClick: () => setStatusFilter(TrafficTicketStatus.NOT_COLLECTED) },
        { label: 'To collect (JOD)', value: stats.outstanding.toFixed(2), tone: stats.outstanding ? 'warning' : 'default' },
        { label: 'Collected (JOD)', value: stats.collected.toFixed(2), tone: 'success', active: statusFilter === TrafficTicketStatus.COLLECTED, onClick: () => setStatusFilter(TrafficTicketStatus.COLLECTED) },
      ]} />

      <Panel title={<>Recorded tickets <span className="ml-1 text-slate-400 font-normal tabular-nums">{filteredTickets.length}</span></>}>
        <Toolbar>
          <Segmented
            options={filterOptions.map(o => ({ key: o.key, label: o.label }))}
            value={statusFilter}
            onChange={k => setStatusFilter(k as TrafficTicketStatus | '')}
            className="w-full md:w-auto"
          />
          <span className="md:ml-auto text-xs text-slate-500">Select a ticket to view details, documents and emails.</span>
        </Toolbar>

        {filteredTickets.length === 0 ? (
          <EmptyState
            icon={<DocumentTextIcon />}
            title={tickets.length > 0 ? 'No tickets match this filter' : 'No traffic tickets yet'}
            hint={tickets.length > 0 ? 'Choose a different status to see more tickets.' : 'Recorded fines will appear here, linked to their booking.'}
            action={tickets.length === 0 && hasManagePermission ? <Button variant="primary" size="sm" onClick={() => setShowAddForm(true)} icon={<PlusIcon className="w-4 h-4" />}>Add ticket</Button> : undefined}
          />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className={table.wrap}>
                <thead className={table.head}>
                  <tr>
                    <th className={table.th}>Ticket date</th>
                    <th className={table.th}>Booking / renter</th>
                    <th className={table.th}>Rental period</th>
                    <th className={`${table.th} text-right`}>Amount</th>
                    <th className={table.th}>Status</th>
                    <th className={table.th}>Details</th>
                    <th className={table.th}>Document</th>
                    <th className={table.th}><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className={table.body}>
                  {rows.map(({ ticket, res }) => {
                    const isEditing = editingId === ticket.id;
                    return (
                      <tr key={ticket.id} className={`${table.row} cursor-pointer ${isEditing || viewId === ticket.id ? 'bg-indigo-50/40' : ''}`} onClick={() => setViewId(ticket.id)}>
                        <td className={`${table.td} whitespace-nowrap text-slate-700 tabular-nums`}>{ticket.ticketDate}</td>
                        <td className={`${table.td} min-w-[160px]`}>
                          <p className="font-semibold text-slate-900">{res?.personName || <span className="text-slate-400 font-normal">Unknown renter</span>}</p>
                          <p className="text-xs text-slate-500"><span className="font-mono">#{ticket.bookingId}</span>{res?.carModel ? ` · ${res.carModel}` : ''}</p>
                        </td>
                        <td className={`${table.td} whitespace-nowrap text-xs text-slate-600 tabular-nums`}>{res ? <>{res.startDate}<br />{res.endDate}</> : <span className="text-slate-400">-</span>}</td>
                        <td className={`${table.td} whitespace-nowrap text-right font-semibold text-slate-900 tabular-nums`}>{money(ticket.amount)} JOD</td>
                        <td className={`${table.td} whitespace-nowrap`}>{statusPill(ticket.status)}</td>
                        <td className={`${table.td} text-slate-600 max-w-[240px]`}><p className="truncate" title={ticket.details}>{ticket.details || <span className="text-slate-300">-</span>}</p></td>
                        <td className={`${table.td} whitespace-nowrap`} onClick={e => e.stopPropagation()}>{renderDocument(ticket, false, 'd')}</td>
                        <td className={`${table.td} whitespace-nowrap text-right`} onClick={e => e.stopPropagation()}>{renderActions(ticket, res, false)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile list */}
            <ul className="md:hidden divide-y divide-slate-100">
              {rows.map(({ ticket, res }) => (
                <li key={ticket.id} className="px-4 py-3 space-y-2.5">
                  <button type="button" onClick={() => setViewId(ticket.id)} className="w-full text-left flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-slate-900 truncate">{res?.personName || 'Unknown renter'}</p>
                      <p className="text-xs text-slate-500 truncate"><span className="font-mono">#{ticket.bookingId}</span>{res?.carModel ? ` · ${res.carModel}` : ''}</p>
                      <p className="text-xs text-slate-500 tabular-nums">{ticket.ticketDate}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[13px] font-semibold text-slate-900 tabular-nums">{money(ticket.amount)} JOD</p>
                      <div className="mt-1">{statusPill(ticket.status)}</div>
                    </div>
                  </button>
                  {ticket.details && <p className="text-xs text-slate-600 line-clamp-2 break-words">{ticket.details}</p>}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Document</span>
                    {renderDocument(ticket, false, 'm')}
                  </div>
                  {renderActions(ticket, res, false, true)}
                </li>
              ))}
            </ul>
          </>
        )}
      </Panel>

      {/* Ticket record drawer (view + edit) */}
      <Drawer
        open={!!drawerTicket}
        onClose={closeDrawer}
        title={drawerTicket ? (drawerRes?.personName || 'Unknown renter') : ''}
        subtitle={drawerTicket && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono">#{drawerTicket.bookingId}</span>
            {statusPill(drawerTicket.status)}
            {drawerEditing && <Badge tone="info" dot={false}>Editing</Badge>}
          </div>
        )}
        footer={drawerTicket && (drawerEditing
          ? <div className="w-full">{renderActions(drawerTicket, drawerRes, true, true)}</div>
          : <div className="w-full">{renderActions(drawerTicket, drawerRes, false, true)}</div>)}
      >
        {drawerTicket && (
          <div className="px-5 py-4 space-y-5">
            <div>
              <SectionLabel className="mb-1">Booking</SectionLabel>
              <DetailList rows={[
                { label: 'Renter', value: drawerRes?.personName || <span className="text-slate-400">Unknown</span> },
                { label: 'Vehicle', value: drawerRes?.carModel || '-' },
                { label: 'Rental period', value: <span className="tabular-nums">{drawerRes ? `${drawerRes.startDate} – ${drawerRes.endDate}` : '-'}</span> },
                { label: 'Renter email', value: drawerRes?.customerEmail || <span className="text-slate-400">Not on voucher</span> },
              ]} />
            </div>
            <div>
              <SectionLabel className="mb-2">Ticket</SectionLabel>
              {drawerEditing ? (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Ticket date"><input type="date" value={drawerTicket.ticketDate} onChange={e => handleUpdateChange(drawerTicket.id, 'ticketDate', e.target.value)} className={inputCls} /></Field>
                  <Field label="Amount (JOD)"><input type="number" value={drawerTicket.amount || ''} placeholder="0.00" onChange={e => handleUpdateChange(drawerTicket.id, 'amount', parseFloat(e.target.value) || 0)} className={`${inputCls} text-right tabular-nums`} /></Field>
                  <Field label="Status" className="col-span-2">{statusSelect(drawerTicket)}</Field>
                  <Field label="Details" className="col-span-2"><textarea value={drawerTicket.details} onChange={e => handleUpdateChange(drawerTicket.id, 'details', e.target.value)} className={textareaCls} rows={3} /></Field>
                </div>
              ) : (
                <DetailList rows={[
                  { label: 'Ticket date', value: <span className="tabular-nums">{drawerTicket.ticketDate}</span> },
                  { label: 'Amount', value: <span className="tabular-nums">{money(drawerTicket.amount)} JOD</span> },
                  { label: 'Status', value: statusPill(drawerTicket.status) },
                  { label: 'Details', value: drawerTicket.details || <span className="text-slate-400">-</span> },
                ]} />
              )}
            </div>
            <div>
              <SectionLabel className="mb-2">Document</SectionLabel>
              <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2">
                <span className="text-[13px] text-slate-700 truncate min-w-0">{drawerTicket.ticketDocumentFilename || <span className="text-slate-400">No document attached</span>}</span>
                {renderDocument(drawerTicket, drawerEditing, 'm')}
              </div>
            </div>
          </div>
        )}
      </Drawer>

      {/* Add ticket dialog */}
      {hasManagePermission && (
        <Dialog
          open={showAddForm}
          onClose={() => setShowAddForm(false)}
          title="Add traffic ticket"
          subtitle="Link the fine to an existing booking."
          footer={<>
            <Button onClick={() => setShowAddForm(false)}>Cancel</Button>
            <Button variant="primary" type="submit" form="add-ticket-form" disabled={!foundReservation} icon={<PlusIcon className="w-4 h-4" />}>Add ticket</Button>
          </>}
        >
          <form id="add-ticket-form" onSubmit={handleAddSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Booking ID" required>
                <input type="text" value={newTicketData.bookingId} onChange={e => handleInputChange('bookingId', e.target.value)} placeholder="Enter booking ID" className={inputCls} autoFocus />
              </Field>
              <Field label="Ticket date">
                <input type="date" value={newTicketData.ticketDate} onChange={e => handleInputChange('ticketDate', e.target.value)} className={inputCls} />
              </Field>
              <Field label="Amount (JOD)" required>
                <input type="number" step="0.01" value={newTicketData.amount || ''} placeholder="0.00" onChange={e => handleInputChange('amount', parseFloat(e.target.value) || 0)} className={inputCls} />
              </Field>
            </div>
            {foundReservation ? (
              <div className="px-3 py-2 text-[13px] bg-emerald-50 ring-1 ring-inset ring-emerald-200 text-emerald-800 rounded-lg">
                <span className="font-semibold">Reservation found:</span> {foundReservation.personName} ({foundReservation.carModel})
              </div>
            ) : newTicketData.bookingId ? (
              <div className="px-3 py-2 text-[13px] bg-rose-50 ring-1 ring-inset ring-rose-200 text-rose-700 rounded-lg">
                No reservation found with this booking ID.
              </div>
            ) : null}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Details">
                <textarea value={newTicketData.details} onChange={e => handleInputChange('details', e.target.value)} rows={4} placeholder="e.g. Speeding ticket on Main St." className={textareaCls}></textarea>
              </Field>
              <div className="space-y-4">
                <div>
                  <span className="block text-[13px] font-medium text-slate-700 mb-1">Ticket document</span>
                  {newTicketData.ticketDocument ? (
                    <div className="flex items-center gap-2 h-9 px-3 bg-slate-50 border border-slate-200 rounded-lg">
                      <DocumentTextIcon className="w-4 h-4 text-slate-400 shrink-0" />
                      <span className="text-[13px] text-slate-700 truncate flex-1 min-w-0" title={newTicketData.ticketDocumentFilename}>{newTicketData.ticketDocumentFilename}</span>
                      <button type="button" onClick={() => setNewTicketData(p => ({...p, ticketDocument: undefined, ticketDocumentFilename: undefined}))} className="p-1 rounded-md text-rose-500 hover:bg-rose-50" aria-label="Remove file"><TrashIcon className="w-4 h-4" /></button>
                    </div>
                  ) : (
                    <>
                      <input type="file" id="ticket-upload" className="hidden" onChange={handleFileChange} accept="image/*,.pdf" />
                      <label htmlFor="ticket-upload" className="cursor-pointer flex items-center justify-center gap-2 h-9 px-3 bg-white text-slate-600 border border-dashed border-slate-300 rounded-lg hover:bg-slate-50 text-[13px] font-semibold">
                        <UploadIcon className="w-4 h-4" /> Select file
                      </label>
                    </>
                  )}
                </div>
                <Field label="Status">
                  <select value={newTicketData.status} onChange={e => handleInputChange('status', e.target.value)} className={`${selectCls} w-full`}>
                    <option value={TrafficTicketStatus.NOT_COLLECTED}>Not Collected</option>
                    <option value={TrafficTicketStatus.COLLECTED}>Collected</option>
                  </select>
                </Field>
              </div>
            </div>
            {validationError && <p className="text-[13px] font-medium text-rose-600">{validationError}</p>}
          </form>
        </Dialog>
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
    </Page>
  );
};

export default TrafficTickets;
