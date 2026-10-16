'use client';

import React, { useState } from 'react';
import MobileDataTable from './MobileDataTable';
import { BottomSheet, MobileDatePicker, MobileAutocomplete, MobileInput } from './MobileFormComponents';
import { PlusIcon, FunnelIcon } from '@heroicons/react/24/outline';
import { hapticFeedback } from '../utils/mobileUtils';

interface Reservation {
  id: string;
  customerName: string;
  vehicle: string;
  pickupDate: string;
  returnDate: string;
  status: 'active' | 'pending' | 'completed' | 'cancelled';
  totalAmount: string;
  days: number;
}

export default function MobileReservationsPage() {
  const [showNewReservation, setShowNewReservation] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Sample data
  const reservations: Reservation[] = [
    {
      id: 'RES-001',
      customerName: 'John Smith',
      vehicle: 'Toyota Camry 2024',
      pickupDate: '2024-01-15',
      returnDate: '2024-01-20',
      status: 'active',
      totalAmount: '$450.00',
      days: 5,
    },
    {
      id: 'RES-002',
      customerName: 'Sarah Johnson',
      vehicle: 'Honda Accord 2024',
      pickupDate: '2024-01-18',
      returnDate: '2024-01-22',
      status: 'pending',
      totalAmount: '$380.00',
      days: 4,
    },
    {
      id: 'RES-003',
      customerName: 'Mike Wilson',
      vehicle: 'Tesla Model 3',
      pickupDate: '2024-01-10',
      returnDate: '2024-01-15',
      status: 'completed',
      totalAmount: '$750.00',
      days: 5,
    },
    {
      id: 'RES-004',
      customerName: 'Emily Davis',
      vehicle: 'Ford Explorer 2024',
      pickupDate: '2024-01-20',
      returnDate: '2024-01-25',
      status: 'pending',
      totalAmount: '$520.00',
      days: 5,
    },
    {
      id: 'RES-005',
      customerName: 'David Brown',
      vehicle: 'BMW X5 2024',
      pickupDate: '2024-01-12',
      returnDate: '2024-01-14',
      status: 'cancelled',
      totalAmount: '$0.00',
      days: 2,
    },
  ];

  // Form state
  const [formData, setFormData] = useState({
    customer: '',
    vehicle: '',
    pickupDate: '',
    returnDate: '',
    notes: '',
  });

  const [filterData, setFilterData] = useState({
    status: 'all',
    dateFrom: '',
    dateTo: '',
  });

  const columns = [
    {
      key: 'id',
      label: 'ID',
      render: (value: string, row: Reservation) => (
        <div>
          <div className="font-semibold">{row.customerName}</div>
          <div className="text-xs text-slate-500">{value}</div>
        </div>
      ),
    },
    {
      key: 'vehicle',
      label: 'Vehicle',
    },
    {
      key: 'status',
      label: 'Status',
      render: (value: string) => {
        const statusColors = {
          active: 'bg-emerald-100 text-emerald-700',
          pending: 'bg-amber-100 text-amber-700',
          completed: 'bg-sky-100 text-sky-700',
          cancelled: 'bg-rose-100 text-rose-700',
        };
        return (
          <span
            className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
              statusColors[value as keyof typeof statusColors]
            }`}
          >
            {value.charAt(0).toUpperCase() + value.slice(1)}
          </span>
        );
      },
    },
    {
      key: 'pickupDate',
      label: 'Pickup Date',
    },
    {
      key: 'returnDate',
      label: 'Return Date',
    },
    {
      key: 'days',
      label: 'Duration',
      render: (value: number) => `${value} days`,
    },
    {
      key: 'totalAmount',
      label: 'Total Amount',
    },
  ];

  const customerOptions = [
    { value: 'customer-1', label: 'John Smith', subtitle: 'john@email.com' },
    { value: 'customer-2', label: 'Sarah Johnson', subtitle: 'sarah@email.com' },
    { value: 'customer-3', label: 'Mike Wilson', subtitle: 'mike@email.com' },
  ];

  const vehicleOptions = [
    { value: 'vehicle-1', label: 'Toyota Camry 2024', subtitle: 'Sedan - $90/day' },
    { value: 'vehicle-2', label: 'Honda Accord 2024', subtitle: 'Sedan - $95/day' },
    { value: 'vehicle-3', label: 'Tesla Model 3', subtitle: 'Electric - $150/day' },
    { value: 'vehicle-4', label: 'Ford Explorer 2024', subtitle: 'SUV - $104/day' },
  ];

  const handleNewReservation = () => {
    hapticFeedback();
    setShowNewReservation(true);
  };

  const handleSubmitReservation = () => {
    hapticFeedback();
    console.log('Creating reservation:', formData);
    setShowNewReservation(false);
    // Show success toast
  };

  const handleEdit = (reservation: Reservation) => {
    console.log('Edit reservation:', reservation);
    // Navigate to edit page or show edit bottom sheet
  };

  const handleDelete = (reservation: Reservation) => {
    console.log('Delete reservation:', reservation);
    // Show confirmation dialog
  };

  const handleView = (reservation: Reservation) => {
    console.log('View reservation:', reservation);
    // Navigate to detail page
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      {/* Header */}
      <div className="sticky top-14 z-20 px-4 py-6 safe-area-top bg-slate-900">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">Reservations</h1>
            <p className="text-sky-100">Manage your bookings</p>
          </div>
          <button
            onClick={() => setShowFilters(true)}
            className="p-3 bg-white bg-opacity-20 rounded-lg text-white active:bg-opacity-30 transition-colors touch-manipulation"
          >
            <FunnelIcon className="w-6 h-6" />
          </button>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-3 mt-4">
          <div className="bg-white bg-opacity-20 rounded-lg p-3 backdrop-blur-sm">
            <div className="text-2xl font-bold text-white">42</div>
            <div className="text-xs text-sky-100">Active</div>
          </div>
          <div className="bg-white bg-opacity-20 rounded-lg p-3 backdrop-blur-sm">
            <div className="text-2xl font-bold text-white">28</div>
            <div className="text-xs text-sky-100">Pending</div>
          </div>
          <div className="bg-white bg-opacity-20 rounded-lg p-3 backdrop-blur-sm">
            <div className="text-2xl font-bold text-white">156</div>
            <div className="text-xs text-sky-100">Total</div>
          </div>
        </div>
      </div>

      {/* Data Table */}
      <div className="flex-1 overflow-hidden">
        <MobileDataTable
          data={reservations}
          columns={columns}
          primaryKey="id"
          onEdit={handleEdit}
          onDelete={handleDelete}
          onView={handleView}
          searchable
          filterable
          selectable
          pagination
        />
      </div>

      {/* Floating Action Button */}
      <button
        onClick={handleNewReservation}
        className="fixed bottom-20 right-4 w-14 h-14 bg-emerald-600 rounded-full shadow-lg flex items-center justify-center text-white active:scale-95 transition-transform z-30 touch-manipulation"
      >
        <PlusIcon className="w-7 h-7" />
      </button>

      {/* New Reservation Bottom Sheet */}
      <BottomSheet
        isOpen={showNewReservation}
        onClose={() => setShowNewReservation(false)}
        title="New Reservation"
        height="full"
      >
        <form className="space-y-4">
          <MobileAutocomplete
            label="Customer"
            options={customerOptions}
            value={formData.customer}
            onChange={(value) => setFormData({ ...formData, customer: value })}
            required
          />

          <MobileAutocomplete
            label="Vehicle"
            options={vehicleOptions}
            value={formData.vehicle}
            onChange={(value) => setFormData({ ...formData, vehicle: value })}
            required
          />

          <MobileDatePicker
            label="Pickup Date"
            value={formData.pickupDate}
            onChange={(value) => setFormData({ ...formData, pickupDate: value })}
            min={new Date().toISOString().split('T')[0]}
            required
          />

          <MobileDatePicker
            label="Return Date"
            value={formData.returnDate}
            onChange={(value) => setFormData({ ...formData, returnDate: value })}
            min={formData.pickupDate || new Date().toISOString().split('T')[0]}
            required
          />

          <MobileInput
            label="Notes"
            value={formData.notes}
            onChange={(value) => setFormData({ ...formData, notes: value })}
            placeholder="Add any special requirements..."
          />

          {/* Summary */}
          {formData.pickupDate && formData.returnDate && (
            <div className="bg-sky-50 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-slate-900 mb-2">
                Reservation Summary
              </h3>
              <div className="space-y-1 text-sm text-slate-700">
                <div className="flex justify-between">
                  <span>Duration:</span>
                  <span className="font-semibold">
                    {Math.ceil(
                      (new Date(formData.returnDate).getTime() -
                        new Date(formData.pickupDate).getTime()) /
                        (1000 * 60 * 60 * 24)
                    )}{' '}
                    days
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Rate:</span>
                  <span className="font-semibold">$90.00 / day</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-sky-200">
                  <span className="font-semibold">Total:</span>
                  <span className="font-bold text-sky-600">$450.00</span>
                </div>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={handleSubmitReservation}
            className="w-full px-4 py-3 text-base font-medium text-white bg-emerald-600 rounded-lg active:bg-emerald-600 transition-colors touch-manipulation"
          >
            Create Reservation
          </button>
        </form>
      </BottomSheet>

      {/* Filters Bottom Sheet */}
      <BottomSheet
        isOpen={showFilters}
        onClose={() => setShowFilters(false)}
        title="Filter Reservations"
        height="auto"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Status
            </label>
            <div className="grid grid-cols-2 gap-2">
              {['all', 'active', 'pending', 'completed', 'cancelled'].map((status) => (
                <button
                  key={status}
                  onClick={() => setFilterData({ ...filterData, status })}
                  className={`px-4 py-2.5 text-sm font-medium rounded-lg transition-colors touch-manipulation ${
                    filterData.status === status
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-100 text-slate-700 active:bg-slate-200'
                  }`}
                >
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <MobileDatePicker
            label="Date From"
            value={filterData.dateFrom}
            onChange={(value) => setFilterData({ ...filterData, dateFrom: value })}
          />

          <MobileDatePicker
            label="Date To"
            value={filterData.dateTo}
            onChange={(value) => setFilterData({ ...filterData, dateTo: value })}
            min={filterData.dateFrom}
          />

          <div className="flex space-x-2">
            <button
              onClick={() => {
                setFilterData({ status: 'all', dateFrom: '', dateTo: '' });
                setShowFilters(false);
              }}
              className="flex-1 px-4 py-3 text-base font-medium text-slate-700 bg-slate-100 rounded-lg active:bg-slate-200 transition-colors touch-manipulation"
            >
              Reset
            </button>
            <button
              onClick={() => {
                console.log('Apply filters:', filterData);
                setShowFilters(false);
              }}
              className="flex-1 px-4 py-3 text-base font-medium text-white bg-emerald-600 rounded-lg active:bg-emerald-600 transition-colors touch-manipulation"
            >
              Apply
            </button>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}
