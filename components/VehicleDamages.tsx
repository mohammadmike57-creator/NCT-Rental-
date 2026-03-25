// FIX: Updated the component to conditionally render fields based on whether a police report is involved, streamlining data entry for different incident types.
import React, { useState, useMemo, useEffect } from 'react';
import { VehicleDamage, VehicleDamageStatus, AppData, Reservation, User, UserPermission, CompanyDetails } from '../types';
import { PlusIcon, TrashIcon, EditIcon, SaveIcon, CancelIcon, PaperAirplaneIcon, ShieldExclamationIcon, UploadIcon, DocumentTextIcon, ShareIcon, ExportIcon } from './icons';
import ConfirmationDialog from './ConfirmationDialog';
import SecurityKeyModal from './SecurityKeyModal';
import { USD_TO_JOD_RATE } from '../constants';

interface VehicleDamagesProps {
  damages: VehicleDamage[];
  allData: AppData;
  onAddDamage: (newDamage: Omit<VehicleDamage, 'id'>) => void;
  onUpdateDamage: (updatedDamage: VehicleDamage) => void;
  onDeleteDamage: (damageId: string) => void;
  currentUser: User | null;
  companyDetails: CompanyDetails;
}

const emptyDamage: Omit<VehicleDamage, 'id'> = {
  bookingId: '',
  amount: 0,
  details: '',
  status: VehicleDamageStatus.NOT_COLLECTED,
  policeReportNumber: '',
  policeReportAmount: 0,
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


const VehicleDamages: React.FC<VehicleDamagesProps> = ({ damages, allData, onAddDamage, onUpdateDamage, onDeleteDamage, currentUser, companyDetails }) => {
  const [newDamageData, setNewDamageData] = useState<Omit<VehicleDamage, 'id'>>(emptyDamage);
  const [hasPoliceReport, setHasPoliceReport] = useState(false);
  const [foundReservation, setFoundReservation] = useState<Reservation | null>(null);
  const [vehicleExcessJOD, setVehicleExcessJOD] = useState(0);
  const [validationError, setValidationError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [originalDamage, setOriginalDamage] = useState<VehicleDamage | null>(null);
  const [damageToDelete, setDamageToDelete] = useState<string | null>(null);
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ type: 'edit' | 'delete'; payload: any } | null>(null);
  const [statusFilter, setStatusFilter] = useState<VehicleDamageStatus | ''>('');
  
  const hasManagePermission = currentUser?.permissions.includes(UserPermission.ACTION_VEHICLE_DAMAGES_MANAGE);

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
      if (newDamageData.bookingId) {
        const found = findReservationByBookingId(newDamageData.bookingId);
        setFoundReservation(found);
        if (found) {
            setVehicleExcessJOD((found.excess || 0) * USD_TO_JOD_RATE);
        } else {
            setVehicleExcessJOD(0);
        }
      } else {
        setFoundReservation(null);
        setVehicleExcessJOD(0);
      }
    }, 300);
    return () => clearTimeout(handler);
  }, [newDamageData.bookingId, allData]);
  
  const filteredDamages = useMemo(() => {
    if (!statusFilter) {
        return damages;
    }
    return damages.filter(damage => damage.status === statusFilter);
  }, [damages, statusFilter]);
  
  const handleHasReportChange = (checked: boolean) => {
    setHasPoliceReport(checked);
    // Clear fields when toggling to avoid carrying over incorrect data
    setNewDamageData(prev => ({
        ...prev,
        // Reset amounts and files when switching modes
        amount: 0,
        policeReportNumber: '',
        policeReportAmount: 0,
        repairInvoice: undefined,
        repairInvoiceFilename: undefined,
        policeReportFile: undefined,
        policeReportFilename: undefined,
    }));

    if (checked && foundReservation) {
        setNewDamageData(prev => ({
            ...prev,
            policeReportAmount: vehicleExcessJOD,
        }));
    }
  };

  const handleInputChange = (field: keyof Omit<VehicleDamage, 'id'>, value: any) => {
    setNewDamageData(prev => ({ ...prev, [field]: value }));
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, field: 'repairInvoice' | 'policeReportFile' | 'damageImage') => {
      if (e.target.files && e.target.files[0]) {
          const file = e.target.files[0];
          const { data, name } = await fileToBase64(file);
          const filenameField = `${field}Filename`;
          setNewDamageData(prev => ({...prev, [field]: data, [filenameField]: name}));
      }
  };

  const handleClearFile = (field: 'repairInvoice' | 'policeReportFile' | 'damageImage') => {
    const filenameField = `${field}Filename`;
    setNewDamageData(prev => ({...prev, [field]: undefined, [filenameField]: undefined}));
  };
  
  const handleUpdateChange = (id: string, field: keyof VehicleDamage, value: any) => {
      const damageToUpdate = damages.find(d => d.id === id);
      if (damageToUpdate) {
        let updatedDamage = { ...damageToUpdate, [field]: value };

        // FIX: If police report number is removed, also clear the associated amount.
        if (field === 'policeReportNumber') {
            const reservation = findReservationByBookingId(damageToUpdate.bookingId);
            const excessJOD = value ? (reservation?.excess || 0) * USD_TO_JOD_RATE : 0;
            updatedDamage.policeReportAmount = excessJOD;
        }

        onUpdateDamage(updatedDamage);
      }
  };

   const handleUpdateFileChange = async (id: string, field: 'repairInvoice' | 'policeReportFile' | 'damageImage', e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const { data, name } = await fileToBase64(file);
            const damageToUpdate = damages.find(d => d.id === id);
            if (damageToUpdate) {
                const filenameField = `${field}Filename`;
                onUpdateDamage({ ...damageToUpdate, [field]: data, [filenameField]: name });
            }
        }
    };

    const handleRemoveFile = (id: string, field: 'repairInvoice' | 'policeReportFile' | 'damageImage') => {
        const damageToUpdate = damages.find(d => d.id === id);
        if (damageToUpdate) {
            const filenameField = `${field}Filename`;
            const { [field]: fileData, [filenameField]: fileName, ...rest } = damageToUpdate as any;
            onUpdateDamage(rest);
        }
    };


  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!foundReservation) {
      setValidationError('A valid and existing Booking ID is required.');
      return;
    }
    if (!newDamageData.details.trim()) {
      setValidationError('Details about the damage are required.');
      return;
    }
    setValidationError('');
    
    // FIX: Prepare a clean data object based on whether a police report is involved.
    let dataToSubmit: Omit<VehicleDamage, 'id'>;

    if (hasPoliceReport) {
        if (!newDamageData.policeReportNumber?.trim()){
             setValidationError('Police Report number is required.');
             return;
        }
        dataToSubmit = {
            ...newDamageData,
            amount: 0, // No repair cost, only excess
            policeReportAmount: vehicleExcessJOD,
            repairInvoice: undefined,
            repairInvoiceFilename: undefined,
        };
    } else {
        if (newDamageData.amount <= 0) {
            setValidationError('Damage Repair Cost must be greater than zero.');
            return;
        }
        dataToSubmit = {
            ...newDamageData,
            policeReportNumber: '',
            policeReportAmount: 0,
            policeReportFile: undefined,
            policeReportFilename: undefined,
        };
    }

    onAddDamage(dataToSubmit);
    setNewDamageData(emptyDamage);
    setHasPoliceReport(false);
    setFoundReservation(null);
  };

  const handleEditClick = (damage: VehicleDamage) => {
    setPendingAction({ type: 'edit', payload: damage });
    setIsKeyModalOpen(true);
  };
  
  const handleDeleteClick = (damageId: string) => {
    setPendingAction({ type: 'delete', payload: damageId });
    setIsKeyModalOpen(true);
  };
  
  const handleKeySuccess = () => {
    if (!pendingAction) return;
    if (pendingAction.type === 'edit') {
      setOriginalDamage(pendingAction.payload);
      setEditingId(pendingAction.payload.id);
    } else if (pendingAction.type === 'delete') {
      setDamageToDelete(pendingAction.payload);
    }
    setIsKeyModalOpen(false);
    setPendingAction(null);
  };

  const handleSaveEdit = () => {
    setEditingId(null);
    setOriginalDamage(null);
  };

  const handleCancelEdit = () => {
    if (originalDamage) {
      onUpdateDamage(originalDamage);
    }
    setEditingId(null);
    setOriginalDamage(null);
  };

  const handleConfirmDelete = () => {
    if (damageToDelete) {
      onDeleteDamage(damageToDelete);
    }
    setDamageToDelete(null);
  };

  const handleSendEmail = (type: 'claim' | 'receipt', damage: VehicleDamage, renter: Reservation) => {
    const signature = `\n\nSincerely,\nUR-Drive Jordan\n${companyDetails.address}\nPhone: ${companyDetails.phone}\nEmail: ${companyDetails.email}`;
    const claimableAmount = (damage.policeReportAmount && damage.policeReportAmount > 0)
                            ? damage.policeReportAmount
                            : damage.amount;

    const subject = type === 'claim'
        ? `Action Required: Vehicle Damage Claim for Rental ${renter.bookingId}`
        : `Receipt for Vehicle Damage Payment - Rental ${renter.bookingId}`;
    
    const body = type === 'claim'
        ? `Dear ${renter.personName},\n\nThis notice is regarding vehicle damage reported during your rental of a ${renter.carModel} (Booking ID: ${renter.bookingId}).\n\nDamage Details:\n- Description: ${damage.details}\n${damage.policeReportNumber ? `- Police Report #: ${damage.policeReportNumber}\n` : ''}\n- Amount Due: ${claimableAmount.toFixed(2)} JOD\n\nPlease contact our office to discuss this matter and arrange for payment.${signature.replace('Sincerely', 'Thank you')}`
        : `Dear ${renter.personName},\n\nThis email confirms your payment for the vehicle damage claim associated with your rental (Booking ID: ${renter.bookingId}).\n\nPayment Details:\n- Amount Paid: ${claimableAmount.toFixed(2)} JOD\n- Status: COLLECTED\n\nWe appreciate your cooperation.${signature}`;

    window.location.href = `mailto:${renter.customerEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const headers = ['Booking ID', 'Renter', 'Car', 'Period', 'Repair Cost (JOD)', 'Police Report #', 'Collected Amount (JOD)', 'Status', 'Details', 'Damage Image', 'Invoice', 'Police Report', 'Actions'];

  return (
    <div className="p-4 sm:p-6 bg-white">
      <h3 className="text-2xl font-bold text-gray-800 mb-4 flex items-center gap-2">
        <ShieldExclamationIcon /> Vehicle Damage Management
      </h3>
      
      {hasManagePermission && (
          <form onSubmit={handleAddSubmit} className="p-4 bg-gray-50 rounded-lg border border-gray-200 mb-6 space-y-4">
            <h4 className="text-lg font-semibold text-gray-700">Add New Damage Report</h4>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                 <div>
                    <label className="block text-sm font-medium text-gray-700">Booking ID</label>
                    <input type="text" value={newDamageData.bookingId} onChange={e => handleInputChange('bookingId', e.target.value)} placeholder="Enter Booking ID to link" className="w-full p-2 mt-1 border border-gray-300 rounded-md text-sm focus:ring-secondary focus:border-secondary" required/>
                 </div>
                 <div>
                     <label className="block text-sm font-medium text-gray-700 invisible">Has Police Report</label>
                     <div className="flex items-center mt-1 p-2 h-[42px]">
                        <input
                            type="checkbox"
                            id="hasPoliceReport"
                            checked={hasPoliceReport}
                            onChange={e => handleHasReportChange(e.target.checked)}
                            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-secondary"
                        />
                        <label htmlFor="hasPoliceReport" className="ml-2 text-sm font-medium text-gray-700">Incident involves a police report</label>
                    </div>
                 </div>
            </div>
            
            {foundReservation ? (
                <div className="p-2 text-sm bg-green-100 border border-green-200 text-green-800 rounded-md">
                    <strong>Reservation Found:</strong> {foundReservation.personName} ({foundReservation.carModel}) - <strong>Vehicle Excess: {vehicleExcessJOD.toFixed(2)} JOD</strong>
                </div>
            ) : newDamageData.bookingId ? (
                 <div className="p-2 text-sm bg-red-100 border border-red-200 text-red-800 rounded-md">
                    No reservation found with this Booking ID.
                </div>
            ) : null}

            {/* Conditional Fields */}
            {hasPoliceReport ? (
                <div className="space-y-4 pt-2 border-t">
                     <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Police Report #</label>
                            <input type="text" value={newDamageData.policeReportNumber} onChange={e => handleInputChange('policeReportNumber', e.target.value)} className="w-full p-2 mt-1 border border-gray-300 rounded-md text-sm focus:ring-secondary focus:border-secondary" required={hasPoliceReport} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Amount to Collect (Vehicle Excess)</label>
                            <div className="w-full p-2 mt-1 bg-gray-200 border border-gray-300 rounded-md text-sm">
                                {vehicleExcessJOD.toFixed(2)} JOD
                            </div>
                        </div>
                         <div>
                            <label className="block text-sm font-medium text-gray-700">Police Report Document</label>
                            {newDamageData.policeReportFile ? (
                                <div className="flex items-center gap-2 mt-1 p-2 bg-white border rounded-md">
                                    <DocumentTextIcon />
                                    <span className="text-sm text-gray-600 truncate flex-grow" title={newDamageData.policeReportFilename}>{newDamageData.policeReportFilename}</span>
                                    <button type="button" onClick={() => handleClearFile('policeReportFile')} className="text-red-500 hover:text-red-700 p-1"><TrashIcon /></button>
                                </div>
                            ) : (
                                <>
                                    <input type="file" id="report-upload" className="hidden" onChange={(e) => handleFileChange(e, 'policeReportFile')} accept="image/*,.pdf" />
                                    <label htmlFor="report-upload" className="cursor-pointer mt-1 inline-flex items-center gap-2 px-3 py-2 bg-white text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 text-sm font-medium">
                                        <UploadIcon /> Select File
                                    </label>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            ) : (
                <div className="space-y-4 pt-2 border-t">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                         <div>
                            <label className="block text-sm font-medium text-gray-700">Damage Repair Cost (JOD)</label>
                            <input type="number" step="0.01" value={newDamageData.amount || ''} placeholder="0.00" onChange={e => handleInputChange('amount', parseFloat(e.target.value) || 0)} className="w-full p-2 mt-1 border border-gray-300 rounded-md text-sm focus:ring-secondary focus:border-secondary" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Repair Invoice</label>
                            {newDamageData.repairInvoice ? (
                                <div className="flex items-center gap-2 mt-1 p-2 bg-white border rounded-md">
                                    <DocumentTextIcon />
                                    <span className="text-sm text-gray-600 truncate flex-grow" title={newDamageData.repairInvoiceFilename}>{newDamageData.repairInvoiceFilename}</span>
                                    <button type="button" onClick={() => handleClearFile('repairInvoice')} className="text-red-500 hover:text-red-700 p-1"><TrashIcon /></button>
                                </div>
                            ) : (
                                <>
                                    <input type="file" id="invoice-upload" className="hidden" onChange={(e) => handleFileChange(e, 'repairInvoice')} accept="image/*,.pdf" />
                                    <label htmlFor="invoice-upload" className="cursor-pointer mt-1 inline-flex items-center gap-2 px-3 py-2 bg-white text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 text-sm font-medium">
                                        <UploadIcon /> Select File
                                    </label>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700">Damage Details</label>
                    <textarea value={newDamageData.details} onChange={e => handleInputChange('details', e.target.value)} rows={3} placeholder="e.g., Large scratch on passenger door" className="w-full p-2 mt-1 border border-gray-300 rounded-md text-sm focus:ring-secondary focus:border-secondary" required></textarea>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700">Car Damage Image</label>
                    {newDamageData.damageImage ? (
                        <div className="flex items-center gap-2 mt-1 p-2 bg-white border rounded-md">
                            <DocumentTextIcon />
                            <span className="text-sm text-gray-600 truncate flex-grow" title={newDamageData.damageImageFilename}>{newDamageData.damageImageFilename}</span>
                            <button type="button" onClick={() => handleClearFile('damageImage')} className="text-red-500 hover:text-red-700 p-1"><TrashIcon /></button>
                        </div>
                    ) : (
                        <>
                            <input type="file" id="damage-image-upload" className="hidden" onChange={(e) => handleFileChange(e, 'damageImage')} accept="image/*" />
                            <label htmlFor="damage-image-upload" className="cursor-pointer mt-1 inline-flex items-center gap-2 px-3 py-2 bg-white text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 text-sm font-medium">
                                <UploadIcon /> Select Image
                            </label>
                        </>
                    )}
                </div>
            </div>
            
            <div>
                <label className="block text-sm font-medium text-gray-700">
                  Collection Status
                </label>
                <p className="text-xs text-gray-500 mb-1">
                  Applies to {hasPoliceReport ? 'Vehicle Excess Amount' : 'Repair Cost'}.
                </p>
                <select value={newDamageData.status} onChange={e => handleInputChange('status', e.target.value)} className="w-full md:w-1/3 p-2 border border-gray-300 rounded-md text-sm focus:ring-secondary focus:border-secondary">
                    <option value={VehicleDamageStatus.NOT_COLLECTED}>Not Collected</option>
                    <option value={VehicleDamageStatus.COLLECTED}>Collected</option>
                </select>
            </div>
            {validationError && <p className="text-sm text-red-600">{validationError}</p>}
            <div className="text-right">
                <button type="submit" disabled={!foundReservation} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-md hover:bg-secondary transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary text-sm font-medium disabled:bg-gray-400 disabled:cursor-not-allowed">
                    <PlusIcon /> Add Damage Report
                </button>
            </div>
          </form>
      )}
      
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 pt-6 border-t border-gray-200 mt-6">
          <h4 className="text-lg font-semibold text-gray-700">Recorded Damages</h4>
          <div className="flex items-center gap-4 mt-3 sm:mt-0">
              <div>
                  <label htmlFor="damage-status-filter" className="text-sm font-medium text-gray-700 mr-2">Filter by status:</label>
                  <select
                      id="damage-status-filter"
                      value={statusFilter}
                      onChange={e => setStatusFilter(e.target.value as VehicleDamageStatus | '')}
                      className="p-2 border border-gray-300 rounded-md text-sm focus:ring-secondary focus:border-secondary"
                  >
                      <option value="">All Statuses</option>
                      <option value={VehicleDamageStatus.COLLECTED}>Collected</option>
                      <option value={VehicleDamageStatus.NOT_COLLECTED}>Not Collected</option>
                  </select>
              </div>
          </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>{headers.map(h => <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>)}</tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredDamages.map(damage => {
              const res = findReservationByBookingId(damage.bookingId);
              const isEditing = editingId === damage.id;
              const canSendEmail = res && res.customerEmail;
              const hasReport = !!damage.policeReportNumber;
              const claimableAmount = hasReport ? (damage.policeReportAmount || 0) : damage.amount;

              return (
                <tr key={damage.id} className={isEditing ? 'bg-yellow-50' : ''}>
                  <td className="px-4 py-3 whitespace-nowrap text-sm">{damage.bookingId}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm">{res?.personName || <span className="text-gray-400">N/A</span>}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm">{res?.carModel || <span className="text-gray-400">N/A</span>}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm">{res ? `${res.startDate} to ${res.endDate}` : <span className="text-gray-400">N/A</span>}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm">
                    {isEditing && !hasReport && hasManagePermission ? <input type="number" value={damage.amount || ''} placeholder="0.00" onChange={e => handleUpdateChange(damage.id, 'amount', parseFloat(e.target.value) || 0)} className="w-24 p-1 border rounded"/> : (hasReport ? 'N/A' : `${damage.amount.toFixed(2)} JOD`)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm">{isEditing && hasManagePermission ? <input type="text" value={damage.policeReportNumber || ''} onChange={e => handleUpdateChange(damage.id, 'policeReportNumber', e.target.value)} placeholder={!hasReport ? 'N/A' : 'Report #'} disabled={!hasReport} className="w-32 p-1 border rounded disabled:bg-gray-200" /> : damage.policeReportNumber || 'N/A'}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm">{isEditing && hasManagePermission ? <input type="number" readOnly value={damage.policeReportAmount || 0} className="w-24 p-1 border rounded bg-gray-200"/> : (damage.policeReportAmount ? `${damage.policeReportAmount.toFixed(2)} JOD` : 'N/A')}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm">
                    {isEditing && hasManagePermission ? (
                        <select value={damage.status} onChange={e => handleUpdateChange(damage.id, 'status', e.target.value)} className="w-full p-1 border rounded">
                            <option value={VehicleDamageStatus.NOT_COLLECTED}>Not Collected</option>
                            <option value={VehicleDamageStatus.COLLECTED}>Collected</option>
                        </select>
                    ) : (
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${claimableAmount > 0 ? (damage.status === VehicleDamageStatus.COLLECTED ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800') : 'bg-gray-100 text-gray-800'}`}>
                            {claimableAmount > 0 ? damage.status.replace('_', ' ') : 'N/A'}
                        </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm" style={{minWidth: '200px', whiteSpace: 'normal'}}>
                      {isEditing && hasManagePermission ? <textarea value={damage.details} onChange={e => handleUpdateChange(damage.id, 'details', e.target.value)} className="w-full p-1 border rounded" rows={2}/> : damage.details}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-center">
                    {isEditing && hasManagePermission ? (
                         <div>
                            {damage.damageImage ? (
                                <div className="flex items-center justify-center gap-2">
                                    <a href={damage.damageImage} target="_blank" rel="noopener noreferrer" title={damage.damageImageFilename} className="text-blue-600 p-1"><DocumentTextIcon /></a>
                                    <button onClick={() => handleRemoveFile(damage.id, 'damageImage')} className="text-red-500 p-1" title="Remove Image"><TrashIcon /></button>
                                </div>
                            ) : (
                                <><input type="file" id={`edit-damage-image-${damage.id}`} className="hidden" onChange={(e) => handleUpdateFileChange(damage.id, 'damageImage', e)} accept="image/*"/><label htmlFor={`edit-damage-image-${damage.id}`} className="cursor-pointer text-blue-600 p-1" title="Upload Image"><UploadIcon /></label></>
                            )}
                        </div>
                    ) : (
                        <FileActions fileData={damage.damageImage} fileName={damage.damageImageFilename} />
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-center">
                    {isEditing && !hasReport && hasManagePermission ? (
                         <div>
                            {damage.repairInvoice ? (
                                <div className="flex items-center justify-center gap-2">
                                    <a href={damage.repairInvoice} target="_blank" rel="noopener noreferrer" title={damage.repairInvoiceFilename} className="text-blue-600 p-1"><DocumentTextIcon /></a>
                                    <button onClick={() => handleRemoveFile(damage.id, 'repairInvoice')} className="text-red-500 p-1" title="Remove Invoice"><TrashIcon /></button>
                                </div>
                            ) : (
                                <><input type="file" id={`edit-invoice-${damage.id}`} className="hidden" onChange={(e) => handleUpdateFileChange(damage.id, 'repairInvoice', e)} accept="image/*,.pdf"/><label htmlFor={`edit-invoice-${damage.id}`} className="cursor-pointer text-blue-600 p-1" title="Upload Invoice"><UploadIcon /></label></>
                            )}
                        </div>
                    ) : (
                       <FileActions fileData={damage.repairInvoice} fileName={damage.repairInvoiceFilename} />
                    )}
                  </td>
                   <td className="px-4 py-3 whitespace-nowrap text-sm text-center">
                    {isEditing && hasReport && hasManagePermission ? (
                         <div>
                            {damage.policeReportFile ? (
                                <div className="flex items-center justify-center gap-2">
                                    <a href={damage.policeReportFile} target="_blank" rel="noopener noreferrer" title={damage.policeReportFilename} className="text-blue-600 p-1"><DocumentTextIcon /></a>
                                    <button onClick={() => handleRemoveFile(damage.id, 'policeReportFile')} className="text-red-500 p-1" title="Remove Report"><TrashIcon /></button>
                                </div>
                            ) : (
                                <><input type="file" id={`edit-report-${damage.id}`} className="hidden" onChange={(e) => handleUpdateFileChange(damage.id, 'policeReportFile', e)} accept="image/*,.pdf"/><label htmlFor={`edit-report-${damage.id}`} className="cursor-pointer text-blue-600 p-1" title="Upload Report"><UploadIcon /></label></>
                            )}
                        </div>
                    ) : (
                       <FileActions fileData={damage.policeReportFile} fileName={damage.policeReportFilename} />
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
                            {claimableAmount > 0 && (
                                <>
                                {damage.status === VehicleDamageStatus.NOT_COLLECTED ? (
                                    <button 
                                        onClick={() => handleSendEmail('claim', damage, res!)}
                                        disabled={!canSendEmail}
                                        className="flex items-center gap-1.5 px-2 py-1 bg-orange-500 text-white rounded-md text-xs hover:bg-orange-600 disabled:bg-gray-400"
                                        title={canSendEmail ? "Send claim email to renter" : "Renter email not found in voucher"}
                                    >
                                        <PaperAirplaneIcon /> Send Claim
                                    </button>
                                ) : (
                                    <button 
                                        onClick={() => handleSendEmail('receipt', damage, res!)}
                                        disabled={!canSendEmail}
                                        className="flex items-center gap-1.5 px-2 py-1 bg-green-500 text-white rounded-md text-xs hover:bg-green-600 disabled:bg-gray-400"
                                        title={canSendEmail ? "Send receipt email to renter" : "Renter email not found in voucher"}
                                    >
                                        <PaperAirplaneIcon /> Send Receipt
                                    </button>
                                )}
                                </>
                            )}
                             {hasManagePermission && (
                                <div className="flex items-center border-l pl-2 ml-1">
                                    <button onClick={() => handleEditClick(damage)} className="p-1 text-blue-500 hover:text-blue-700" title="Edit"><EditIcon /></button>
                                    <button onClick={() => handleDeleteClick(damage.id)} className="p-1 text-red-500 hover:text-red-700" title="Delete"><TrashIcon /></button>
                                </div>
                            )}
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {filteredDamages.length === 0 && (
                <tr>
                    <td colSpan={headers.length} className="text-center py-10 text-gray-500">
                        {damages.length > 0 ? 'No damages match the current filter.' : 'No vehicle damages have been recorded yet.'}
                    </td>
                </tr>
            )}
          </tbody>
        </table>
      </div>

      {damageToDelete && (
        <ConfirmationDialog 
            message="Are you sure you want to delete this damage report? This action cannot be undone."
            onConfirm={handleConfirmDelete}
            onCancel={() => setDamageToDelete(null)}
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

export default VehicleDamages;