
import React, { useState } from 'react';
import { Aggregator, AggregatorExtra, AvailableExtra } from '../types';
import { PlusIcon, TrashIcon } from './icons';

interface ManageAggregatorExtrasViewProps {
    aggregator: Aggregator;
    onUpdate: (updatedAggregator: Aggregator) => void;
    globalExtras: AvailableExtra[];
}

const ManageAggregatorExtrasView: React.FC<ManageAggregatorExtrasViewProps> = ({ aggregator, onUpdate, globalExtras }) => {
    const [selectedExtraId, setSelectedExtraId] = useState('');
    
    const aggregatorExtras = aggregator.extras || [];

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

    const handleDeleteExtra = (extraId: string) => {
        const updatedExtras = aggregatorExtras.filter(e => e.id !== extraId);
        onUpdate({ ...aggregator, extras: updatedExtras });
    };
    
    return (
        <div className="max-w-3xl">
             <div className="mb-6">
                 <h3 className="text-lg font-bold text-slate-800">Mapped Extras</h3>
                 <p className="text-sm text-slate-500">Define which extras are available on this channel and their specific pricing.</p>
            </div>
            
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl mb-6 flex flex-col sm:flex-row items-end gap-4">
                <div className="flex-grow w-full">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Select Extra</label>
                    <div className="relative">
                        <select
                            value={selectedExtraId}
                            onChange={e => setSelectedExtraId(e.target.value)}
                            className="w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white appearance-none"
                        >
                            <option value="">Select from global list...</option>
                            {availableOptions.map(opt => (
                                <option key={opt.id} value={opt.id}>{opt.name} (Default: ${opt.defaultDailyPrice})</option>
                            ))}
                        </select>
                    </div>
                </div>
                <button onClick={handleAddExtra} disabled={!selectedExtraId} className="w-full sm:w-auto h-[42px] px-6 bg-secondary text-white font-medium rounded-lg hover:bg-secondary/90 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2">
                    <PlusIcon className="w-4 h-4" /> Add Map
                </button>
            </div>
            
            <div className="space-y-3">
                {aggregatorExtras.map(extra => (
                    <div key={extra.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-white border border-slate-200 rounded-lg shadow-sm hover:border-primary/30 transition-colors gap-3">
                        <p className="font-semibold text-slate-700">{extra.name}</p>
                        <div className="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto">
                             <div className="flex items-center gap-2">
                                <label className="text-xs font-medium text-slate-400 uppercase">Price</label>
                                <div className="relative w-32">
                                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 font-medium">$</span>
                                    <input
                                        type="number"
                                        value={extra.price}
                                        onChange={e => handleUpdatePrice(extra.id, parseFloat(e.target.value) || 0)}
                                        className="w-full p-1.5 pl-7 border border-slate-300 rounded-md text-sm text-right font-bold text-slate-700 focus:ring-2 focus:ring-primary/20 focus:border-primary"
                                    />
                                </div>
                            </div>
                            <button onClick={() => handleDeleteExtra(extra.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors">
                                <TrashIcon className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                ))}
                {aggregatorExtras.length === 0 && (
                    <div className="text-center py-10 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
                        <p className="text-slate-400">No extras mapped yet.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ManageAggregatorExtrasView;
