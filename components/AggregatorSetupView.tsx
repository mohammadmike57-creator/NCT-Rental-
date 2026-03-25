import React, { useState } from 'react';
import { Aggregator, Fleet, StopSale, AvailableExtra } from '../types';
import { PlusIcon, TrashIcon, GlobeAltIcon, ChevronRightIcon, StopIcon } from './icons';
import ManageRatePlansView from './ManageRatePlansView';
import ManageTermsView from './ManageTermsView';
import ManageConnectionView from './ManageConnectionView';
import ManageAggregatorExtrasView from './ManageAggregatorExtrasView';
import ManageStopSaleView from './ManageStopSaleView';
import XMLPreviewView from './XMLPreviewView';
import RateHistoryView from './RateHistoryView';

interface AggregatorSetupViewProps {
  aggregators: Aggregator[];
  onUpdateAggregators: (aggregators: Aggregator[]) => void;
  fleet: Fleet;
  availableExtras: AvailableExtra[];
  stopSales: StopSale[];
  onUpdateStopSales: (stopSales: StopSale[]) => void;
  showConfirmation: (message: string) => void;
}

const AggregatorSetupView: React.FC<AggregatorSetupViewProps> = ({ 
    aggregators, onUpdateAggregators, fleet, availableExtras, stopSales, onUpdateStopSales, showConfirmation
}) => {
  const [selectedAggregatorId, setSelectedAggregatorId] = useState<string | null>(aggregators.length > 0 ? aggregators[0].id : null);
  const [isAddingPartner, setIsAddingPartner] = useState(false);
  const [newAggregatorName, setNewAggregatorName] = useState('');
  const [activeTab, setActiveTab] = useState('Current Rates');

  // If no partner is selected but we have partners, select the first one
  if (!selectedAggregatorId && aggregators.length > 0) {
      setSelectedAggregatorId(aggregators[0].id);
  }

  const handleAddAggregator = () => {
    if (!newAggregatorName.trim()) return;
    const newAggregator: Aggregator = {
      id: `agg-${Date.now()}`,
      name: newAggregatorName.trim(),
      connectionDetails: { apiUrl: '', username: '', apiKey: '' },
      currentRatePlans: [],
      ratePlanHistory: [],
      extras: [],
      termsAndConditions: `Default terms for ${newAggregatorName.trim()}.`,
    };
    onUpdateAggregators([...aggregators, newAggregator]);
    setNewAggregatorName('');
    setIsAddingPartner(false);
    setSelectedAggregatorId(newAggregator.id);
    showConfirmation(`Partner ${newAggregator.name} added successfully.`);
  };

  const handleDeleteAggregator = (id: string) => {
    if (window.confirm('Are you sure you want to delete this partner and all its settings? This action cannot be undone.')) {
      const newAggregators = aggregators.filter(agg => agg.id !== id);
      onUpdateAggregators(newAggregators);
      if (selectedAggregatorId === id) {
        setSelectedAggregatorId(newAggregators.length > 0 ? newAggregators[0].id : null);
      }
    }
  };

  const selectedAggregator = aggregators.find(agg => agg.id === selectedAggregatorId);

  const handleUpdateAggregator = (updatedAggregator: Aggregator) => {
    const updatedAggregators = aggregators.map(agg => 
      agg.id === updatedAggregator.id ? updatedAggregator : agg
    );
    onUpdateAggregators(updatedAggregators);
  };

  const aggregatorTabs = ['Connection', 'Current Rates', 'Rate History', 'Extras', 'Terms & Conditions', 'XML Preview'];

  return (
    <div className="flex flex-col h-[calc(100vh-100px)] bg-slate-50 border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center shrink-0">
        <div>
             <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <GlobeAltIcon className="text-primary w-6 h-6" /> OTA Integration Hub
            </h2>
            <p className="text-xs text-slate-500 mt-1">Manage channel connectivity, rates, and inventory distribution.</p>
        </div>
        <div>
             <button 
                onClick={() => setActiveTab('Stop Sale')} 
                className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-md transition-all border ${activeTab === 'Stop Sale' ? 'bg-red-50 text-red-700 border-red-200 shadow-inner' : 'bg-white text-slate-600 border-slate-200 hover:border-red-300 hover:text-red-600'}`}
             >
                 <StopIcon className="w-4 h-4"/> Global Stop Sale
             </button>
        </div>
      </div>

      {activeTab === 'Stop Sale' ? (
           <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
               <div className="max-w-6xl mx-auto">
                 <ManageStopSaleView stopSales={stopSales} onUpdate={onUpdateStopSales} fleet={fleet} />
               </div>
           </div>
      ) : (
        <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
            {/* Sidebar: Partner List */}
            <aside className="w-full md:w-72 bg-white border-r border-slate-200 flex flex-col shrink-0 z-10">
                <div className="p-4 bg-slate-50/50 border-b border-slate-100">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Distribution Channels</h3>
                </div>
                
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                    {aggregators.map(agg => (
                        <div 
                            key={agg.id}
                            onClick={() => { setSelectedAggregatorId(agg.id); setActiveTab('Current Rates'); }}
                            className={`group relative flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all duration-200 border ${selectedAggregatorId === agg.id ? 'bg-slate-800 text-white border-slate-800 shadow-md' : 'bg-white text-slate-600 border-transparent hover:bg-slate-50 hover:border-slate-200'}`}
                        >
                            <div className="flex items-center gap-3 overflow-hidden">
                                <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 shadow-sm ${agg.connectionDetails.apiKey ? 'bg-green-400' : 'bg-slate-300'}`}></div>
                                <span className="font-semibold truncate text-sm">{agg.name}</span>
                            </div>
                             {selectedAggregatorId === agg.id && (
                                 <ChevronRightIcon className="w-4 h-4 text-slate-400" />
                             )}
                             <button 
                                onClick={(e) => { e.stopPropagation(); handleDeleteAggregator(agg.id); }} 
                                className={`absolute right-2 p-1.5 rounded-md transition-all ${selectedAggregatorId === agg.id ? 'text-slate-400 hover:text-white hover:bg-white/10' : 'text-slate-300 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100'}`}
                            >
                                <TrashIcon className="w-3 h-3" />
                            </button>
                        </div>
                    ))}
                    
                    {isAddingPartner ? (
                        <div className="p-3 bg-slate-50 border border-blue-200 rounded-lg mt-2 shadow-sm animate-in fade-in slide-in-from-top-2">
                            <input
                                type="text"
                                value={newAggregatorName}
                                onChange={e => setNewAggregatorName(e.target.value)}
                                placeholder="Channel Name..."
                                className="w-full p-2 text-sm border border-slate-300 rounded-md mb-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                autoFocus
                            />
                            <div className="flex gap-2">
                                <button onClick={handleAddAggregator} className="flex-1 py-1.5 bg-blue-600 text-white text-xs font-bold rounded hover:bg-blue-700">Add</button>
                                <button onClick={() => setIsAddingPartner(false)} className="flex-1 py-1.5 bg-white border border-slate-300 text-slate-600 text-xs font-bold rounded hover:bg-slate-100">Cancel</button>
                            </div>
                        </div>
                    ) : (
                        <button 
                            onClick={() => setIsAddingPartner(true)} 
                            className="w-full py-3 border border-dashed border-slate-300 rounded-lg text-slate-500 text-sm font-medium hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-all flex items-center justify-center gap-2 mt-2"
                        >
                            <PlusIcon className="w-4 h-4" /> Add Channel
                        </button>
                    )}
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col min-w-0 bg-slate-50 overflow-hidden relative">
                {selectedAggregator ? (
                    <>
                        {/* Tab Navigation */}
                        <div className="bg-white border-b border-slate-200 px-6 py-2 flex items-center gap-1 overflow-x-auto no-scrollbar shrink-0">
                            {aggregatorTabs.map(tab => (
                                <button
                                    key={tab}
                                    onClick={() => setActiveTab(tab)}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all border-b-2 ${activeTab === tab ? 'border-primary text-primary bg-slate-50' : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'}`}
                                >
                                    {tab}
                                </button>
                            ))}
                        </div>

                        {/* Tab Content */}
                        <div className="flex-1 overflow-y-auto p-6">
                            <div className="max-w-6xl mx-auto space-y-6">
                                {activeTab === 'Connection' && (
                                    <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200">
                                        <ManageConnectionView aggregator={selectedAggregator} onUpdate={handleUpdateAggregator} />
                                    </div>
                                )}
                                {activeTab === 'Current Rates' && (
                                    <ManageRatePlansView 
                                        aggregator={selectedAggregator} 
                                        onUpdateAggregator={handleUpdateAggregator} 
                                        fleet={fleet} 
                                        showConfirmation={showConfirmation} 
                                    />
                                )}
                                {activeTab === 'Rate History' && (
                                     <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 h-full">
                                        <RateHistoryView history={selectedAggregator.ratePlanHistory || []} />
                                     </div>
                                )}
                                {activeTab === 'Extras' && (
                                    <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200">
                                        <ManageAggregatorExtrasView aggregator={selectedAggregator} onUpdate={handleUpdateAggregator} globalExtras={availableExtras} />
                                    </div>
                                )}
                                {activeTab === 'Terms & Conditions' && (
                                     <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 h-full">
                                        <ManageTermsView terms={selectedAggregator.termsAndConditions} onUpdate={terms => handleUpdateAggregator({...selectedAggregator, termsAndConditions: terms})} />
                                     </div>
                                )}
                                {activeTab === 'XML Preview' && (
                                     <div className="bg-white p-0 rounded-xl shadow-sm border border-slate-200 overflow-hidden h-full">
                                        <XMLPreviewView currentRatePlans={selectedAggregator.currentRatePlans} />
                                     </div>
                                )}
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-6 text-center">
                        <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                            <GlobeAltIcon className="w-10 h-10 text-slate-300" />
                        </div>
                        <h3 className="text-lg font-bold text-slate-700">No Channel Selected</h3>
                        <p className="text-sm mt-2 max-w-xs">Select a partner from the sidebar to configure connection settings, rates, and inventory.</p>
                    </div>
                )}
            </main>
        </div>
      )}
    </div>
  );
};

export default AggregatorSetupView;