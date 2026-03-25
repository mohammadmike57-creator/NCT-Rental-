
import React, { useState, useEffect } from 'react';
import { Aggregator, AggregatorConnectionDetails } from '../types';
import { SaveIcon, LockClosedIcon } from './icons';

interface ManageConnectionViewProps {
    aggregator: Aggregator;
    onUpdate: (updatedAggregator: Aggregator) => void;
}

const ManageConnectionView: React.FC<ManageConnectionViewProps> = ({ aggregator, onUpdate }) => {
    const [details, setDetails] = useState<AggregatorConnectionDetails>(
        aggregator.connectionDetails || { apiUrl: '', username: '', apiKey: '' }
    );

    useEffect(() => {
        setDetails(aggregator.connectionDetails || { apiUrl: '', username: '', apiKey: '' });
    }, [aggregator]);

    const handleChange = (field: keyof AggregatorConnectionDetails, value: string) => {
        setDetails(prev => ({ ...(prev || {}), [field]: value } as AggregatorConnectionDetails));
    };

    const handleSave = () => {
        onUpdate({ ...aggregator, connectionDetails: details });
        alert('Connection details saved securely.');
    };

    return (
        <div className="max-w-2xl">
            <div className="mb-6">
                 <h3 className="text-lg font-bold text-slate-800">API Configuration</h3>
                 <p className="text-sm text-slate-500">Manage authentication credentials for {aggregator.name}.</p>
            </div>
           
            <div className="bg-white p-4 sm:p-6 rounded-xl border border-slate-200 shadow-sm space-y-5">
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Endpoint URL</label>
                    <input
                        type="text"
                        value={details?.apiUrl || ''}
                        onChange={e => handleChange('apiUrl', e.target.value)}
                        className="w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                        placeholder="https://api.partner.com/v1/"
                    />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                     <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Username / Channel ID</label>
                        <input
                            type="text"
                            value={details?.username || ''}
                            onChange={e => handleChange('username', e.target.value)}
                            className="w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                        />
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">API Key / Secret</label>
                        <div className="relative">
                            <input
                                type="password"
                                value={details?.apiKey || ''}
                                onChange={e => handleChange('apiKey', e.target.value)}
                                className="w-full p-2.5 pl-9 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-mono"
                            />
                            <LockClosedIcon className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                        </div>
                    </div>
                </div>
            </div>

            <div className="mt-6 flex justify-end">
                <button onClick={handleSave} className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 bg-primary text-white font-medium rounded-lg hover:bg-primary-dark shadow-sm transition-all">
                    <SaveIcon className="w-4 h-4" /> Save Credentials
                </button>
            </div>
        </div>
    );
};

export default ManageConnectionView;
