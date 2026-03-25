
import React, { useState } from 'react';
import { PlusIcon, TrashIcon } from './icons';

interface ManageYearsViewProps {
  years: number[];
  onAddYear: (year: number) => void;
  onRemoveYear: (year: number) => void;
}

const ManageYearsView: React.FC<ManageYearsViewProps> = ({ years, onAddYear, onRemoveYear }) => {
  const [newYear, setNewYear] = useState<string>('');

  const handleAddClick = () => {
    const yearNum = parseInt(newYear, 10);
    if (yearNum && yearNum > 2000 && yearNum < 2100) {
      onAddYear(yearNum);
      setNewYear('');
    } else {
      alert('Please enter a valid year (e.g., 2027).');
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6 max-w-lg mx-auto">
      <header className="mb-6">
        <h2 className="text-xl font-semibold text-gray-800">Manage Reservation Years</h2>
      </header>

      <div>
        <div className="flex items-center gap-2 mb-4">
          <input
            type="number"
            value={newYear}
            onChange={(e) => setNewYear(e.target.value)}
            placeholder="Add new year"
            className="flex-grow p-2 border border-gray-300 rounded-md text-sm focus:ring-secondary focus:border-secondary"
          />
          <button
            onClick={handleAddClick}
            className="flex items-center gap-2 px-4 py-2 bg-secondary text-white rounded-md hover:bg-primary transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-secondary text-sm font-medium"
            aria-label="Add year"
          >
            <PlusIcon />
            Add
          </button>
        </div>
        <ul className="space-y-2">
          {[...years].sort((a, b) => a - b).map((year) => (
            <li
              key={year}
              className="flex items-center justify-between bg-gray-50 p-2 rounded-md"
            >
              <span className="text-gray-700">{year}</span>
              <button
                onClick={() => onRemoveYear(year)}
                className="text-gray-400 hover:text-red-600 transition-colors"
                aria-label={`Delete ${year}`}
              >
                <TrashIcon />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default ManageYearsView;
