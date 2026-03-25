import React, { useState } from 'react';
import { RatePlan, Fleet, Aggregator, RatePlanSubmission } from '../types';
import { PlusIcon, TrashIcon, EditIcon, SaveIcon } from './icons';
import ManagePeriodModal from './ManagePeriodModal';

interface ManageRatePlansViewProps {
  aggregator: Aggregator;
  onUpdateAggregator: (updatedAggregator: Aggregator) => void;
  fleet: Fleet;
  showConfirmation: (message: string) => void;
}

const ManageRatePlansView: React.FC<ManageRatePlansViewProps> = ({ aggregator, onUpdateAggregator, fleet, showConfirmation }) => {
  const [editingPlan, setEditingPlan] = useState<RatePlan | null>(null);

  const ratePlans = aggregator.currentRatePlans || [];

  const handleUpdate = (newPlans: RatePlan[]) => {
    onUpdateAggregator({ ...aggregator, currentRatePlans: newPlans });
  };

  const handleAddPeriod = () => {
    const newPlan: RatePlan = {
      id: `plan-${Date.now()}`,
      name: 'New Rate Period',
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString().split('T')[0],
      sippRates: [],
    };
    handleUpdate([...ratePlans, newPlan]);
  };

  const handleDeletePlan = (planId: string) => {
    if(window.confirm("Delete this rate period?")) {
        handleUpdate(ratePlans.filter(p => p.id !== planId));
    }
  };

  const handleSavePlan = (updatedPlan: RatePlan) => {
    handleUpdate(ratePlans.map(p => p.id === updatedPlan.id ? updatedPlan : p));
    setEditingPlan(null);
  }

  const handleSaveAndPublish = () => {
    if (ratePlans.length === 0) {
      alert("There are no current rate plans to save.");
      return;
    }
    
    const newSubmission: RatePlanSubmission = {
        id: `sub-${Date.now()}`,
        submittedAt: new Date().toISOString(),
        ratePlans: JSON.parse(JSON.stringify(ratePlans)), // Deep copy for archive
    };
    
    // Update history BUT KEEP current plans active as per user request
    const updatedAggregator: Aggregator = {
        ...aggregator,
        currentRatePlans: ratePlans, // KEEP ACTIVE
        ratePlanHistory: [newSubmission, ...(aggregator.ratePlanHistory || [])],
    };

    onUpdateAggregator(updatedAggregator);
    showConfirmation(`Rates saved and archived. The new rates will be sent to ${aggregator.name} by the automated system.`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
        <div>
            <h3 className="text-lg font-bold text-slate-800">Rate Management</h3>
            <p className="text-sm text-slate-500">Define pricing periods and rates for {aggregator.name}.</p>
        </div>
        <button 
            onClick={handleAddPeriod} 
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-white border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 shadow-sm transition-all"
        >
          <PlusIcon className="w-4 h-4" /> Add Rate Period
        </button>
      </div>

      <div className="grid gap-4">
        {ratePlans.map(plan => (
          <div key={plan.id} className="group bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all overflow-hidden">
            <div className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4 w-full sm:w-auto">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-lg shrink-0">
                        {plan.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                        <h4 className="font-bold text-slate-800 truncate">{plan.name}</h4>
                        <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-1 text-xs text-slate-500 font-medium">
                            <span className="px-2 py-0.5 bg-slate-100 rounded border border-slate-200">{plan.startDate} &rarr; {plan.endDate}</span>
                            <span className="hidden sm:inline">•</span>
                            <span>{plan.sippRates?.length ?? 0} Vehicle Types</span>
                        </div>
                    </div>
                </div>
                
                 <div className="flex items-center gap-2 w-full sm:w-auto justify-end sm:justify-start sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                    <button onClick={() => setEditingPlan(plan)} className="flex-1 sm:flex-none justify-center px-3 py-1.5 bg-blue-50 text-blue-600 text-xs font-bold uppercase tracking-wider rounded-md hover:bg-blue-100 transition-colors flex items-center gap-1">
                        <EditIcon className="w-3 h-3" /> Edit Rates
                    </button>
                    <button onClick={() => handleDeletePlan(plan.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors">
                        <TrashIcon className="w-4 h-4" />
                    </button>
                 </div>
            </div>
          </div>
        ))}
        
        {ratePlans.length === 0 && (
            <div className="text-center py-12 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
                <p className="text-slate-500 font-medium">No rate periods defined yet.</p>
                <button onClick={handleAddPeriod} className="mt-2 text-primary font-bold hover:underline">Create your first period</button>
            </div>
        )}
      </div>

       {editingPlan && (
        <ManagePeriodModal 
            plan={editingPlan}
            onSave={handleSavePlan}
            onClose={() => setEditingPlan(null)}
            fleet={fleet}
        />
      )}

      {ratePlans.length > 0 && (
          <div className="sticky bottom-0 pt-4 pb-2 bg-gradient-to-t from-white via-white to-transparent z-30 text-right">
            <button
            onClick={handleSaveAndPublish}
            className="inline-flex items-center gap-2 px-6 py-3 bg-green-600 text-white font-bold rounded-full shadow-lg hover:bg-green-700 hover:scale-105 transition-all"
            >
            <SaveIcon className="w-5 h-5" /> Save & Publish Rates
            </button>
        </div>
      )}
    </div>
  );
};

export default ManageRatePlansView;