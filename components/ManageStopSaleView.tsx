
import React, { useState } from 'react';
import { StopSale, Fleet } from '../types';
import { PlusIcon, TrashIcon, StopIcon } from './icons';
import { CAR_CATEGORIES } from '../constants';

interface ManageStopSaleViewProps {
    stopSales: StopSale[];
    onUpdate: (updatedStopSales: StopSale[]) => void;
    fleet: Fleet;
}

const ManageStopSaleView: React.FC<ManageStopSaleViewProps> = ({ stopSales, onUpdate, fleet }) => {
    const [type, setType] = useState<'vehicle' | 'category'>('vehicle');
    const [target, setTarget] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [reason, setReason] = useState('');

    const handleAddStopSale = () => {
        if (!target || !startDate || !endDate) {
            alert('Target, Start Date, and End Date are required.');
            return;
        }
        if (startDate > endDate) {
            alert('Start date cannot be after end date.');
            return;
        }

        const newStopSale: StopSale = {
            id: `ss-${Date.now()}`,
            type,
            target,
            startDate,
            endDate,
            reason: reason.trim(),
        };

        onUpdate([...stopSales, newStopSale]);
        setTarget('');
        setStartDate('');
        setEndDate('');
        setReason('');
    };

    const handleDelete = (id: string) => {
        if (window.confirm('Are you sure you want to remove this stop sale? This will make the vehicle/category available again.')) {
            onUpdate(stopSales.filter(ss => ss.id !== id));
        }
    };
    
    const getTargetName = (ss: StopSale) => {
        if (ss.type === 'category') {
            return <span className="font-bold text-purple-700">Category: {ss.target}</span>;
        }
        const vehicle = fleet.find(v => v.id === ss.target);
        return vehicle ? <span className="font-medium text-slate-700">{vehicle.modelName} <span className="text-slate-400 text-xs font-normal">({vehicle.licensePlate})</span></span> : 'Unknown Vehicle';
    };

    return (
        <div className="max-w-5xl mx-auto space-y-8">
             <div className="flex items-start gap-4 p-4 bg-red-50 border-l-4 border-red-500 rounded-r-lg shadow-sm">
                <div className="p-2 bg-red-100 rounded-full text-red-600 hidden sm:block">
                    <StopIcon className="w-6 h-6" />
                </div>
                <div>
                    <h3 className="text-lg font-bold text-red-800">Global Stop Sale</h3>
                    <p className="text-sm text-red-700">
                        Blocked inventory will not be sent to any partner via XML. This overrides all availability settings.
                    </p>
                </div>
            </div>

            <div className="p-4 sm:p-6 bg-white rounded-xl border border-slate-200 shadow-sm">
                <h3 className="text-lg font-bold text-slate-800 mb-4">Create New Block</h3>
                
                <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 mb-6">
                     <label className={`flex items-center gap-2 cursor-pointer px-4 py-2 rounded-lg border transition-all ${type === 'vehicle' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                        <input type="radio" name="stopSaleType" value="vehicle" checked={type === 'vehicle'} onChange={() => { setType('vehicle'); setTarget(''); }} className="hidden"/>
                        <span>Block Specific Vehicle</span>
                    </label>
                    <label className={`flex items-center gap-2 cursor-pointer px-4 py-2 rounded-lg border transition-all ${type === 'category' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                        <input type="radio" name="stopSaleType" value="category" checked={type === 'category'} onChange={() => { setType('category'); setTarget(''); }} className="hidden"/>
                        <span>Block Entire Category</span>
                    </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                    <div className="sm:col-span-2 lg:col-span-1">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Target</label>
                        <select value={target} onChange={e => setTarget(e.target.value)} className="w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary">
                            <option value="">Select...</option>
                            {type === 'vehicle' ? (
                                fleet.map(v => <option key={v.id} value={v.id}>{v.modelName} ({v.licensePlate})</option>)
                            ) : (
                                CAR_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)
                            )}
                        </select>
                    </div>
                     <div>
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Start Date</label>
                        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full p-2.5 border border-slate-300 rounded-lg text-sm" />
                    </div>
                     <div>
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">End Date</label>
                        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full p-2.5 border border-slate-300 rounded-lg text-sm" />
                    </div>
                    <div className="sm:col-span-2 lg:col-span-1">
                         <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Reason (Optional)</label>
                         <input type="text" value={reason} onChange={e => setReason(e.target.value)} placeholder="Maintenance..." className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"/>
                    </div>
                </div>
                <div className="mt-6 text-right">
                     <button onClick={handleAddStopSale} className="w-full sm:w-auto px-6 py-2.5 bg-primary text-white font-bold rounded-lg hover:bg-primary-dark shadow-md transition-all flex items-center justify-center gap-2 ml-auto">
                        <PlusIcon className="w-5 h-5"/> Apply Block
                    </button>
                </div>
            </div>

            <div>
                <h3 className="text-lg font-bold text-slate-800 mb-4">Active Blocks</h3>
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-100">
                        <thead className="bg-slate-50">
                            <tr>
                                <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Target</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Period</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Reason</th>
                                <th className="px-6 py-4 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {stopSales.map(ss => (
                                <tr key={ss.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap">{getTargetName(ss)}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 font-mono">
                                         <span className="bg-slate-50/50 rounded px-2 py-1 border border-slate-100">{ss.startDate} &rarr; {ss.endDate}</span>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-slate-600">{ss.reason || '-'}</td>
                                    <td className="px-6 py-4 text-center">
                                        <button onClick={() => handleDelete(ss.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-all" title="Remove Block">
                                            <TrashIcon className="w-4 h-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {stopSales.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="text-center py-12 text-slate-400">No active stop sales found.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default ManageStopSaleView;
