
import React from 'react';

interface ManageTermsViewProps {
  terms: string;
  onUpdate: (newTerms: string) => void;
}

const ManageTermsView: React.FC<ManageTermsViewProps> = ({ terms, onUpdate }) => {
  return (
    <div className="max-w-4xl h-full flex flex-col">
        <div className="mb-4">
            <h3 className="text-lg font-bold text-slate-800">Terms & Conditions</h3>
            <p className="text-sm text-slate-500">Define the specific rental policies displayed to customers on this channel.</p>
        </div>
      
        <textarea
            value={terms}
            onChange={e => onUpdate(e.target.value)}
            className="flex-1 w-full p-4 border border-slate-300 rounded-xl text-sm font-mono text-slate-700 focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all leading-relaxed resize-none"
            placeholder="Enter policy text here..."
            style={{ minHeight: '400px' }}
        />
        <p className="text-xs text-right text-slate-400 mt-2">Markdown supported</p>
    </div>
  );
};

export default ManageTermsView;
