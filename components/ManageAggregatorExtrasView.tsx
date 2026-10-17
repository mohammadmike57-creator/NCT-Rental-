
import React, { useState } from 'react';
import { Aggregator, AggregatorExtra, AvailableExtra } from '../types';
import { PlusIcon, TrashIcon } from './icons';
import { channelCurrency, formatMoney } from '../services/channelManager';
import { Button, EmptyState, inputCls, selectCls, labelCls } from './ui/Crm';

interface ManageAggregatorExtrasViewProps {
    aggregator: Aggregator;
    onUpdate: (updatedAggregator: Aggregator) => void;
    globalExtras: AvailableExtra[];
}

const ManageAggregatorExtrasView: React.FC<ManageAggregatorExtrasViewProps> = ({ aggregator, onUpdate, globalExtras }) => {
    const [selectedExtraId, setSelectedExtraId] = useState('');
    
    const aggregatorExtras = aggregator.extras || [];
    const currency = channelCurrency(aggregator);

    const availableOptions = globalExtras.filter(
        globalExtra => !aggregatorExtras.some(aggExtra => aggExtra.id === globalExtra.id)
    );

    const handleAddExtra = () => {
        if (!selectedExtraId) return;
        const extraToAdd = globalExtras.find(e => e.id === selectedExtraId);
        if (!extraToAdd) return;
        
        const newAggregatorExtra: AggregatorExtra = {
            id: extraToAdd.id,
            name: extraToAdd.name,
            price: extraToAdd.defaultDailyPrice,
        };

        const updatedAggregator = {
            ...aggregator,
            extras: [...aggregatorExtras, newAggregatorExtra],
        };
        onUpdate(updatedAggregator);
        setSelectedExtraId('');
    };

    const handleUpdatePrice = (extraId: string, price: number) => {
        const updatedExtras = aggregatorExtras.map(e => 
            e.id === extraId ? { ...e, price } : e
        );
        onUpdate({ ...aggregator, extras: updatedExtras });
    };

    const handleUpdateField = (extraId: string, patch: Partial<AggregatorExtra>) => {
        onUpdate({ ...aggregator, extras: aggregatorExtras.map(e => (e.id === extraId ? { ...e, ...patch } : e)) });
    };

    const handleDeleteExtra = (extraId: string) => {
        const updatedExtras = aggregatorExtras.filter(e => e.id !== extraId);
        onUpdate({ ...aggregator, extras: updatedExtras });
    };
    
    return (
        <div>
             <div className="mb-4">
                 <h3 className="text-sm font-semibold text-slate-900">Mapped Extras</h3>
                 <p className="text-xs text-slate-500">Extras sold on this channel, their daily price in {currency}, and the OTA equipment code the partner expects.</p>
            </div>
            
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg mb-4 flex flex-col sm:flex-row items-end gap-2">
                <div className="flex-grow w-full min-w-0">
                    <label className={labelCls}>Select Extra</label>
                    <div className="relative">
                        <select
                            value={selectedExtraId}
                            onChange={e => setSelectedExtraId(e.target.value)}
                            className={`${selectCls} w-full`}
                        >
                            <option value="">Select from global list...</option>
                            {availableOptions.map(opt => (
                                <option key={opt.id} value={opt.id}>{opt.name} (default {formatMoney(opt.defaultDailyPrice, currency)})</option>
                            ))}
                        </select>
                    </div>
                </div>
                <Button variant="primary" onClick={handleAddExtra} disabled={!selectedExtraId} className="w-full sm:w-auto" icon={<PlusIcon className="w-4 h-4" />}>Add Map</Button>
            </div>
            
            <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 overflow-hidden">
                {aggregatorExtras.map(extra => (
                    <div key={extra.id} className="flex flex-col sm:flex-row sm:items-center justify-between px-3 py-2.5 bg-white hover:bg-slate-50 transition-colors gap-3">
                        <div className="min-w-0">
                            <p className="text-[13px] font-semibold text-slate-900">{extra.name}</p>
                            <div className="flex flex-wrap items-center gap-3 mt-1.5">
                                <label className="flex items-center gap-1.5 text-[11px] text-slate-500 uppercase tracking-wider font-semibold">
                                    OTA code
                                    <input
                                        type="text"
                                        value={extra.otaEquipType || ''}
                                        onChange={e => handleUpdateField(extra.id, { otaEquipType: e.target.value.trim() || undefined })}
                                        placeholder={extra.id}
                                        className={`${inputCls} !h-7 !w-24 !px-2 text-xs font-mono normal-case`}
                                    />
                                </label>
                                <label className="flex items-center gap-1.5 text-[11px] text-slate-500 uppercase tracking-wider font-semibold">
                                    Max / rental
                                    <input
                                        type="number"
                                        min={0}
                                        value={extra.maxPerRental ?? ''}
                                        onChange={e => { const v = parseFloat(e.target.value); handleUpdateField(extra.id, { maxPerRental: v > 0 ? v : undefined }); }}
                                        placeholder="no cap"
                                        className={`${inputCls} !h-7 !w-20 !px-2 text-xs text-right tabular-nums normal-case`}
                                    />
                                </label>
                            </div>
                        </div>
                        <div className="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto">
                             <div className="flex items-center gap-2">
                                <label className="text-[11px] font-semibold tracking-wider text-slate-500 uppercase">Per day</label>
                                <div className="relative w-32">
                                    <span className="absolute inset-y-0 left-0 flex items-center pl-2 text-[10px] text-slate-400 font-semibold">{currency}</span>
                                    <input
                                        type="number"
                                        value={extra.price}
                                        onChange={e => handleUpdatePrice(extra.id, parseFloat(e.target.value) || 0)}
                                        className={`${inputCls} !h-8 pl-10 text-right font-semibold tabular-nums`}
                                    />
                                </div>
                            </div>
                            <button onClick={() => handleDeleteExtra(extra.id)} aria-label={`Remove ${extra.name}`} className="w-8 h-8 inline-flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors">
                                <TrashIcon className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                ))}
                {aggregatorExtras.length === 0 && (
                    <EmptyState className="!py-8" title="No extras mapped yet." hint="Pick an extra from the global list above." />
                )}
            </div>
        </div>
    );
};

export default ManageAggregatorExtrasView;
