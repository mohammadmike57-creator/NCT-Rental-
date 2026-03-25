import React, { useState } from 'react';
import { RatePlan, RateTier, SippRate, Fleet } from '../types';
import { CloseIcon, PlusIcon, TrashIcon } from './icons';

interface ManagePeriodModalProps {
    plan: RatePlan;
    onSave: (updatedPlan: RatePlan) => void;
    onClose: () => void;
    fleet: Fleet;
}

const ManagePeriodModal: React.FC<ManagePeriodModalProps> = ({ plan, onSave, onClose, fleet }) => {
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

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
                <header className="flex items-center justify-between p-4 border-b">
                    <h2 className="text-xl font-semibold">Edit Rate Period</h2>
                    <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-200"><CloseIcon /></button>
                </header>
                <div className="p-6 overflow-y-auto space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-gray-50 border rounded-lg">
                        <div>
                            <label className="text-sm font-medium">Period Name</label>
                            <input type="text" value={localPlan.name} onChange={e => handlePeriodChange('name', e.target.value)} className="w-full p-2 border rounded-md mt-1" placeholder="e.g., High Season"/>
                        </div>
                        <div>
                            <label className="text-sm font-medium">Start Date</label>
                            <input type="date" value={localPlan.startDate} onChange={e => handlePeriodChange('startDate', e.target.value)} className="w-full p-2 border rounded-md mt-1" />
                        </div>
                        <div>
                            <label className="text-sm font-medium">End Date</label>
                            <input type="date" value={localPlan.endDate} onChange={e => handlePeriodChange('endDate', e.target.value)} className="w-full p-2 border rounded-md mt-1" />
                        </div>
                    </div>

                    <div className="space-y-4">
                        {(localPlan.sippRates || []).map((sippRate) => (
                            <div key={sippRate.id} className="p-3 border rounded-md bg-white shadow-sm">
                                <div className="flex justify-between items-center mb-2 pb-2 border-b">
                                    <h4 className="font-bold text-primary">{sippRate.sippCode}</h4>
                                    <button onClick={() => handleDeleteSippRate(sippRate.id)} className="p-1 text-gray-400 hover:text-red-500"><TrashIcon className="h-4 w-4"/></button>
                                </div>
                                <div className="space-y-2">
                                    {(sippRate.tiers || []).map((tier, tierIndex) => {
                                        const isLastTier = tierIndex === (sippRate.tiers || []).length - 1;
                                        return (
                                            <div key={tier.id} className="grid grid-cols-[auto_1fr_auto_1fr_1.5fr_auto] items-center gap-2">
                                                <span className="text-sm font-medium text-gray-500 text-right">Days</span>
                                                <input type="number" value={tier.fromDay ?? ''} onChange={e => {const val = parseInt(e.target.value); handleTierChange(sippRate.id, tier.id, tierIndex, 'fromDay', isNaN(val) ? null : val);}} className="w-full p-1 border rounded-md text-sm text-center" />
                                                <span className="text-center">-</span>
                                                <input type="number" value={tier.toDay === Infinity || tier.toDay === null ? '' : tier.toDay} onChange={e => {const val = parseInt(e.target.value); const valueToSet = e.target.value === '' ? null : (isNaN(val) ? null : val); handleTierChange(sippRate.id, tier.id, tierIndex, 'toDay', valueToSet);}} className="w-full p-1 border rounded-md text-sm text-center" placeholder="∞" />
                                                <div className="relative">
                                                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500">$</span>
                                                    <input type="number" step="0.01" value={tier.dailyPrice ?? ''} onChange={e => {const val = parseFloat(e.target.value); handleTierChange(sippRate.id, tier.id, tierIndex, 'dailyPrice', isNaN(val) ? null : val);}} className="w-full p-1 border rounded-md text-sm pl-7" placeholder="Daily Price" />
                                                </div>
                                                <button onClick={() => handleDeleteTier(sippRate.id, tier.id)} className="p-1 text-gray-400 hover:text-red-500"><TrashIcon className="h-4 w-4"/></button>
                                            </div>
                                        )
                                    })}
                                    <button onClick={() => handleAddTier(sippRate.id)} className="text-sm text-blue-600 hover:underline flex items-center gap-1 pt-2"><PlusIcon className="h-4 w-4"/> Add Tier</button>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="p-3 border-t">
                        <label className="text-sm font-medium text-gray-600">Add SIPP Code to this Period</label>
                        <select
                            onChange={e => {
                                handleAddSippRate(e.target.value);
                                e.target.value = '';
                            }}
                            value=""
                            className="w-full p-2 mt-1 border rounded-md disabled:bg-gray-100 disabled:cursor-not-allowed"
                            disabled={availableSippCodes.length === 0}
                        >
                            <option value="" disabled>
                                {availableSippCodes.length === 0 ? 'All SIPP codes added' : 'Select SIPP Code...'}
                            </option>
                            {availableSippCodes.map(code => <option key={code} value={code}>{code}</option>)}
                        </select>
                         {availableSippCodes.length === 0 && (
                            <p className="text-xs text-gray-500 mt-1">All SIPP codes from your fleet are already in this rate card.</p>
                         )}
                    </div>
                </div>
                <footer className="p-4 bg-gray-100 border-t flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300">Cancel</button>
                    <button onClick={handleSave} className="px-6 py-2 bg-primary text-white rounded-md hover:bg-secondary">Save Changes</button>
                </footer>
            </div>
        </div>
    );
};

export default ManagePeriodModal;