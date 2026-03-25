
import React, { useState } from 'react';
import { Expense, ExpenseCategory } from '../types';
import { EXPENSE_CATEGORIES } from '../constants';
import { CloseIcon } from './icons';

interface ManageExpensesModalProps {
  expense?: Expense | null;
  onSave: (expense: Expense) => void;
  onClose: () => void;
}

const ManageExpensesModal: React.FC<ManageExpensesModalProps> = ({ expense, onSave, onClose }) => {
  const [localExpense, setLocalExpense] = useState<Omit<Expense, 'id' | 'isRecurring'> & { id?: string }>(
    expense || {
      date: new Date().toISOString().split('T')[0],
      category: EXPENSE_CATEGORIES[0],
      description: '',
      amount: 0,
    }
  );

  const handleInputChange = (field: keyof typeof localExpense, value: any) => {
    setLocalExpense(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (localExpense.amount <= 0 || !localExpense.description.trim()) {
      alert('Please fill in a description and an amount greater than zero.');
      return;
    }
    const expenseToSave: Expense = {
        id: expense?.id || `exp-${Date.now()}`,
        isRecurring: expense?.isRecurring || false,
        ...localExpense,
        category: localExpense.category as ExpenseCategory,
    };
    onSave(expenseToSave);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-2xl w-full max-w-lg">
        <header className="flex items-center justify-between p-4 border-b">
          <h2 className="text-xl font-semibold">{expense ? 'Edit' : 'Add'} Expense</h2>
          <button type="button" onClick={onClose} className="p-1 rounded-full hover:bg-gray-200"><CloseIcon /></button>
        </header>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Date</label>
              <input type="date" value={localExpense.date} onChange={e => handleInputChange('date', e.target.value)} className="w-full p-2 mt-1 border rounded-md" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Amount (JOD)</label>
              <input type="number" step="0.01" value={localExpense.amount || ''} onChange={e => handleInputChange('amount', parseFloat(e.target.value) || 0)} className="w-full p-2 mt-1 border rounded-md" required placeholder="0.00" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Category</label>
            <select value={localExpense.category} onChange={e => handleInputChange('category', e.target.value)} className="w-full p-2 mt-1 border rounded-md">
              {EXPENSE_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Description</label>
            <textarea value={localExpense.description} onChange={e => handleInputChange('description', e.target.value)} rows={3} className="w-full p-2 mt-1 border rounded-md" required />
          </div>
        </div>
        <footer className="p-4 bg-gray-50 border-t flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300">Cancel</button>
          <button type="submit" className="px-6 py-2 bg-primary text-white rounded-md hover:bg-secondary">Save Expense</button>
        </footer>
      </form>
    </div>
  );
};

export default ManageExpensesModal;