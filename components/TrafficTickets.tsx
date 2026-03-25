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
        return <span className="text-gray-400">-</span>;
    }

    const showShare = 'share' in navigator && 'canShare' in navigator;

    return (
        <div className="flex items-center justify-center gap-2">
            <a href={fileData} target="_blank" rel="noopener noreferrer" title={`View ${fileName}`} className="text-blue-600 hover:text-blue-800 p-1">
                <DocumentTextIcon />
            </a>
            <button onClick={() => handleDownload(fileData, fileName)} title={`Download ${fileName}`} className="text-green-600 hover:text-green-800 p-1">
                <ExportIcon />
            </button>
            {showShare && (
                 <button onClick={() => handleShare(fileData, fileName)} title={`Share ${fileName}`} className="text-purple-600 hover:text-purple-800 p-1">
                    <ShareIcon />
                </button>
            )}
        </div>
    );
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
            escapeCSV(ticket.amount.toFixed(2)),
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
        ? `Dear ${renter.personName},\n\nThis notice is regarding a traffic violation that occurred during your rental of a ${renter.carModel} (Booking ID: ${renter.bookingId}).\n\nTicket Details:\n- Violation Date: ${ticket.ticketDate}\n- Description: ${ticket.details}\n- Amount Due: ${ticket.amount.toFixed(2)} JOD\n\nPlease contact our office at your earliest convenience to settle this amount.${signature.replace('Sincerely', 'Thank you')}`
        : `Dear ${renter.personName},\n\nThis email confirms that we have received your payment for the traffic ticket associated with your rental (Booking ID: ${renter.bookingId}).\n\nPayment Details:\n- Violation Date: ${ticket.ticketDate}\n- Amount Paid: ${ticket.amount.toFixed(2)} JOD\n- Status: COLLECTED\n\nThank you for your prompt attention to this matter.${signature}`;

    window.location.href = `mailto:${renter.customerEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const headers = ['Ticket Date', 'Booking ID', 'Renter', 'Car', 'Rental Period', 'Amount (JOD)', 'Status', 'Details', 'Document', 'Actions'];

  return (
    <div className="p-4 sm:p-6 bg-white">
      <h3 className="text-2xl font-bold text-gray-800 mb-4">Traffic Ticket Management</h3>
      
      {hasManagePermission && (
          <form onSubmit={handleAddSubmit} className="p-4 bg-gray-50 rounded-lg border border-gray-200 mb-6 space-y-4">
            <h4 className="text-lg font-semibold text-gray-700">Add New Ticket</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Booking ID</label>
                <input type="text" value={newTicketData.bookingId} onChange={e => handleInputChange('bookingId', e.target.value)} placeholder="Enter Booking ID to link" className="w-full p-2 mt-1 border border-gray-300 rounded-md text-sm focus:ring-secondary focus:border-secondary" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Ticket Date</label>
                <input type="date" value={newTicketData.ticketDate} onChange={e => handleInputChange('ticketDate', e.target.value)} className="w-full p-2 mt-1 border border-gray-300 rounded-md text-sm focus:ring-secondary focus:border-secondary" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Amount (JOD)</label>
                <input type="number" step="0.01" value={newTicketData.amount || ''} placeholder="0.00" onChange={e => handleInputChange('amount', parseFloat(e.target.value) || 0)} className="w-full p-2 mt-1 border border-gray-300 rounded-md text-sm focus:ring-secondary focus:border-secondary" />
              </div>
            </div>
            {foundReservation ? (
                <div className="p-2 text-sm bg-green-100 border border-green-200 text-green-800 rounded-md">
                    <strong>Reservation Found:</strong> {foundReservation.personName} ({foundReservation.carModel})
                </div>
            ) : newTicketData.bookingId ? (
                 <div className="p-2 text-sm bg-red-100 border border-red-200 text-red-800 rounded-md">
                    No reservation found with this Booking ID.
                </div>
            ) : null}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700">Details</label>
                    <textarea value={newTicketData.details} onChange={e => handleInputChange('details', e.target.value)} rows={2} placeholder="e.g., Speeding ticket on Main St." className="w-full p-2 mt-1 border border-gray-300 rounded-md text-sm focus:ring-secondary focus:border-secondary"></textarea>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700">Ticket Document</label>
                     {newTicketData.ticketDocument ? (
                        <div className="flex items-center gap-2 mt-1 p-2 bg-white border rounded-md">
                            <DocumentTextIcon />
                            <span className="text-sm text-gray-600 truncate flex-grow" title={newTicketData.ticketDocumentFilename}>{newTicketData.ticketDocumentFilename}</span>
                            <button type="button" onClick={() => setNewTicketData(p => ({...p, ticketDocument: undefined, ticketDocumentFilename: undefined}))} className="text-red-500 hover:text-red-700 p-1"><TrashIcon /></button>
                        </div>
                    ) : (
                        <>
                            <input type="file" id="ticket-upload" className="hidden" onChange={handleFileChange} accept="image/*,.pdf" />
                            <label htmlFor="ticket-upload" className="cursor-pointer mt-1 inline-flex items-center gap-2 px-3 py-2 bg-white text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 text-sm font-medium">
                                <UploadIcon />
                                Select File
                            </label>
                        </>
                    )}
                </div>
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700">Status</label>
                <select value={newTicketData.status} onChange={e => handleInputChange('status', e.target.value)} className="w-full md:w-1/3 p-2 mt-1 border border-gray-300 rounded-md text-sm focus:ring-secondary focus:border-secondary">
                    <option value={TrafficTicketStatus.NOT_COLLECTED}>Not Collected</option>
                    <option value={TrafficTicketStatus.COLLECTED}>Collected</option>
                </select>
            </div>
            {validationError && <p className="text-sm text-red-600">{validationError}</p>}
            <div className="text-right">
                <button type="submit" disabled={!foundReservation} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-md hover:bg-secondary transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary text-sm font-medium disabled:bg-gray-400 disabled:cursor-not-allowed">
                    <PlusIcon /> Add Ticket
                </button>
            </div>
          </form>
      )}
      
      {/* Table Header with Filter and Export */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 pt-6 border-t border-gray-200 mt-6">
          <h4 className="text-lg font-semibold text-gray-700">Recorded Tickets</h4>
          <div className="flex items-center gap-4 mt-3 sm:mt-0">
              <div>
                  <label htmlFor="ticket-status-filter" className="text-sm font-medium text-gray-700 mr-2">Filter by status:</label>
                  <select
                      id="ticket-status-filter"
                      value={statusFilter}
                      onChange={e => setStatusFilter(e.target.value as TrafficTicketStatus | '')}
                      className="p-2 border border-gray-300 rounded-md text-sm focus:ring-secondary focus:border-secondary"
                  >
                      <option value="">All Statuses</option>
                      <option value={TrafficTicketStatus.COLLECTED}>Collected</option>
                      <option value={TrafficTicketStatus.NOT_COLLECTED}>Not Collected</option>
                  </select>
              </div>
              <button
                  onClick={handleExportCSV}
                  disabled={filteredTickets.length === 0}
                  className="flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-600 text-sm font-medium disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                  <ExportIcon />
                  Export CSV
              </button>
          </div>
      </div>

      {/* Tickets Table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>{headers.map(h => <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>)}</tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredTickets.map(ticket => {
              const res = findReservationByBookingId(ticket.bookingId);
              const isEditing = editingId === ticket.id;
              const canSendEmail = res && res.customerEmail;

              return (
                <tr key={ticket.id} className={isEditing ? 'bg-yellow-50' : ''}>
                  <td className="px-4 py-3 whitespace-nowrap text-sm">{isEditing ? <input type="date" value={ticket.ticketDate} onChange={e => handleUpdateChange(ticket.id, 'ticketDate', e.target.value)} className="w-full p-1 border rounded" /> : ticket.ticketDate}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm">{ticket.bookingId}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm">{res?.personName || <span className="text-gray-400">N/A</span>}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm">{res?.carModel || <span className="text-gray-400">N/A</span>}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm">{res ? `${res.startDate} to ${res.endDate}` : <span className="text-gray-400">N/A</span>}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm">{isEditing ? <input type="number" value={ticket.amount || ''} placeholder="0.00" onChange={e => handleUpdateChange(ticket.id, 'amount', parseFloat(e.target.value) || 0)} className="w-24 p-1 border rounded"/> : `${ticket.amount.toFixed(2)} JOD`}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm">
                    {isEditing ? (
                        <select value={ticket.status} onChange={e => handleUpdateChange(ticket.id, 'status', e.target.value)} className="w-full p-1 border rounded">
                            <option value={TrafficTicketStatus.NOT_COLLECTED}>Not Collected</option>
                            <option value={TrafficTicketStatus.COLLECTED}>Collected</option>
                        </select>
                    ) : (
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${ticket.status === TrafficTicketStatus.COLLECTED ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                            {ticket.status.replace('_', ' ')}
                        </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm" style={{minWidth: '200px', whiteSpace: 'normal'}}>{isEditing ? <textarea value={ticket.details} onChange={e => handleUpdateChange(ticket.id, 'details', e.target.value)} className="w-full p-1 border rounded" rows={2}/> : ticket.details}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-center">
                    {isEditing && hasManagePermission ? (
                         <div>
                            {ticket.ticketDocument ? (
                                <div className="flex items-center justify-center gap-2">
                                    <a href={ticket.ticketDocument} target="_blank" rel="noopener noreferrer" title={ticket.ticketDocumentFilename} className="text-blue-600 p-1"><DocumentTextIcon /></a>
                                    <button onClick={() => handleRemoveFile(ticket.id)} className="text-red-500 p-1" title="Remove Document"><TrashIcon /></button>
                                </div>
                            ) : (
                                <>
                                    <input type="file" id={`edit-upload-${ticket.id}`} className="hidden" onChange={(e) => handleUpdateFileChange(ticket.id, e)} accept="image/*,.pdf"/>
                                    <label htmlFor={`edit-upload-${ticket.id}`} className="cursor-pointer text-blue-600 p-1" title="Upload Document"><UploadIcon /></label>
                                </>
                            )}
                        </div>
                    ) : (
                        <FileActions fileData={ticket.ticketDocument} fileName={ticket.ticketDocumentFilename} />
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-center">
                    <div className="flex items-center justify-center gap-2">
                      {isEditing && hasManagePermission ? (
                        <>
                          <button onClick={handleSaveEdit} className="text-green-600 hover:text-green-700" title="Save"><SaveIcon /></button>
                          <button onClick={handleCancelEdit} className="text-gray-500 hover:text-gray-700" title="Cancel"><CancelIcon /></button>
                        </>
                      ) : (
                        <div className="flex items-center gap-3">
                            {ticket.status === TrafficTicketStatus.NOT_COLLECTED ? (
                                <button 
                                    onClick={() => handleSendEmail('claim', ticket, res!)}
                                    disabled={!canSendEmail}
                                    className="flex items-center gap-1.5 px-2 py-1 bg-orange-500 text-white rounded-md text-xs hover:bg-orange-600 disabled:bg-gray-400"
                                    title={canSendEmail ? "Send claim email to renter" : "Renter email not found in voucher"}
                                >
                                    <PaperAirplaneIcon /> Send Claim
                                </button>
                            ) : (
                                <button 
                                    onClick={() => handleSendEmail('receipt', ticket, res!)}
                                    disabled={!canSendEmail}
                                    className="flex items-center gap-1.5 px-2 py-1 bg-green-500 text-white rounded-md text-xs hover:bg-green-600 disabled:bg-gray-400"
                                    title={canSendEmail ? "Send receipt email to renter" : "Renter email not found in voucher"}
                                >
                                    <PaperAirplaneIcon /> Send Receipt
                                </button>
                            )}
                            {hasManagePermission && (
                                <div className="flex items-center border-l pl-2 ml-1">
                                    <button onClick={() => handleEditClick(ticket)} className="p-1 text-blue-500 hover:text-blue-700" title="Edit"><EditIcon /></button>
                                    <button onClick={() => handleDeleteClick(ticket.id)} className="p-1 text-red-500 hover:text-red-700" title="Delete"><TrashIcon /></button>
                                </div>
                            )}
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {filteredTickets.length === 0 && (
                <tr>
                    <td colSpan={headers.length} className="text-center py-10 text-gray-500">
                        {tickets.length > 0 ? 'No tickets match the current filter.' : 'No traffic tickets have been recorded yet.'}
                    </td>
                </tr>
            )}
          </tbody>
        </table>
      </div>

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