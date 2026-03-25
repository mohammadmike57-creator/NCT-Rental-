
import React, { useState, useMemo } from 'react';
import { Reservation, UpgradeInfo, Fleet } from '../types';
import { CloseIcon, CarIcon, ArrowRightIcon } from './icons';

interface ManageUpgradeModalProps {
  reservation: Reservation;
  fleet: Fleet;
  onSave: (upgradeInfo: UpgradeInfo | undefined) => void;
  onClose: () => void;
}

const calculateDays = (start: string, end: string): number => {
    if (!start || !end) return 1;
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || endDate <= startDate) return 1;
    const diffInMs = endDate.getTime() - startDate.getTime();
    const oneDayInMs = 24 * 60 * 60 * 1000;
    if (diffInMs <= oneDayInMs) return 1;
    const gracePeriodInMs = 2 * 60 * 60 * 1000;
    const fullDays = Math.floor(diffInMs / oneDayInMs);
    const remainingMs = diffInMs % oneDayInMs;
    if (remainingMs === 0) return fullDays;
    if (remainingMs >= gracePeriodInMs) return fullDays + 1;
    return fullDays;
};

const ManageUpgradeModal: React.FC<ManageUpgradeModalProps> = ({ reservation, fleet, onSave, onClose }) => {
    const [upgradedCarModel, setUpgradedCarModel] = useState(reservation.upgradeInfo?.upgradedCarModel || '');
    const [dailyCost, setDailyCost] = useState(reservation.upgradeInfo?.dailyUpgradePrice || 0);

    const rentalDays = useMemo(() => calculateDays(reservation.startDate, reservation.endDate), [reservation.startDate, reservation.endDate]);
    const totalCost = useMemo(() => dailyCost * rentalDays, [dailyCost, rentalDays]);
    
    // Get unique car models from fleet, excluding current one if not already selected
    const availableCars = useMemo(() => {
        const models = new Set(fleet.map(v => v.modelName));
        return Array.from(models).sort();
    }, [fleet]);

    const handleSave = () => {
        if (!upgradedCarModel.trim() || dailyCost < 0) {
            alert('Please select an upgraded car model and enter a valid daily cost.');
            return;
        }
        
        onSave({ 
            originalCarModel: reservation.upgradeInfo?.originalCarModel || reservation.carModel, // Keep original if exists, else use current
            upgradedCarModel: upgradedCarModel.trim(), 
            dailyUpgradePrice: dailyCost, 
            totalUpgradeCost: totalCost 
        });
    };

    const handleRemove = () => {
        if (window.confirm("Are you sure you want to remove this upgrade? The vehicle will revert to the original.")) {
            onSave(undefined);
        }
    };

    const formatCurrency = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-md flex flex-col">
                <header className="flex items-center justify-between p-4 border-b">
                    <h2 className="text-xl font-semibold flex items-center gap-2 text-primary">
                        <CarIcon /> Upgrade Vehicle
                    </h2>
                    <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-200"><CloseIcon /></button>
                </header>
                
                <div className="p-6 space-y-5">
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200 text-sm">
                         <div>
                             <p className="text-gray-500 text-xs uppercase">Current Vehicle</p>
                             <p className="font-bold text-gray-800">{reservation.upgradeInfo?.originalCarModel || reservation.carModel}</p>
                         </div>
                         <ArrowRightIcon className="text-gray-400 w-5 h-5" />
                         <div className="text-right">
                             <p className="text-gray-500 text-xs uppercase">New Vehicle</p>
                             <p className="font-bold text-blue-600">{upgradedCarModel || 'Select...'}</p>
                         </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Select Upgraded Model</label>
                        <select
                            value={upgradedCarModel}
                            onChange={e => setUpgradedCarModel(e.target.value)}
                            className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                        >
                            <option value="">Choose vehicle model...</option>
                            {availableCars.map(model => <option key={model} value={model}>{model}</option>)}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Extra Cost Per Day ($)</label>
                        <div className="relative">
                            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500 font-bold">$</span>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={dailyCost}
                                onChange={e => setDailyCost(parseFloat(e.target.value) || 0)}
                                className="w-full p-2.5 pl-8 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all font-mono"
                                placeholder="0.00"
                            />
                        </div>
                    </div>

                    <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
                        <div className="flex justify-between items-center text-sm mb-1">
                            <span className="text-blue-700">Rental Duration:</span>
                            <span className="font-semibold text-blue-900">{rentalDays} day(s)</span>
                        </div>
                         <div className="flex justify-between items-center pt-2 border-t border-blue-200">
                            <span className="font-bold text-blue-800">Total Upgrade Fee:</span>
                            <span className="font-bold text-xl text-blue-700">{formatCurrency(totalCost)}</span>
                        </div>
                    </div>
                </div>

                <footer className="p-4 bg-gray-50 border-t flex justify-between items-center">
                     <button
                        onClick={handleRemove}
                        disabled={!reservation.upgradeInfo}
                        className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg text-sm font-medium disabled:text-gray-300 disabled:hover:bg-transparent transition-colors"
                    >
                        Remove Upgrade
                    </button>
                    <div className="flex gap-2">
                        <button onClick={onClose} className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium transition-colors">Cancel</button>
                        <button onClick={handleSave} className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark text-sm font-medium shadow-sm transition-colors">Apply Upgrade</button>
                    </div>
                </footer>
            </div>
        </div>
    );
};

export default ManageUpgradeModal;
