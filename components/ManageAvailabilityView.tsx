
import React, { useState } from 'react';
// FIX: Replaced missing OTAAllocation type with StopSale and adapted component logic.
import { StopSale, Fleet } from '../types';
import { PlusIcon, TrashIcon, CalendarDaysIcon } from './icons';

interface ManageAvailabilityViewProps {
    allocations: StopSale[];
    onUpdate: (updatedAllocations: StopSale[]) => void;
    fleet: Fleet;
}

const ManageAvailabilityView: React.FC<ManageAvailabilityViewProps> = ({ allocations, onUpdate, fleet }) => {
    const [carCategory, setCarCategory] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [quantity, setQuantity] = useState(1);
    
    const uniqueCategories = [...new Set(fleet.map(v => v.category))];

    const handleAddAllocation = () => {
        if (!carCategory || !startDate || !endDate || quantity < 0) {
            alert('All fields are required and quantity cannot be negative.');
            return;
        }
        if (startDate > endDate) {
            alert('Start date cannot be after end date.');
            return;
        }

        const newAllocation: StopSale = {
            id: `alloc-${Date.now()}`,
            type: 'category',
            target: carCategory,
            startDate,
            endDate,
            reason: `Free Sale: ${quantity}`,
        };
        onUpdate([...allocations, newAllocation]);
        // Reset form
        setCarCategory('');
        setStartDate('');
        setEndDate('');
        setQuantity(1);
    };
    
    const handleDelete = (id: string) => {
        if (window.confirm('Are you sure you want to remove this availability allocation?')) {
            onUpdate(allocations.filter(a => a.id !== id));
        }
    };

    return (
        <div className="space-y-6">
             <div className="p-4 bg-blue-50 rounded-lg border-l-4 border-blue-400">
                <h3 className="font-bold text-blue-800 flex items-center gap-2"><CalendarDaysIcon/> Availability & Yield Management</h3>
                <p className="text-sm text-blue-700 mt-1">
                    Use this tool to set the number of vehicles per category available for sale on online channels ("Free Sale"). 
                    This provides positive control over your inventory. Use "Stop Sale" to block specific vehicles by license plate.
                </p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg border">
                <h3 className="text-lg font-semibold text-gray-700 mb-3">Set New Allocation</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
                    <div className="lg:col-span-2">
                        <label className="text-xs font-medium">Car Category</label>
                        <select value={carCategory} onChange={e => setCarCategory(e.target.value)} className="w-full p-2 border rounded-md mt-1">
                            <option value="">Select a category...</option>
                            {uniqueCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="text-xs font-medium">Start Date</label>
                        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full p-2 border rounded-md mt-1" />
                    </div>
                    <div>
                        <label className="text-xs font-medium">End Date</label>
                        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full p-2 border rounded-md mt-1" />
                    </div>
                    <div className="flex items-end gap-2">
                         <div className="flex-grow">
                            <label className="text-xs font-medium"># of Cars</label>
                            <input type="number" value={quantity} onChange={e => setQuantity(parseInt(e.target.value) || 0)} min="0" className="w-full p-2 border rounded-md mt-1" />
                        </div>
                        <button onClick={handleAddAllocation} className="h-[42px] px-4 py-2 bg-secondary text-white rounded-md hover:bg-primary">
                            <PlusIcon/>
                        </button>
                    </div>
                </div>
            </div>

            <div>
                <h3 className="text-lg font-semibold text-gray-700 mb-2">Current Allocations</h3>
                <div className="overflow-x-auto rounded-lg border">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Period</th>
                                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Details</th>
                                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {allocations.map(alloc => (
                                <tr key={alloc.id}>
                                    <td className="px-4 py-3 whitespace-nowrap font-medium">{alloc.target}</td>
                                    <td className="px-4 py-3 whitespace-nowrap">{alloc.startDate} to {alloc.endDate}</td>
                                    <td className="px-4 py-3 text-center font-bold text-lg">{alloc.reason}</td>
                                    <td className="px-4 py-3 text-center">
                                        <button onClick={() => handleDelete(alloc.id)} className="p-1 text-gray-400 hover:text-red-500">
                                            <TrashIcon />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {allocations.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="text-center py-6 text-gray-500">No availability allocations have been set.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default ManageAvailabilityView;