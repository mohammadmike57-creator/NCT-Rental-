
import React from 'react';
import { textareaCls } from './ui/Crm';

interface ManageTermsViewProps {
  terms: string;
  onUpdate: (newTerms: string) => void;
}

const ManageTermsView: React.FC<ManageTermsViewProps> = ({ terms, onUpdate }) => {
  return (
    <div className="h-full flex flex-col">
        <div className="mb-3">
            <h3 className="text-sm font-semibold text-slate-900">Terms & Conditions</h3>
            <p className="text-xs text-slate-500">Define the specific rental policies displayed to customers on this channel.</p>
        </div>
      
        <textarea
            value={terms}
            onChange={e => onUpdate(e.target.value)}
            className={`${textareaCls} flex-1 font-mono leading-relaxed resize-y`}
            placeholder="Enter policy text here..."
            style={{ minHeight: '400px' }}
        />
        <p className="text-xs text-right text-slate-400 mt-2 tabular-nums">{(terms || '').length} characters · included in the rate sheet XML as plain text</p>
    </div>
  );
};

export default ManageTermsView;
