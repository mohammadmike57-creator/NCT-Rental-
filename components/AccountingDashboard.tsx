

import React, { useState, useMemo } from 'react';
import { AppData, TrafficTicket, VehicleDamage, User, Expense, ExpenseCategory, ReservationStatus, TrafficTicketStatus, VehicleDamageStatus, UserStatus, Reservation, YearData } from '../types';
import { MONTHS, USD_TO_JOD_RATE } from '../constants';
import BarChart from './BarChart';
import ManageExpensesModal from './ManageExpensesModal';
import { PlusIcon, EditIcon, TrashIcon } from './icons';
import SecurityKeyModal from './SecurityKeyModal';
import ConfirmationDialog from './ConfirmationDialog';
import Tabs from './Tabs';

interface AccountingDashboardProps {
  allData: AppData;
  trafficTickets: TrafficTicket[];
  vehicleDamages: VehicleDamage[];
  expenses: Expense[];
  users: User[];
  onUpdateExpenses: (updatedExpenses: Expense[]) => void;
}

type FilterPeriod = 'this_month' | 'last_month' | 'this_year';

const StatCard: React.FC<{ title: string, value: string, subtext?: string }> = ({ title, value, subtext }) => (
    <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
        <h4 className="text-sm font-medium text-gray-500">{title}</h4>
        <p className="text-2xl font-bold text-gray-800 mt-1">{value}</p>
        {subtext && <p className="text-xs text-gray-500 mt-1">{subtext}</p>}
    </div>
);

