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
  const [showAddForm, setShowAddForm] = useState(false);
  
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
    setShowAddForm(false);
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
        ? `Dear ${renter.personName},\n\nThis notice is regarding vehicle damage reported during your rental of a ${renter.carModel} (Booking ID: ${renter.bookingId}).\n\nDamage Details:\n- Description: ${damage.details}\n${damage.policeReportNumber ? `- Police Report #: ${damage.policeReportNumber}\n` : ''}\n- Amount Due: ${money(claimableAmount)} JOD\n\nPlease contact our office to discuss this matter and arrange for payment.${signature.replace('Sincerely', 'Thank you')}`
        : `Dear ${renter.personName},\n\nThis email confirms your payment for the vehicle damage claim associated with your rental (Booking ID: ${renter.bookingId}).\n\nPayment Details:\n- Amount Paid: ${money(claimableAmount)} JOD\n- Status: COLLECTED\n\nWe appreciate your cooperation.${signature}`;

    window.location.href = `mailto:${renter.customerEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };


  const num = (v: unknown) => parseFloat(money(v));
  const claimableOf = (damage: VehicleDamage) => (damage.policeReportNumber ? num(damage.policeReportAmount) : num(damage.amount));

  const stats = useMemo(() => {
    let collected = 0, outstanding = 0, outstandingCount = 0;
    damages.forEach(d => {
      const amt = claimableOf(d);
      if (amt <= 0) return;
      if (d.status === VehicleDamageStatus.COLLECTED) collected += amt;
      else { outstanding += amt; outstandingCount += 1; }
    });
    return { total: damages.length, collected, outstanding, outstandingCount };
  }, [damages]);

  const rows = filteredDamages.map(damage => ({ damage, res: findReservationByBookingId(damage.bookingId) }));

  type FileField = 'repairInvoice' | 'policeReportFile' | 'damageImage';
  const FILE_META: Record<FileField, { label: string; name: 'repairInvoiceFilename' | 'policeReportFilename' | 'damageImageFilename'; accept: string; idPrefix: string }> = {
    damageImage: { label: 'Damage image', name: 'damageImageFilename', accept: 'image/*', idPrefix: 'edit-damage-image' },
    repairInvoice: { label: 'Repair invoice', name: 'repairInvoiceFilename', accept: 'image/*,.pdf', idPrefix: 'edit-invoice' },
    policeReportFile: { label: 'Police report', name: 'policeReportFilename', accept: 'image/*,.pdf', idPrefix: 'edit-report' },
  };

  const statusPill = (damage: VehicleDamage) => {
    const claimable = claimableOf(damage);
    if (claimable <= 0) {
      return <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset whitespace-nowrap bg-slate-100 text-slate-600 ring-slate-200">Nothing to collect</span>;
    }
    const done = damage.status === VehicleDamageStatus.COLLECTED;
    return (
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset whitespace-nowrap ${done ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-amber-50 text-amber-700 ring-amber-200'}`}>
        {done ? 'Collected' : 'Not collected'}
      </span>
    );
  };

  const statusSelect = (damage: VehicleDamage) => (
    <select value={damage.status} onChange={e => handleUpdateChange(damage.id, 'status', e.target.value)} className={editCls}>
      <option value={VehicleDamageStatus.NOT_COLLECTED}>Not Collected</option>
      <option value={VehicleDamageStatus.COLLECTED}>Collected</option>
    </select>
  );

  // One file slot (image / invoice / police report) in view or edit mode.
  const renderFile = (damage: VehicleDamage, field: FileField, editable: boolean, view: 'd' | 'm') => {
    const meta = FILE_META[field];
    const data = damage[field];
    const name = damage[meta.name];
    let control: React.ReactNode;
    if (editable) {
      control = data ? (
        <div className="inline-flex items-center gap-0.5">
          <a href={data} target="_blank" rel="noopener noreferrer" title={name} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"><DocumentTextIcon className="w-4 h-4" /></a>
          <button type="button" onClick={() => handleRemoveFile(damage.id, field)} className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50" title={`Remove ${meta.label.toLowerCase()}`}><TrashIcon className="w-4 h-4" /></button>
        </div>
      ) : (
        <>
          <input type="file" id={`${meta.idPrefix}-${view}-${damage.id}`} className="hidden" onChange={(e) => handleUpdateFileChange(damage.id, field, e)} accept={meta.accept} />
          <label htmlFor={`${meta.idPrefix}-${view}-${damage.id}`} className="cursor-pointer inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg ring-1 ring-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50" title={`Upload ${meta.label.toLowerCase()}`}><UploadIcon className="w-4 h-4" /> Upload</label>
        </>
      );
    } else {
      control = <FileActions fileData={data} fileName={name} />;
    }
    return (
      <div key={field} className="flex items-center justify-between gap-3 min-h-[32px]">
        <span className="text-xs text-slate-500 whitespace-nowrap">{meta.label}</span>
        {control}
      </div>
    );
  };

  const renderFiles = (damage: VehicleDamage, isEditing: boolean, view: 'd' | 'm') => {
    const hasReport = !!damage.policeReportNumber;
    const edit = isEditing && !!hasManagePermission;
    return (
      <div className="space-y-0.5">
        {renderFile(damage, 'damageImage', edit, view)}
        {renderFile(damage, 'repairInvoice', edit && !hasReport, view)}
        {renderFile(damage, 'policeReportFile', edit && hasReport, view)}
      </div>
    );
  };

  const renderActions = (damage: VehicleDamage, res: Reservation | null, isEditing: boolean, full = false) => {
    const canSendEmail = !!(res && res.customerEmail);
    if (isEditing && hasManagePermission) {
      return (
        <div className={`${full ? 'grid grid-cols-2' : 'inline-flex'} gap-2`}>
          <button type="button" onClick={handleSaveEdit} className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700" title="Save"><SaveIcon className="w-4 h-4" /> Done</button>
          <button type="button" onClick={handleCancelEdit} className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-white ring-1 ring-slate-200 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-50" title="Cancel"><CancelIcon className="w-4 h-4" /> Cancel</button>
        </div>
      );
    }
    const isClaim = damage.status === VehicleDamageStatus.NOT_COLLECTED;
    return (
      <div className={`flex items-center gap-2 ${full ? '' : 'justify-end'}`}>
        {claimableOf(damage) > 0 && (
          <button
            type="button"
            onClick={() => handleSendEmail(isClaim ? 'claim' : 'receipt', damage, res!)}
            disabled={!canSendEmail}
            className={`inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold ring-1 ring-inset whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed ${full ? 'flex-1' : ''} ${isClaim ? 'bg-amber-50 text-amber-700 ring-amber-200 hover:bg-amber-100' : 'bg-emerald-50 text-emerald-700 ring-emerald-200 hover:bg-emerald-100'}`}
            title={canSendEmail ? (isClaim ? 'Send claim email to renter' : 'Send receipt email to renter') : 'Renter email not found in voucher'}
          >
            <PaperAirplaneIcon className="w-4 h-4" /> {isClaim ? 'Send claim' : 'Send receipt'}
          </button>
        )}
        {full && claimableOf(damage) <= 0 && <span className="flex-1" />}
        {hasManagePermission && (
          <>
            <button type="button" onClick={() => handleEditClick(damage)} className="p-2 rounded-lg text-slate-500 hover:bg-indigo-50 hover:text-indigo-600" title="Edit" aria-label="Edit damage report"><EditIcon className="w-4 h-4" /></button>
            <button type="button" onClick={() => handleDeleteClick(damage.id)} className="p-2 rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-600" title="Delete" aria-label="Delete damage report"><TrashIcon className="w-4 h-4" /></button>
          </>
        )}
      </div>
    );
  };

  const repairCostCell = (damage: VehicleDamage, isEditing: boolean) => {
    const hasReport = !!damage.policeReportNumber;
    if (isEditing && !hasReport && hasManagePermission) {
      return <input type="number" value={damage.amount || ''} placeholder="0.00" onChange={e => handleUpdateChange(damage.id, 'amount', parseFloat(e.target.value) || 0)} className={`${editCls} w-28 text-right`} />;
    }
    return hasReport ? <span className="text-slate-300">-</span> : `${money(damage.amount)} JOD`;
  };

  const reportNumberCell = (damage: VehicleDamage, isEditing: boolean) => {
    const hasReport = !!damage.policeReportNumber;
    if (isEditing && hasManagePermission) {
      return <input type="text" value={damage.policeReportNumber || ''} onChange={e => handleUpdateChange(damage.id, 'policeReportNumber', e.target.value)} placeholder={!hasReport ? 'N/A' : 'Report #'} disabled={!hasReport} className={`${editCls} w-32 disabled:bg-slate-100 disabled:text-slate-400`} />;
    }
    return damage.policeReportNumber ? <span className="font-mono text-xs">{damage.policeReportNumber}</span> : <span className="text-slate-300">-</span>;
  };

  const excessCell = (damage: VehicleDamage, isEditing: boolean) => {
    if (isEditing && hasManagePermission) {
      return <input type="number" readOnly value={damage.policeReportAmount || 0} className={`${editCls} w-28 text-right bg-slate-100 text-slate-500`} />;
    }
    return damage.policeReportAmount ? `${money(damage.policeReportAmount)} JOD` : <span className="text-slate-300">-</span>;
  };

  const filterOptions: { key: VehicleDamageStatus | ''; label: string }[] = [
    { key: '', label: 'All' },
    { key: VehicleDamageStatus.NOT_COLLECTED, label: 'Not collected' },
    { key: VehicleDamageStatus.COLLECTED, label: 'Collected' },
  ];

  const headers = ['Booking / renter', 'Rental period', 'Repair cost', 'Police report #', 'Excess collected', 'Status', 'Details', 'Files', ''];

  const fileSlot = (field: FileField, id: string, accept: string, label: string) => (
    <div>
      <label className={labelCls}>{label}</label>
      {newDamageData[field] ? (
        <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl">
          <DocumentTextIcon className="w-4 h-4 text-slate-400 shrink-0" />
          <span className="text-sm text-slate-700 truncate flex-1 min-w-0" title={newDamageData[FILE_META[field].name]}>{newDamageData[FILE_META[field].name]}</span>
          <button type="button" onClick={() => handleClearFile(field)} className="p-1 rounded-lg text-rose-500 hover:bg-rose-50" aria-label="Remove file"><TrashIcon className="w-4 h-4" /></button>
        </div>
      ) : (
        <>
          <input type="file" id={id} className="hidden" onChange={(e) => handleFileChange(e, field)} accept={accept} />
          <label htmlFor={id} className="cursor-pointer flex items-center justify-center gap-2 px-3 py-2.5 bg-white text-slate-600 border border-dashed border-slate-300 rounded-xl hover:bg-slate-50 text-sm font-semibold">
            <UploadIcon className="w-4 h-4" /> {field === 'damageImage' ? 'Select image' : 'Select file'}
          </label>
        </>
      )}
    </div>
  );

  return (
    <div className="space-y-5 mb-10">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
        <div className="p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
              <ShieldExclamationIcon className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Vehicle damages</h2>
              <p className="text-sm text-slate-500">Damage reports per booking, repair costs, police reports and excess collection.</p>
            </div>
          </div>
          {hasManagePermission && (
            <button onClick={() => setShowAddForm(true)} className="w-full lg:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 shadow-sm whitespace-nowrap">
              <PlusIcon className="w-4 h-4" /> Add damage report
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 border-t border-slate-100 divide-x divide-y lg:divide-y-0 divide-slate-100">
          {[
            { label: 'Reports', value: String(stats.total), tone: 'text-slate-900' },
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
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Recorded damages · {filteredDamages.length}</p>
          <div className="grid grid-cols-3 sm:inline-flex p-1 bg-slate-100 rounded-xl" role="group" aria-label="Filter by status">
            {filterOptions.map(o => (
              <button key={o.label} onClick={() => setStatusFilter(o.key)}
                className={`px-3 py-1.5 text-xs sm:text-sm font-semibold rounded-lg whitespace-nowrap ${statusFilter === o.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {filteredDamages.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <div className="mx-auto w-12 h-12 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center">
              <ShieldExclamationIcon className="w-6 h-6" />
            </div>
            <p className="mt-3 font-semibold text-slate-700">{damages.length > 0 ? 'No damages match this filter' : 'No vehicle damages recorded'}</p>
            <p className="text-sm text-slate-500">{damages.length > 0 ? 'Choose a different status to see more reports.' : 'Damage reports will appear here, linked to their booking.'}</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                  <tr>{headers.map((h, i) => <th key={i} className={`px-4 py-3 font-semibold ${i === 2 || i === 4 ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map(({ damage, res }) => {
                    const isEditing = editingId === damage.id;
                    return (
                      <tr key={damage.id} className={`align-top ${isEditing ? 'bg-amber-50/50' : 'hover:bg-slate-50/70'}`}>
                        <td className="px-4 py-3 min-w-[160px]">
                          <p className="font-semibold text-slate-900">{res?.personName || <span className="text-slate-400 font-normal">Unknown renter</span>}</p>
                          <p className="text-xs text-slate-500"><span className="font-mono">#{damage.bookingId}</span>{res?.carModel ? ` · ${res.carModel}` : ''}</p>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-600 tabular-nums">{res ? <>{res.startDate}<br />{res.endDate}</> : <span className="text-slate-400">-</span>}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-right font-semibold text-slate-900 tabular-nums">{repairCostCell(damage, isEditing)}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-slate-700">{reportNumberCell(damage, isEditing)}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-right font-semibold text-slate-900 tabular-nums">{excessCell(damage, isEditing)}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{isEditing && hasManagePermission ? statusSelect(damage) : statusPill(damage)}</td>
                        <td className="px-4 py-3 text-slate-600 min-w-[200px] max-w-xs">{isEditing && hasManagePermission ? <textarea value={damage.details} onChange={e => handleUpdateChange(damage.id, 'details', e.target.value)} className={editCls} rows={2} /> : (damage.details || <span className="text-slate-300">-</span>)}</td>
                        <td className="px-4 py-3 min-w-[190px]">{renderFiles(damage, isEditing, 'd')}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-right">{renderActions(damage, res, isEditing)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <ul className="md:hidden divide-y divide-slate-100">
              {rows.map(({ damage, res }) => {
                const isEditing = editingId === damage.id;
                const hasReport = !!damage.policeReportNumber;
                const editing = isEditing && !!hasManagePermission;
                return (
                  <li key={damage.id} className={`px-4 py-4 space-y-3 ${isEditing ? 'bg-amber-50/50' : ''}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 truncate">{res?.personName || 'Unknown renter'}</p>
                        <p className="text-xs text-slate-500 truncate"><span className="font-mono">#{damage.bookingId}</span>{res?.carModel ? ` · ${res.carModel}` : ''}</p>
                      </div>
                      {!editing && (
                        <div className="text-right shrink-0">
                          <p className="font-bold text-slate-900 tabular-nums">{money(claimableOf(damage))} JOD</p>
                          <div className="mt-1">{statusPill(damage)}</div>
                        </div>
                      )}
                    </div>
                    {editing ? (
                      <div className="grid grid-cols-2 gap-2">
                        {!hasReport && <div className="col-span-2"><label className={labelCls}>Repair cost (JOD)</label>{repairCostCell(damage, isEditing)}</div>}
                        {hasReport && <div><label className={labelCls}>Police report #</label>{reportNumberCell(damage, isEditing)}</div>}
                        {hasReport && <div><label className={labelCls}>Excess (JOD)</label>{excessCell(damage, isEditing)}</div>}
                        <div className="col-span-2"><label className={labelCls}>Status</label>{statusSelect(damage)}</div>
                        <div className="col-span-2"><label className={labelCls}>Details</label><textarea value={damage.details} onChange={e => handleUpdateChange(damage.id, 'details', e.target.value)} className={editCls} rows={2} /></div>
                      </div>
                    ) : (
                      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                        <dt className="text-slate-400">Type</dt><dd className="text-slate-700 text-right">{hasReport ? 'Police report' : 'Repair'}</dd>
                        {hasReport
                          ? <><dt className="text-slate-400">Report #</dt><dd className="text-slate-700 text-right font-mono truncate">{damage.policeReportNumber}</dd></>
                          : <><dt className="text-slate-400">Repair cost</dt><dd className="text-slate-700 text-right tabular-nums">{money(damage.amount)} JOD</dd></>}
                        <dt className="text-slate-400">Rental</dt><dd className="text-slate-700 text-right tabular-nums">{res ? `${res.startDate} – ${res.endDate}` : '-'}</dd>
                        {damage.details && <dd className="col-span-2 mt-1 text-sm text-slate-600 break-words">{damage.details}</dd>}
                      </dl>
                    )}
                    <div className="rounded-xl bg-slate-50 px-3 py-1.5">{renderFiles(damage, isEditing, 'm')}</div>
                    {renderActions(damage, res, isEditing, true)}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      {/* Add damage modal */}
      {hasManagePermission && showAddForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 sm:p-4" onClick={() => setShowAddForm(false)}>
          <form onSubmit={handleAddSubmit} onClick={e => e.stopPropagation()} className="w-full sm:max-w-3xl max-h-[92vh] flex flex-col bg-white rounded-t-2xl sm:rounded-2xl shadow-xl">
            <div className="px-5 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-lg font-bold text-slate-900">Add damage report</h3>
                <p className="text-sm text-slate-500">Link the damage to an existing booking.</p>
              </div>
              <button type="button" onClick={() => setShowAddForm(false)} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close"><CancelIcon className="w-5 h-5" /></button>
            </div>
            <div className="px-5 sm:px-6 py-5 space-y-5 overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Booking ID</label>
                  <input type="text" value={newDamageData.bookingId} onChange={e => handleInputChange('bookingId', e.target.value)} placeholder="Enter booking ID" className={inputCls} required autoFocus />
                </div>
                <div className="sm:pt-6">
                  <label htmlFor="hasPoliceReport" className="flex items-center gap-3 px-3 py-2.5 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50">
                    <input
                      type="checkbox"
                      id="hasPoliceReport"
                      checked={hasPoliceReport}
                      onChange={e => handleHasReportChange(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-sm font-medium text-slate-700">Incident involves a police report</span>
                  </label>
                </div>
              </div>

              {foundReservation ? (
                <div className="px-3 py-2.5 text-sm bg-emerald-50 ring-1 ring-inset ring-emerald-200 text-emerald-800 rounded-xl">
                  <span className="font-semibold">Reservation found:</span> {foundReservation.personName} ({foundReservation.carModel}) · Vehicle excess <span className="font-semibold tabular-nums">{vehicleExcessJOD.toFixed(2)} JOD</span>
                </div>
              ) : newDamageData.bookingId ? (
                <div className="px-3 py-2.5 text-sm bg-rose-50 ring-1 ring-inset ring-rose-200 text-rose-700 rounded-xl">
                  No reservation found with this booking ID.
                </div>
              ) : null}

              <div className="pt-4 border-t border-slate-100">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-3">{hasPoliceReport ? 'Police report' : 'Repair'}</p>
                {hasPoliceReport ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <label className={labelCls}>Police report #</label>
                      <input type="text" value={newDamageData.policeReportNumber} onChange={e => handleInputChange('policeReportNumber', e.target.value)} className={inputCls} required={hasPoliceReport} />
                    </div>
                    <div>
                      <label className={labelCls}>Amount to collect (vehicle excess)</label>
                      <div className="px-3 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 tabular-nums">{vehicleExcessJOD.toFixed(2)} JOD</div>
                    </div>
                    {fileSlot('policeReportFile', 'report-upload', 'image/*,.pdf', 'Police report document')}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className={labelCls}>Damage repair cost (JOD)</label>
                      <input type="number" step="0.01" value={newDamageData.amount || ''} placeholder="0.00" onChange={e => handleInputChange('amount', parseFloat(e.target.value) || 0)} className={inputCls} />
                    </div>
                    {fileSlot('repairInvoice', 'invoice-upload', 'image/*,.pdf', 'Repair invoice')}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Damage details</label>
                  <textarea value={newDamageData.details} onChange={e => handleInputChange('details', e.target.value)} rows={3} placeholder="e.g. Large scratch on passenger door" className={inputCls} required></textarea>
                </div>
                <div className="space-y-4">
                  {fileSlot('damageImage', 'damage-image-upload', 'image/*', 'Car damage image')}
                  <div>
                    <label className={labelCls}>Collection status</label>
                    <select value={newDamageData.status} onChange={e => handleInputChange('status', e.target.value)} className={inputCls}>
                      <option value={VehicleDamageStatus.NOT_COLLECTED}>Not Collected</option>
                      <option value={VehicleDamageStatus.COLLECTED}>Collected</option>
                    </select>
                    <p className="mt-1 text-xs text-slate-500">Applies to the {hasPoliceReport ? 'vehicle excess amount' : 'repair cost'}.</p>
                  </div>
                </div>
              </div>
              {validationError && <p className="text-sm font-medium text-rose-600">{validationError}</p>}
            </div>
            <div className="px-5 sm:px-6 py-4 border-t border-slate-100 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <button type="button" onClick={() => setShowAddForm(false)} className="px-4 py-2.5 bg-white border border-slate-200 text-slate-700 text-sm font-semibold rounded-xl hover:bg-slate-50">Cancel</button>
              <button type="submit" disabled={!foundReservation} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed">
                <PlusIcon className="w-4 h-4" /> Add damage report
              </button>
            </div>
          </form>
        </div>
      )}

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
