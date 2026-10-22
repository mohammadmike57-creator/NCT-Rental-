import React, { useState, useMemo, useEffect } from 'react';
import { VehicleDamage, VehicleDamageStatus, AppData, Reservation, User, UserPermission, CompanyDetails } from '../types';
import { PlusIcon, TrashIcon, EditIcon, SaveIcon, CancelIcon, PaperAirplaneIcon, ShieldExclamationIcon, UploadIcon, DocumentTextIcon, ShareIcon, ExportIcon } from './icons';
import ConfirmationDialog from './ConfirmationDialog';
import SecurityKeyModal from './SecurityKeyModal';
import { Page, PageHeader, StatGrid, Panel, Toolbar, Segmented, Badge, Button, Field, EmptyState, DetailList, SectionLabel, Dialog, Drawer, inputCls, selectCls, textareaCls, labelCls, table } from './ui/Crm';
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
  const [viewId, setViewId] = useState<string | null>(null);
  
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
    const signature = `\n\nKind regards,\n\n${companyDetails.name}\n${companyDetails.address}\nTel: ${companyDetails.phone}\nEmail: ${companyDetails.email}`;
    const claimableAmount = (damage.policeReportAmount && damage.policeReportAmount > 0)
                            ? damage.policeReportAmount
                            : damage.amount;

    const subject = type === 'claim'
        ? `Vehicle Damage Claim – Booking ${renter.bookingId} | ${companyDetails.name}`
        : `Payment Received: Vehicle Damage Claim – Booking ${renter.bookingId} | ${companyDetails.name}`;
    
    const body = type === 'claim'
        ? `Dear ${renter.personName},\n\nWe are writing regarding damage to the ${renter.carModel}${renter.licensePlate ? ` (${renter.licensePlate})` : ''} that was identified in connection with your rental, booking reference ${renter.bookingId}.\n\nDamage details\n- Description: ${damage.details}\n${damage.policeReportNumber ? `- Police report no.: ${damage.policeReportNumber}\n` : ''}- Amount due: ${money(claimableAmount)} JOD\n\nIn accordance with the terms of your rental agreement, the renter is responsible for damage occurring during the rental period, up to the agreed excess where applicable. We kindly ask you to contact us on ${companyDetails.phone} to discuss this claim and arrange payment, quoting your booking reference.${signature}`
        : `Dear ${renter.personName},\n\nThank you for your payment. We confirm receipt of the amount below in settlement of the vehicle damage claim for your rental, booking reference ${renter.bookingId}.\n\nPayment details\n- Amount paid: ${money(claimableAmount)} JOD\n- Status: Settled\n\nThis claim is now closed and no further action is required. We appreciate your cooperation.${signature}`;

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
      return <Badge tone="muted">Nothing to collect</Badge>;
    }
    const done = damage.status === VehicleDamageStatus.COLLECTED;
    return <Badge tone={done ? 'success' : 'warning'}>{done ? 'Collected' : 'Not collected'}</Badge>;
  };

  const statusSelect = (damage: VehicleDamage) => (
    <select value={damage.status} onChange={e => handleUpdateChange(damage.id, 'status', e.target.value)} className={`${selectCls} w-full`}>
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
          <a href={data} target="_blank" rel="noopener noreferrer" title={name} className="w-8 h-8 inline-flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"><DocumentTextIcon className="w-4 h-4" /></a>
          <button type="button" onClick={() => handleRemoveFile(damage.id, field)} className="w-8 h-8 inline-flex items-center justify-center rounded-md text-rose-500 hover:bg-rose-50" title={`Remove ${meta.label.toLowerCase()}`}><TrashIcon className="w-4 h-4" /></button>
        </div>
      ) : (
        <>
          <input type="file" id={`${meta.idPrefix}-${view}-${damage.id}`} className="hidden" onChange={(e) => handleUpdateFileChange(damage.id, field, e)} accept={meta.accept} />
          <label htmlFor={`${meta.idPrefix}-${view}-${damage.id}`} className="cursor-pointer inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-sm" title={`Upload ${meta.label.toLowerCase()}`}><UploadIcon className="w-4 h-4" /> Upload</label>
        </>
      );
    } else {
      control = <FileActions fileData={data} fileName={name} />;
    }
    return (
      <div key={field} className="flex items-center justify-between gap-3 min-h-[40px] py-1">
        <div className="min-w-0">
          <p className="text-[13px] text-slate-700">{meta.label}</p>
          {name && <p className="text-xs text-slate-500 truncate" title={name}>{name}</p>}
        </div>
        {control}
      </div>
    );
  };

  const renderFiles = (damage: VehicleDamage, isEditing: boolean, view: 'd' | 'm') => {
    const hasReport = !!damage.policeReportNumber;
    const edit = isEditing && !!hasManagePermission;
    return (
      <div className="divide-y divide-slate-100">
        {renderFile(damage, 'damageImage', edit, view)}
        {renderFile(damage, 'repairInvoice', edit && !hasReport, view)}
        {renderFile(damage, 'policeReportFile', edit && hasReport, view)}
      </div>
    );
  };

  const fileCount = (damage: VehicleDamage) => (['damageImage', 'repairInvoice', 'policeReportFile'] as FileField[]).filter(f => !!damage[f]).length;
  const filesSummary = (damage: VehicleDamage) => {
    const n = fileCount(damage);
    return n > 0
      ? <span className="inline-flex items-center gap-1 text-xs text-slate-600"><DocumentTextIcon className="w-4 h-4 text-slate-400" />{n} {n === 1 ? 'file' : 'files'}</span>
      : <span className="text-slate-300">-</span>;
  };

  const renderActions = (damage: VehicleDamage, res: Reservation | null, isEditing: boolean, full = false) => {
    const canSendEmail = !!(res && res.customerEmail);
    if (isEditing && hasManagePermission) {
      return (
        <div className={`${full ? 'grid grid-cols-2' : 'inline-flex'} gap-2`}>
          <Button variant="primary" size="sm" onClick={handleSaveEdit} title="Save" icon={<SaveIcon className="w-4 h-4" />}>Done</Button>
          <Button size="sm" onClick={handleCancelEdit} title="Cancel" icon={<CancelIcon className="w-4 h-4" />}>Cancel</Button>
        </div>
      );
    }
    const isClaim = damage.status === VehicleDamageStatus.NOT_COLLECTED;
    return (
      <div className={`flex items-center gap-1 ${full ? '' : 'justify-end'}`}>
        {claimableOf(damage) > 0 && (
          <Button
            size="sm"
            onClick={() => handleSendEmail(isClaim ? 'claim' : 'receipt', damage, res!)}
            disabled={!canSendEmail}
            className={full ? 'flex-1' : ''}
            title={canSendEmail ? (isClaim ? 'Send claim email to renter' : 'Send receipt email to renter') : 'Renter email not found in voucher'}
            icon={<PaperAirplaneIcon className="w-4 h-4" />}
          >
            {isClaim ? 'Send claim' : 'Send receipt'}
          </Button>
        )}
        {full && claimableOf(damage) <= 0 && <span className="flex-1" />}
        {hasManagePermission && (
          <>
            <button type="button" onClick={() => handleEditClick(damage)} className="w-8 h-8 inline-flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900" title="Edit" aria-label="Edit damage report"><EditIcon className="w-4 h-4" /></button>
            <button type="button" onClick={() => handleDeleteClick(damage.id)} className="w-8 h-8 inline-flex items-center justify-center rounded-md text-slate-500 hover:bg-rose-50 hover:text-rose-600" title="Delete" aria-label="Delete damage report"><TrashIcon className="w-4 h-4" /></button>
          </>
        )}
      </div>
    );
  };

  const repairCostCell = (damage: VehicleDamage, isEditing: boolean) => {
    const hasReport = !!damage.policeReportNumber;
    if (isEditing && !hasReport && hasManagePermission) {
      return <input type="number" value={damage.amount || ''} placeholder="0.00" onChange={e => handleUpdateChange(damage.id, 'amount', parseFloat(e.target.value) || 0)} className={`${inputCls} text-right tabular-nums`} />;
    }
    return hasReport ? <span className="text-slate-300">-</span> : `${money(damage.amount)} JOD`;
  };

  const reportNumberCell = (damage: VehicleDamage, isEditing: boolean) => {
    const hasReport = !!damage.policeReportNumber;
    if (isEditing && hasManagePermission) {
      return <input type="text" value={damage.policeReportNumber || ''} onChange={e => handleUpdateChange(damage.id, 'policeReportNumber', e.target.value)} placeholder={!hasReport ? 'N/A' : 'Report #'} disabled={!hasReport} className={inputCls} />;
    }
    return damage.policeReportNumber ? <span className="font-mono text-xs">{damage.policeReportNumber}</span> : <span className="text-slate-300">-</span>;
  };

  const excessCell = (damage: VehicleDamage, isEditing: boolean) => {
    if (isEditing && hasManagePermission) {
      return <input type="number" readOnly value={damage.policeReportAmount || 0} className={`${inputCls} text-right tabular-nums bg-slate-50 text-slate-500`} />;
    }
    return damage.policeReportAmount ? `${money(damage.policeReportAmount)} JOD` : <span className="text-slate-300">-</span>;
  };

  const filterOptions: { key: VehicleDamageStatus | ''; label: string }[] = [
    { key: '', label: 'All' },
    { key: VehicleDamageStatus.NOT_COLLECTED, label: 'Not collected' },
    { key: VehicleDamageStatus.COLLECTED, label: 'Collected' },
  ];

  const fileSlot = (field: FileField, id: string, accept: string, label: string) => (
    <div>
      <span className={labelCls}>{label}</span>
      {newDamageData[field] ? (
        <div className="flex items-center gap-2 h-9 px-3 bg-slate-50 border border-slate-200 rounded-lg">
          <DocumentTextIcon className="w-4 h-4 text-slate-400 shrink-0" />
          <span className="text-[13px] text-slate-700 truncate flex-1 min-w-0" title={newDamageData[FILE_META[field].name]}>{newDamageData[FILE_META[field].name]}</span>
          <button type="button" onClick={() => handleClearFile(field)} className="p-1 rounded-md text-rose-500 hover:bg-rose-50" aria-label="Remove file"><TrashIcon className="w-4 h-4" /></button>
        </div>
      ) : (
        <>
          <input type="file" id={id} className="hidden" onChange={(e) => handleFileChange(e, field)} accept={accept} />
          <label htmlFor={id} className="cursor-pointer flex items-center justify-center gap-2 h-9 px-3 bg-white text-slate-600 border border-dashed border-slate-300 rounded-lg hover:bg-slate-50 text-[13px] font-semibold">
            <UploadIcon className="w-4 h-4" /> {field === 'damageImage' ? 'Select image' : 'Select file'}
          </label>
        </>
      )}
    </div>
  );

  // Record drawer: an edit session (after the security key) takes precedence over a plain view.
  const drawerId = editingId || viewId;
  const drawerDamage = drawerId ? damages.find(d => d.id === drawerId) || null : null;
  const drawerRes = drawerDamage ? findReservationByBookingId(drawerDamage.bookingId) : null;
  const drawerEditing = !!drawerDamage && editingId === drawerDamage.id && !!hasManagePermission;
  const closeDrawer = () => {
    if (editingId) handleSaveEdit();
    setViewId(null);
  };

  return (
    <Page>
      <PageHeader
        section="Financials & Incidents"
        title="Vehicle Damages"
        subtitle="Damage reports per booking, repair costs, police reports and excess collection."
        actions={hasManagePermission ? (
          <Button variant="primary" onClick={() => setShowAddForm(true)} icon={<PlusIcon className="w-4 h-4" />}>Add damage report</Button>
        ) : undefined}
      />

      <StatGrid items={[
        { label: 'Reports', value: stats.total, sub: 'all statuses', active: statusFilter === '', onClick: () => setStatusFilter('') },
        { label: 'Outstanding', value: stats.outstandingCount, sub: 'not collected', tone: stats.outstandingCount ? 'warning' : 'default', active: statusFilter === VehicleDamageStatus.NOT_COLLECTED, onClick: () => setStatusFilter(VehicleDamageStatus.NOT_COLLECTED) },
        { label: 'To collect (JOD)', value: stats.outstanding.toFixed(2), tone: stats.outstanding ? 'warning' : 'default' },
        { label: 'Collected (JOD)', value: stats.collected.toFixed(2), tone: 'success', active: statusFilter === VehicleDamageStatus.COLLECTED, onClick: () => setStatusFilter(VehicleDamageStatus.COLLECTED) },
      ]} />

      <Panel title={<>Recorded damages <span className="ml-1 text-slate-400 font-normal tabular-nums">{filteredDamages.length}</span></>}>
        <Toolbar>
          <Segmented
            options={filterOptions.map(o => ({ key: o.key, label: o.label }))}
            value={statusFilter}
            onChange={k => setStatusFilter(k as VehicleDamageStatus | '')}
            className="w-full md:w-auto"
          />
          <span className="md:ml-auto text-xs text-slate-500">Select a report to view files, police report and emails.</span>
        </Toolbar>

        {filteredDamages.length === 0 ? (
          <EmptyState
            icon={<ShieldExclamationIcon />}
            title={damages.length > 0 ? 'No damages match this filter' : 'No vehicle damages recorded'}
            hint={damages.length > 0 ? 'Choose a different status to see more reports.' : 'Damage reports will appear here, linked to their booking.'}
            action={damages.length === 0 && hasManagePermission ? <Button variant="primary" size="sm" onClick={() => setShowAddForm(true)} icon={<PlusIcon className="w-4 h-4" />}>Add damage report</Button> : undefined}
          />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className={table.wrap}>
                <thead className={table.head}>
                  <tr>
                    <th className={table.th}>Booking / renter</th>
                    <th className={table.th}>Rental period</th>
                    <th className={`${table.th} text-right`}>Repair cost</th>
                    <th className={table.th}>Police report #</th>
                    <th className={`${table.th} text-right`}>Excess collected</th>
                    <th className={table.th}>Status</th>
                    <th className={table.th}>Details</th>
                    <th className={table.th}>Files</th>
                    <th className={table.th}><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className={table.body}>
                  {rows.map(({ damage, res }) => {
                    const isEditing = editingId === damage.id;
                    return (
                      <tr key={damage.id} className={`${table.row} cursor-pointer ${isEditing || viewId === damage.id ? 'bg-indigo-50/40' : ''}`} onClick={() => setViewId(damage.id)}>
                        <td className={`${table.td} min-w-[160px]`}>
                          <p className="font-semibold text-slate-900">{res?.personName || <span className="text-slate-400 font-normal">Unknown renter</span>}</p>
                          <p className="text-xs text-slate-500"><span className="font-mono">#{damage.bookingId}</span>{res?.carModel ? ` · ${res.carModel}` : ''}</p>
                        </td>
                        <td className={`${table.td} whitespace-nowrap text-xs text-slate-600 tabular-nums`}>{res ? <>{res.startDate}<br />{res.endDate}</> : <span className="text-slate-400">-</span>}</td>
                        <td className={`${table.td} whitespace-nowrap text-right font-semibold text-slate-900 tabular-nums`}>{repairCostCell(damage, false)}</td>
                        <td className={`${table.td} whitespace-nowrap text-slate-700`}>{reportNumberCell(damage, false)}</td>
                        <td className={`${table.td} whitespace-nowrap text-right font-semibold text-slate-900 tabular-nums`}>{excessCell(damage, false)}</td>
                        <td className={`${table.td} whitespace-nowrap`}>{statusPill(damage)}</td>
                        <td className={`${table.td} text-slate-600 max-w-[240px]`}><p className="truncate" title={damage.details}>{damage.details || <span className="text-slate-300">-</span>}</p></td>
                        <td className={`${table.td} whitespace-nowrap`}>{filesSummary(damage)}</td>
                        <td className={`${table.td} whitespace-nowrap text-right`} onClick={e => e.stopPropagation()}>{renderActions(damage, res, false)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile list */}
            <ul className="md:hidden divide-y divide-slate-100">
              {rows.map(({ damage, res }) => {
                const hasReport = !!damage.policeReportNumber;
                return (
                  <li key={damage.id} className="px-4 py-3 space-y-2.5">
                    <button type="button" onClick={() => setViewId(damage.id)} className="w-full text-left flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-slate-900 truncate">{res?.personName || 'Unknown renter'}</p>
                        <p className="text-xs text-slate-500 truncate"><span className="font-mono">#{damage.bookingId}</span>{res?.carModel ? ` · ${res.carModel}` : ''}</p>
                        <p className="text-xs text-slate-500 truncate">{hasReport ? <>Police report <span className="font-mono">{damage.policeReportNumber}</span></> : 'Repair'}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[13px] font-semibold text-slate-900 tabular-nums">{money(claimableOf(damage))} JOD</p>
                        <div className="mt-1">{statusPill(damage)}</div>
                      </div>
                    </button>
                    {damage.details && <p className="text-xs text-slate-600 line-clamp-2 break-words">{damage.details}</p>}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Files</span>
                      <button type="button" onClick={() => setViewId(damage.id)} className="text-xs font-semibold text-indigo-600 hover:text-indigo-700">{fileCount(damage) > 0 ? `View ${fileCount(damage)} ${fileCount(damage) === 1 ? 'file' : 'files'}` : 'Open report'}</button>
                    </div>
                    {renderActions(damage, res, false, true)}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Panel>

      {/* Damage record drawer (view + edit) */}
      <Drawer
        open={!!drawerDamage}
        onClose={closeDrawer}
        title={drawerDamage ? (drawerRes?.personName || 'Unknown renter') : ''}
        subtitle={drawerDamage && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono">#{drawerDamage.bookingId}</span>
            {statusPill(drawerDamage)}
            {drawerEditing && <Badge tone="info" dot={false}>Editing</Badge>}
          </div>
        )}
        footer={drawerDamage && <div className="w-full">{renderActions(drawerDamage, drawerRes, drawerEditing, true)}</div>}
      >
        {drawerDamage && (
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
              <SectionLabel className="mb-2">Damage</SectionLabel>
              {drawerEditing ? (
                <div className="grid grid-cols-2 gap-3">
                  {!drawerDamage.policeReportNumber && <Field label="Repair cost (JOD)" className="col-span-2">{repairCostCell(drawerDamage, true)}</Field>}
                  <Field label="Police report #">{reportNumberCell(drawerDamage, true)}</Field>
                  <Field label="Excess (JOD)">{excessCell(drawerDamage, true)}</Field>
                  <Field label="Status" className="col-span-2">{statusSelect(drawerDamage)}</Field>
                  <Field label="Details" className="col-span-2"><textarea value={drawerDamage.details} onChange={e => handleUpdateChange(drawerDamage.id, 'details', e.target.value)} className={textareaCls} rows={3} /></Field>
                </div>
              ) : (
                <DetailList rows={[
                  { label: 'Type', value: drawerDamage.policeReportNumber ? 'Police report' : 'Repair' },
                  { label: 'Repair cost', value: <span className="tabular-nums">{repairCostCell(drawerDamage, false)}</span> },
                  { label: 'Police report #', value: reportNumberCell(drawerDamage, false) },
                  { label: 'Excess collected', value: <span className="tabular-nums">{excessCell(drawerDamage, false)}</span> },
                  { label: 'Amount to collect', value: <span className="tabular-nums">{money(claimableOf(drawerDamage))} JOD</span> },
                  { label: 'Status', value: statusPill(drawerDamage) },
                  { label: 'Details', value: drawerDamage.details || <span className="text-slate-400">-</span> },
                ]} />
              )}
            </div>
            <div>
              <SectionLabel className="mb-1">Files</SectionLabel>
              <div className="rounded-lg border border-slate-200 px-3">{renderFiles(drawerDamage, drawerEditing, 'm')}</div>
            </div>
          </div>
        )}
      </Drawer>

      {/* Add damage dialog */}
      {hasManagePermission && (
        <Dialog
          open={showAddForm}
          onClose={() => setShowAddForm(false)}
          title="Add damage report"
          subtitle="Link the damage to an existing booking."
          size="xl"
          footer={<>
            <Button onClick={() => setShowAddForm(false)}>Cancel</Button>
            <Button variant="primary" type="submit" form="add-damage-form" disabled={!foundReservation} icon={<PlusIcon className="w-4 h-4" />}>Add damage report</Button>
          </>}
        >
          <form id="add-damage-form" onSubmit={handleAddSubmit} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Booking ID" required>
                <input type="text" value={newDamageData.bookingId} onChange={e => handleInputChange('bookingId', e.target.value)} placeholder="Enter booking ID" className={inputCls} required autoFocus />
              </Field>
              <div className="sm:pt-6">
                <label htmlFor="hasPoliceReport" className="flex items-center gap-3 h-9 px-3 border border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50">
                  <input
                    type="checkbox"
                    id="hasPoliceReport"
                    checked={hasPoliceReport}
                    onChange={e => handleHasReportChange(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-[13px] font-medium text-slate-700">Incident involves a police report</span>
                </label>
              </div>
            </div>

            {foundReservation ? (
              <div className="px-3 py-2 text-[13px] bg-emerald-50 ring-1 ring-inset ring-emerald-200 text-emerald-800 rounded-lg">
                <span className="font-semibold">Reservation found:</span> {foundReservation.personName} ({foundReservation.carModel}) · Vehicle excess <span className="font-semibold tabular-nums">{vehicleExcessJOD.toFixed(2)} JOD</span>
              </div>
            ) : newDamageData.bookingId ? (
              <div className="px-3 py-2 text-[13px] bg-rose-50 ring-1 ring-inset ring-rose-200 text-rose-700 rounded-lg">
                No reservation found with this booking ID.
              </div>
            ) : null}

            <div className="pt-4 border-t border-slate-100">
              <SectionLabel className="mb-3">{hasPoliceReport ? 'Police report' : 'Repair'}</SectionLabel>
              {hasPoliceReport ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <Field label="Police report #" required>
                    <input type="text" value={newDamageData.policeReportNumber} onChange={e => handleInputChange('policeReportNumber', e.target.value)} className={inputCls} required={hasPoliceReport} />
                  </Field>
                  <div>
                    <span className={labelCls}>Amount to collect (vehicle excess)</span>
                    <div className="h-9 px-3 flex items-center bg-slate-50 border border-slate-200 rounded-lg text-[13px] font-semibold text-slate-700 tabular-nums">{vehicleExcessJOD.toFixed(2)} JOD</div>
                  </div>
                  {fileSlot('policeReportFile', 'report-upload', 'image/*,.pdf', 'Police report document')}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Damage repair cost (JOD)" required>
                    <input type="number" step="0.01" value={newDamageData.amount || ''} placeholder="0.00" onChange={e => handleInputChange('amount', parseFloat(e.target.value) || 0)} className={inputCls} />
                  </Field>
                  {fileSlot('repairInvoice', 'invoice-upload', 'image/*,.pdf', 'Repair invoice')}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Damage details" required>
                <textarea value={newDamageData.details} onChange={e => handleInputChange('details', e.target.value)} rows={4} placeholder="e.g. Large scratch on passenger door" className={textareaCls} required></textarea>
              </Field>
              <div className="space-y-4">
                {fileSlot('damageImage', 'damage-image-upload', 'image/*', 'Car damage image')}
                <Field label="Collection status" hint={`Applies to the ${hasPoliceReport ? 'vehicle excess amount' : 'repair cost'}.`}>
                  <select value={newDamageData.status} onChange={e => handleInputChange('status', e.target.value)} className={`${selectCls} w-full`}>
                    <option value={VehicleDamageStatus.NOT_COLLECTED}>Not Collected</option>
                    <option value={VehicleDamageStatus.COLLECTED}>Collected</option>
                  </select>
                </Field>
              </div>
            </div>
            {validationError && <p className="text-[13px] font-medium text-rose-600">{validationError}</p>}
          </form>
        </Dialog>
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
    </Page>
  );
};

export default VehicleDamages;