const AccountingDashboard: React.FC<AccountingDashboardProps> = ({ allData, trafficTickets, vehicleDamages, expenses, users, onUpdateExpenses }) => {
    const [filter, setFilter] = useState<FilterPeriod>('this_year');
    const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
    const [expenseToEdit, setExpenseToEdit] = useState<Expense | null>(null);
    const [expenseToDelete, setExpenseToDelete] = useState<Expense | null>(null);
    const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);
    const [pendingAction, setPendingAction] = useState<{ type: 'edit' | 'delete' | 'add', payload?: any } | null>(null);

    const dateRange = useMemo(() => {
        const now = new Date();
        let startDate: Date;
        let endDate: Date;

        switch (filter) {
            case 'this_month':
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                break;
            case 'last_month':
                startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                endDate = new Date(now.getFullYear(), now.getMonth(), 0);
                break;
            case 'this_year':
            default:
                startDate = new Date(now.getFullYear(), 0, 1);
                endDate = new Date(now.getFullYear(), 11, 31);
                break;
        }
        return { startDate, endDate };
    }, [filter]);

    const payrollExpenses = useMemo(() => {
        const totalMonthlySalary = users
            .filter(u => u.status === UserStatus.ACTIVE)
            .reduce((sum, u) => sum + u.baseSalaryJOD, 0);
        
        if (totalMonthlySalary === 0) return [];
        
        const generatedExpenses: Expense[] = [];
        const startYear = new Date().getFullYear(); // Assume current year for salaries
        
        for (let i = 0; i < 12; i++) {
            generatedExpenses.push({
                id: `payroll-${startYear}-${i}`,
                date: new Date(startYear, i, 15).toISOString().split('T')[0],
                category: ExpenseCategory.SALARIES,
                description: `Monthly Staff Salaries for ${MONTHS[i]}`,
                amount: totalMonthlySalary,
                isRecurring: true,
            });
        }
        return generatedExpenses;
    }, [users]);
    
    const allExpensesWithPayroll = useMemo(() => [...expenses, ...payrollExpenses], [expenses, payrollExpenses]);

    const financialData = useMemo(() => {
        const { startDate, endDate } = dateRange;
        let totalRevenue = 0;
        let revenueFromRentals = 0;
        let revenueFromTickets = 0;
        let revenueFromDamages = 0;
        let totalExpenses = 0;

        const allReservations: Reservation[] = Object.values(allData).flatMap(yearData => Object.values(yearData).reduce((acc, month) => acc.concat(month), [] as Reservation[]));

        // Calculate Revenue
        allReservations.forEach((res: Reservation) => {
            if (res.status === ReservationStatus.CONFIRMED && res.startDate) {
                const resDate = new Date(res.startDate);
                if (resDate >= startDate && resDate <= endDate) {
                    const revenueJOD = (res.amount || 0) * USD_TO_JOD_RATE;
                    totalRevenue += revenueJOD;
                    revenueFromRentals += revenueJOD;
                }
            }
        });
        
        trafficTickets.forEach(ticket => {
            if (ticket.status === TrafficTicketStatus.COLLECTED) {
                const ticketDate = new Date(ticket.ticketDate);
                if (ticketDate >= startDate && ticketDate <= endDate) {
                    totalRevenue += ticket.amount;
                    revenueFromTickets += ticket.amount;
                }
            }
        });

        vehicleDamages.forEach(damage => {
            if (damage.status === VehicleDamageStatus.COLLECTED) {
                const linkedReservation = allReservations.find(r => r.bookingId === damage.bookingId);
                if (linkedReservation && linkedReservation.startDate) {
                    const resDate = new Date(linkedReservation.startDate);
                    if (resDate >= startDate && resDate <= endDate) {
                        const collectedAmountJOD = (damage.policeReportAmount && damage.policeReportAmount > 0)
                            ? damage.policeReportAmount
                            : damage.amount;
                        totalRevenue += collectedAmountJOD;
                        revenueFromDamages += collectedAmountJOD;
                    }
                }
            }
        });

        // Calculate Expenses
        allExpensesWithPayroll.forEach(expense => {
            const expenseDate = new Date(expense.date);
            if (expenseDate >= startDate && expenseDate <= endDate) {
                totalExpenses += expense.amount;
            }
        });
        
        const netProfit = totalRevenue - totalExpenses;
        const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

        return { totalRevenue, totalExpenses, netProfit, profitMargin, revenueFromRentals, revenueFromTickets, revenueFromDamages };
    }, [allData, trafficTickets, vehicleDamages, allExpensesWithPayroll, dateRange]);

    const chartData = useMemo(() => {
        const labels = MONTHS;
        const revenueData = Array(12).fill(0);
        const expenseData = Array(12).fill(0);
        const year = new Date().getFullYear();

        Object.values(allData).forEach((yearData: YearData) => {
            Object.entries(yearData).forEach(([month, reservations]) => {
                const monthIndex = MONTHS.indexOf(month);
                if (monthIndex > -1) {
                    const monthlyRevenue = reservations
                        .filter(r => r.status === ReservationStatus.CONFIRMED && r.startDate && new Date(r.startDate).getFullYear() === year)
                        .reduce((sum, r) => sum + ((r.amount || 0) * USD_TO_JOD_RATE), 0);
                    revenueData[monthIndex] += monthlyRevenue;
                }
            });
        });
        
        allExpensesWithPayroll.forEach(expense => {
            const expenseDate = new Date(expense.date);
            if (expenseDate.getFullYear() === year) {
                expenseData[expenseDate.getMonth()] += expense.amount;
            }
        });

        return {
            labels: labels.map(l => l.substring(0, 3)),
            datasets: [
                { label: 'Revenue', data: revenueData, color: '#3B82F6' },
                { label: 'Expenses', data: expenseData, color: '#EF4444' }
            ]
        };
    }, [allData, allExpensesWithPayroll]);
    
    const filteredExpenses = useMemo(() => {
      const { startDate, endDate } = dateRange;
      return allExpensesWithPayroll
        .filter(exp => {
          const expDate = new Date(exp.date);
          return expDate >= startDate && expDate <= endDate;
        })
        .sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [allExpensesWithPayroll, dateRange]);


    const handleActionAttempt = (type: 'edit' | 'delete' | 'add', payload?: any) => {
        if (payload?.isRecurring) {
            alert("Auto-generated payroll expenses cannot be modified.");
            return;
        }
        setPendingAction({ type, payload });
        setIsKeyModalOpen(true);
    };

    const handleKeySuccess = () => {
        if (!pendingAction) return;
        switch (pendingAction.type) {
            case 'add':
                setExpenseToEdit(null);
                setIsExpenseModalOpen(true);
                break;
            case 'edit':
                setExpenseToEdit(pendingAction.payload);
                setIsExpenseModalOpen(true);
                break;
            case 'delete':
                setExpenseToDelete(pendingAction.payload);
                break;
        }
        setIsKeyModalOpen(false);
        setPendingAction(null);
    };

    const handleSaveExpense = (expense: Expense) => {
        const updatedExpenses = expenseToEdit
            ? expenses.map(e => e.id === expense.id ? expense : e)
            : [...expenses, expense];
        onUpdateExpenses(updatedExpenses);
        setIsExpenseModalOpen(false);
        setExpenseToEdit(null);
    };
    
    const handleConfirmDelete = () => {
      if (expenseToDelete) {
        onUpdateExpenses(expenses.filter(e => e.id !== expenseToDelete.id));
      }
      setExpenseToDelete(null);
    };

    const formatCurrency = (value: number) => `JOD ${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}`;
    
    const filterTabs: {key: FilterPeriod, name: string}[] = [
        {key: 'this_month', name: 'This Month'},
        {key: 'last_month', name: 'Last Month'},
        {key: 'this_year', name: 'This Year'},
    ];

    return (
        <div className="p-4 sm:p-6 bg-gray-50/50">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-bold text-gray-800">Accounting Dashboard</h3>
                <Tabs 
                    tabs={filterTabs.map(t => t.name)}
                    selectedTab={filterTabs.find(t => t.key === filter)?.name || 'This Year'}
                    onSelectTab={(tabName) => {
                        const newFilter = filterTabs.find(t => t.name === tabName);
                        if (newFilter) setFilter(newFilter.key);
                    }}
                    variant="pills"
                    size="sm"
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <StatCard title="Total Revenue" value={formatCurrency(financialData.totalRevenue)} />
                <StatCard title="Total Expenses" value={formatCurrency(financialData.totalExpenses)} />
                <StatCard title="Net Profit" value={formatCurrency(financialData.netProfit)} />
                <StatCard title="Profit Margin" value={`${financialData.profitMargin.toFixed(2)}%`} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                <div className="lg:col-span-2">
                    <BarChart data={chartData} title={`Monthly Overview for ${new Date().getFullYear()}`} unit="JOD" unitPosition="before" />
                </div>
                <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
                    <h3 className="text-lg font-semibold text-gray-700 mb-4">Revenue Breakdown</h3>
                    <div className="space-y-3">
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600">Rentals</span>
                            <span className="font-semibold">{formatCurrency(financialData.revenueFromRentals)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600">Traffic Fines</span>
                            <span className="font-semibold">{formatCurrency(financialData.revenueFromTickets)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600">Damages</span>
                            <span className="font-semibold">{formatCurrency(financialData.revenueFromDamages)}</span>
                        </div>
                        <div className="flex justify-between items-center pt-3 border-t-2">
                            <span className="font-bold">Total</span>
                            <span className="font-bold">{formatCurrency(financialData.totalRevenue)}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold text-gray-700">Expense Management</h3>
                    <button onClick={() => handleActionAttempt('add')} className="flex items-center gap-1.5 px-3 py-2 bg-primary text-white text-sm rounded-md hover:bg-secondary">
                        <PlusIcon /> Add Expense
                    </button>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-4 py-2 text-left font-medium text-gray-500">Date</th>
                                <th className="px-4 py-2 text-left font-medium text-gray-500">Category</th>
                                <th className="px-4 py-2 text-left font-medium text-gray-500">Description</th>
                                <th className="px-4 py-2 text-right font-medium text-gray-500">Amount</th>
                                <th className="px-4 py-2 text-center font-medium text-gray-500">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {filteredExpenses.map(exp => (
                                <tr key={exp.id}>
                                    <td className="px-4 py-2 whitespace-nowrap">{exp.date}</td>
                                    <td className="px-4 py-2 whitespace-nowrap">
                                        <span className={`px-2 py-1 text-xs rounded-full ${exp.isRecurring ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}`}>
                                            {exp.category}
                                        </span>
                                    </td>
                                    <td className="px-4 py-2">{exp.description}</td>
                                    <td className="px-4 py-2 text-right font-mono">{formatCurrency(exp.amount)}</td>
                                    <td className="px-4 py-2 text-center">
                                        {!exp.isRecurring && (
                                            <div className="flex items-center justify-center gap-2">
                                                <button onClick={() => handleActionAttempt('edit', exp)} className="p-1 text-blue-600 hover:text-blue-800" title="Edit"><EditIcon /></button>
                                                <button onClick={() => handleActionAttempt('delete', exp)} className="p-1 text-red-600 hover:text-red-800" title="Delete"><TrashIcon /></button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {filteredExpenses.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="text-center py-6 text-gray-500">No expenses recorded for this period.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {isExpenseModalOpen && (
                <ManageExpensesModal 
                    expense={expenseToEdit}
                    onSave={handleSaveExpense}
                    onClose={() => { setIsExpenseModalOpen(false); setExpenseToEdit(null); }}
                />
            )}
             {expenseToDelete && (
                <ConfirmationDialog
                    message={`Are you sure you want to delete this expense: "${expenseToDelete.description}"?`}
                    onConfirm={handleConfirmDelete}
                    onCancel={() => setExpenseToDelete(null)}
                    confirmButtonText="Delete Expense"
                />
            )}
            {isKeyModalOpen && (
                <SecurityKeyModal
                    onSuccess={handleKeySuccess}
                    onClose={() => { setIsKeyModalOpen(false); setPendingAction(null); }}
                />
            )}
        </div>
    );
};

export default AccountingDashboard;
