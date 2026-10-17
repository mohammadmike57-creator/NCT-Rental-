import React, { useState } from 'react';
import { RatePlan, RateTier, SippRate, Fleet } from '../types';
import { PlusIcon, TrashIcon } from './icons';
import { Dialog, Button, Field, inputCls, selectCls } from './ui/Crm';

interface ManagePeriodModalProps {
    plan: RatePlan;
    onSave: (updatedPlan: RatePlan) => void;
    onClose: () => void;
    fleet: Fleet;
    currency?: string;
}

const ManagePeriodModal: React.FC<ManagePeriodModalProps> = ({ plan, onSave, onClose, fleet, currency = 'USD' }) => {
    const [localPlan, setLocalPlan] = useState<RatePlan>(() => {
        const planCopy = JSON.parse(JSON.stringify(plan));
        planCopy.sippRates = planCopy.sippRates || [];
        planCopy.sippRates.forEach((sr: SippRate) => {
            sr.tiers = sr.tiers || [];
        });
        return planCopy;
    });

    const uniqueSippCodes = [...new Set(fleet.map(v => v.sippCode).filter((c): c is string => !!c))];
    const availableSippCodes = uniqueSippCodes.filter(code => !(localPlan.sippRates || []).some(sr => sr.sippCode === code));

    const handlePeriodChange = (field: 'startDate' | 'endDate' | 'name', value: string) => {
        setLocalPlan(prev => ({ ...prev, [field]: value }));
    };

    const handleAddSippRate = (sippCode: string) => {
        if (!sippCode) return;
        const newSippRate: SippRate = {
            id: `sipp-${Date.now()}`,
            sippCode: sippCode,
            tiers: [{ id: `tier-${Date.now()}`, fromDay: 1, toDay: null, dailyPrice: null }],
        };
        setLocalPlan(prev => ({ ...prev, sippRates: [...(prev.sippRates || []), newSippRate] }));
    };

    const handleDeleteSippRate = (sippRateId: string) => {
        setLocalPlan(prev => ({ ...prev, sippRates: prev.sippRates.filter(sr => sr.id !== sippRateId) }));
    };
    
    const handleAddTier = (sippRateId: string) => {
        setLocalPlan(prev => {
            const newSippRates = (prev.sippRates || []).map(sr => {
                if (sr.id === sippRateId) {
                    const newTiers = [...(sr.tiers || [])];
                    const lastTier = newTiers.length > 0 ? newTiers[newTiers.length - 1] : null;
                    const newFromDay = lastTier && typeof lastTier.toDay === 'number' ? lastTier.toDay + 1 : (lastTier ? (lastTier.fromDay || 0) + 1 : 1);
                    
                    newTiers.push({
                        id: `tier-${Date.now()}`,
                        fromDay: newFromDay,
                        toDay: null,
                        dailyPrice: null
                    });
                    return { ...sr, tiers: newTiers };
                }
                return sr;
            });
            return { ...prev, sippRates: newSippRates };
        });
    };
    
    const handleDeleteTier = (sippRateId: string, tierId: string) => {
         setLocalPlan(prev => ({
            ...prev,
            sippRates: (prev.sippRates || []).map(sr => sr.id === sippRateId ? { ...sr, tiers: sr.tiers.filter(t => t.id !== tierId) } : sr)
        }));
    };

    const handleTierChange = (sippRateId: string, tierId: string, tierIndex: number, field: keyof Omit<RateTier, 'id'>, value: number | null | typeof Infinity) => {
        setLocalPlan(prev => ({
            ...prev,
            sippRates: (prev.sippRates || []).map(sr => {
                if (sr.id === sippRateId) {
                    let newTiers = (sr.tiers || []).map(t => t.id === tierId ? { ...t, [field]: value } : t);

                    // Auto-update next tier's fromDay
                    if (field === 'toDay' && typeof value === 'number' && tierIndex < newTiers.length - 1) {
                        newTiers[tierIndex + 1].fromDay = value + 1;
                    }
                    
                    return { ...sr, tiers: newTiers };
                }
                return sr;
            })
        }));
    };
    
    const handleSave = () => {
        if (localPlan.startDate > localPlan.endDate) {
            alert(`Error in period "${localPlan.name}": Start date cannot be after end date.`);
            return;
        }
        for (const sippRate of (localPlan.sippRates || [])) {
            let lastToDay = 0;
            for (const [index, tier] of sippRate.tiers.entries()) {
                 const isLastTier = index === sippRate.tiers.length - 1;
                if (tier.fromDay === null || (!isLastTier && tier.toDay === null) || tier.dailyPrice === null) {
                    alert(`Error in ${sippRate.sippCode}: All tier fields (Days From, To, and Price) must be filled, except for 'To Day' on the last tier.`);
                    return;
                }
                if (tier.fromDay <= lastToDay) {
                    alert(`Error in ${sippRate.sippCode}: "From Day" must be greater than the previous tier's "To Day". Tiers cannot overlap.`);
                    return;
                }
                 if (tier.toDay !== null && tier.toDay !== Infinity && tier.fromDay > tier.toDay) {
                    alert(`Error in ${sippRate.sippCode}: "From Day" cannot be greater than "To Day".`);
                    return;
                }
                lastToDay = (tier.toDay === null || tier.toDay === Infinity) ? 99999 : (tier.toDay as number);
            }
        }
        
        // Final processing before save: ensure last tier's toDay is Infinity
        const finalPlan = JSON.parse(JSON.stringify(localPlan));
        (finalPlan.sippRates || []).forEach((sr: SippRate) => {
            if (sr.tiers.length > 0) {
                const lastTier = sr.tiers[sr.tiers.length - 1];
                if (lastTier.toDay === null) {
                    lastTier.toDay = Infinity;
                }
            }
        });
        
        onSave(finalPlan);
    }

    const smCls = `${inputCls} !h-8 !px-2 text-center tabular-nums`;

    return (
        <Dialog
            open
            onClose={onClose}
            size="xl"
            title="Edit Rate Period"
            subtitle={`${localPlan.name || 'Untitled'} · ${(localPlan.sippRates || []).length} vehicle group${(localPlan.sippRates || []).length === 1 ? '' : 's'} · ${currency}`}
            footer={
                <>
                    <Button variant="ghost" onClick={onClose}>Cancel</Button>
                    <Button variant="primary" onClick={handleSave}>Save Changes</Button>
                </>
            }
        >
            <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Field label="Period Name">
                        <input type="text" value={localPlan.name} onChange={e => handlePeriodChange('name', e.target.value)} className={inputCls} placeholder="e.g., High Season"/>
                    </Field>
                    <Field label="Start Date">
                        <input type="date" value={localPlan.startDate} onChange={e => handlePeriodChange('startDate', e.target.value)} className={inputCls} />
                    </Field>
                    <Field label="End Date">
                        <input type="date" value={localPlan.endDate} onChange={e => handlePeriodChange('endDate', e.target.value)} className={inputCls} />
                    </Field>
                </div>

                <div className="space-y-3">
                    {(localPlan.sippRates || []).map((sippRate) => (
                        <div key={sippRate.id} className="border border-slate-200 rounded-lg bg-white overflow-hidden">
                            <div className="flex justify-between items-center px-3 py-2 bg-slate-50 border-b border-slate-200">
                                <h4 className="font-mono text-[13px] font-semibold text-slate-900">{sippRate.sippCode}</h4>
                                <button onClick={() => handleDeleteSippRate(sippRate.id)} aria-label={`Remove ${sippRate.sippCode}`} className="w-7 h-7 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50"><TrashIcon className="h-4 w-4"/></button>
                            </div>
                            <div className="p-3 space-y-2">
                                <div className="hidden sm:grid grid-cols-[auto_1fr_auto_1fr_1.5fr_auto] gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                                    <span className="w-9" /><span className="text-center">From day</span><span className="w-2" /><span className="text-center">To day</span><span>Daily price</span><span className="w-7" />
                                </div>
                                {(sippRate.tiers || []).map((tier, tierIndex) => {
                                    const isLastTier = tierIndex === (sippRate.tiers || []).length - 1;
                                    return (
                                        <div key={tier.id} className="grid grid-cols-[auto_1fr_auto_1fr_1.5fr_auto] items-center gap-2">
                                            <span className="w-9 text-xs font-medium text-slate-500 text-right">Days</span>
                                            <input type="number" value={tier.fromDay ?? ''} onChange={e => {const val = parseInt(e.target.value); handleTierChange(sippRate.id, tier.id, tierIndex, 'fromDay', isNaN(val) ? null : val);}} className={smCls} />
                                            <span className="w-2 text-center text-slate-400">-</span>
                                            <input type="number" value={tier.toDay === Infinity || tier.toDay === null ? '' : tier.toDay} onChange={e => {const val = parseInt(e.target.value); const valueToSet = e.target.value === '' ? null : (isNaN(val) ? null : val); handleTierChange(sippRate.id, tier.id, tierIndex, 'toDay', valueToSet);}} className={smCls} placeholder="∞" />
                                            <div className="relative min-w-0">
                                                <span className="absolute inset-y-0 left-0 flex items-center pl-2 text-[10px] font-semibold text-slate-500">{currency}</span>
                                                <input type="number" step="0.01" value={tier.dailyPrice ?? ''} onChange={e => {const val = parseFloat(e.target.value); handleTierChange(sippRate.id, tier.id, tierIndex, 'dailyPrice', isNaN(val) ? null : val);}} className={`${inputCls} !h-8 pl-10 tabular-nums`} placeholder="Daily Price" />
                                            </div>
                                            <button onClick={() => handleDeleteTier(sippRate.id, tier.id)} aria-label="Remove tier" className="w-7 h-7 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50"><TrashIcon className="h-4 w-4"/></button>
                                        </div>
                                    )
                                })}
                                <Button size="sm" variant="ghost" className="!text-indigo-600" onClick={() => handleAddTier(sippRate.id)} icon={<PlusIcon className="h-4 w-4"/>}>Add Tier</Button>
                            </div>
                        </div>
                    ))}
                </div>

                <Field
                    label="Add SIPP Code to this Period"
                    hint={availableSippCodes.length === 0 ? 'All SIPP codes from your fleet are already in this rate card.' : undefined}
                    className="pt-3 border-t border-slate-200"
                >
                    <select
                        onChange={e => {
                            handleAddSippRate(e.target.value);
                            e.target.value = '';
                        }}
                        value=""
                        className={`${selectCls} w-full disabled:bg-slate-50 disabled:cursor-not-allowed`}
                        disabled={availableSippCodes.length === 0}
                    >
                        <option value="" disabled>
                            {availableSippCodes.length === 0 ? 'All SIPP codes added' : 'Select SIPP Code...'}
                        </option>
                        {availableSippCodes.map(code => <option key={code} value={code}>{code}</option>)}
                    </select>
                </Field>
            </div>
        </Dialog>
    );
};

export default ManagePeriodModal;
