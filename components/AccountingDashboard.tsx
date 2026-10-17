import React, { useState, useMemo } from 'react';
import { AppData, TrafficTicket, VehicleDamage, User, Expense, ExpenseCategory, ReservationStatus, TrafficTicketStatus, VehicleDamageStatus, UserStatus, Reservation, YearData } from '../types';
import { MONTHS, USD_TO_JOD_RATE } from '../constants';
import BarChart from './BarChart';
import ManageExpensesModal from './ManageExpensesModal';
import { PlusIcon, EditIcon, TrashIcon, AccountingIcon } from './icons';
import SecurityKeyModal from './SecurityKeyModal';
import ConfirmationDialog from './ConfirmationDialog';

interface AccountingDashboardProps {
  allData: AppData;
  trafficTickets: TrafficTicket[];
  vehicleDamages: VehicleDamage[];
  expenses: Expense[];
  users: User[];
  onUpdateExpenses: (updatedExpenses: Expense[]) => void;
}

type FilterPeriod = 'this_month' | 'last_month' | 'this_year';

/**
 * Coerce any stored amount to a finite number. Records coming from the backend
 * can carry amounts as strings ("120.5"), null/undefined (e.g. users without a
 * baseSalaryJOD) or garbage; a single bad value used to poison every total with NaN.
 */
const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

const monthReservations = (yearData: YearData | undefined | null): Reservation[] =>
  Object.values(yearData || {}).flatMap(month => (Array.isArray(month) ? month : []));

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
        const totalMonthlySalary = (users || [])
            .filter(u => u.status === UserStatus.ACTIVE)
            .reduce((sum, u) => sum + num(u.baseSalaryJOD), 0);

        if (totalMonthlySalary <= 0) return [];

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

    const allExpensesWithPayroll = useMemo(() => [...(expenses || []), ...payrollExpenses], [expenses, payrollExpenses]);

    const financialData = useMemo(() => {
        const { startDate, endDate } = dateRange;
        let totalRevenue = 0;
        let revenueFromRentals = 0;
        let revenueFromTickets = 0;
        let revenueFromDamages = 0;
        let totalExpenses = 0;

        const allReservations: Reservation[] = Object.values(allData || {}).flatMap((yearData: YearData) => monthReservations(yearData));

        // Calculate Revenue
        allReservations.forEach((res: Reservation) => {
            if (res && res.status === ReservationStatus.CONFIRMED && res.startDate) {
                const resDate = new Date(res.startDate);
                if (resDate >= startDate && resDate <= endDate) {
                    const revenueJOD = num(res.amount) * USD_TO_JOD_RATE;
                    totalRevenue += revenueJOD;
                    revenueFromRentals += revenueJOD;
                }
            }
        });

        (trafficTickets || []).forEach(ticket => {
            if (ticket.status === TrafficTicketStatus.COLLECTED) {
                const ticketDate = new Date(ticket.ticketDate);
                if (ticketDate >= startDate && ticketDate <= endDate) {
                    const amount = num(ticket.amount);
                    totalRevenue += amount;
                    revenueFromTickets += amount;
                }
            }
        });

        (vehicleDamages || []).forEach(damage => {
            if (damage.status === VehicleDamageStatus.COLLECTED) {
                const linkedReservation = allReservations.find(r => r && r.bookingId === damage.bookingId);
                if (linkedReservation && linkedReservation.startDate) {
                    const resDate = new Date(linkedReservation.startDate);
                    if (resDate >= startDate && resDate <= endDate) {
                        const policeAmount = num(damage.policeReportAmount);
                        const collectedAmountJOD = policeAmount > 0 ? policeAmount : num(damage.amount);
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
                totalExpenses += num(expense.amount);
            }
        });

        const netProfit = totalRevenue - totalExpenses;
        const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

        return { totalRevenue, totalExpenses, netProfit, profitMargin, revenueFromRentals, revenueFromTickets, revenueFromDamages };
    }, [allData, trafficTickets, vehicleDamages, allExpensesWithPayroll, dateRange]);

    const chartData = useMemo(() => {
        const labels = MONTHS;
        const revenueData: number[] = Array(12).fill(0);
        const expenseData: number[] = Array(12).fill(0);
        const year = new Date().getFullYear();

        Object.values(allData || {}).forEach((yearData: YearData) => {
            Object.entries(yearData || {}).forEach(([month, reservations]) => {
                const monthIndex = MONTHS.indexOf(month);
                if (monthIndex > -1 && Array.isArray(reservations)) {
                    const monthlyRevenue = reservations
                        .filter(r => r && r.status === ReservationStatus.CONFIRMED && r.startDate && new Date(r.startDate).getFullYear() === year)
                        .reduce((sum, r) => sum + (num(r.amount) * USD_TO_JOD_RATE), 0);
                    revenueData[monthIndex] += monthlyRevenue;
                }
            });
        });

        allExpensesWithPayroll.forEach(expense => {
            const expenseDate = new Date(expense.date);
            if (expenseDate.getFullYear() === year) {
                expenseData[expenseDate.getMonth()] += num(expense.amount);
            }
        });

        return {
            labels: labels.map(l => l.substring(0, 3)),
            datasets: [
                { label: 'Revenue', data: revenueData, color: '#4F46E5' },
                { label: 'Expenses', data: expenseData, color: '#F43F5E' }
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
        .sort((a,b) => (new Date(b.date).getTime() || 0) - (new Date(a.date).getTime() || 0));
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

    const fmt = (value: unknown) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num(value));
    const formatCurrency = (value: unknown) => `JOD ${fmt(value)}`;
    const formatDate = (d: string) => {
        const t = new Date(d);
        return isNaN(t.getTime()) ? (d || '-') : t.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    };

    const filterTabs: {key: FilterPeriod, name: string}[] = [
        {key: 'this_month', name: 'This month'},
        {key: 'last_month', name: 'Last month'},
        {key: 'this_year', name: 'This year'},
    ];
    const periodLabel = filterTabs.find(t => t.key === filter)?.name || 'This year';

    const kpis: { label: string; value: string; tone: string; hint?: string }[] = [
        { label: 'Revenue', value: formatCurrency(financialData.totalRevenue), tone: 'text-slate-900' },
        { label: 'Expenses', value: formatCurrency(financialData.totalExpenses), tone: 'text-slate-900' },
        { label: 'Net profit', value: formatCurrency(financialData.netProfit), tone: financialData.netProfit < 0 ? 'text-rose-600' : 'text-emerald-600' },
        { label: 'Profit margin', value: `${num(financialData.profitMargin).toFixed(1)}%`, tone: financialData.profitMargin < 0 ? 'text-rose-600' : 'text-slate-900' },
    ];

    const breakdown = [
        { label: 'Rentals', value: financialData.revenueFromRentals, bar: 'bg-indigo-500' },
        { label: 'Traffic fines', value: financialData.revenueFromTickets, bar: 'bg-amber-500' },
        { label: 'Damages', value: financialData.revenueFromDamages, bar: 'bg-rose-500' },
    ];
    const breakdownTotal = financialData.totalRevenue > 0 ? financialData.totalRevenue : 1;

    const CategoryPill: React.FC<{ exp: Expense }> = ({ exp }) => (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset whitespace-nowrap ${exp.isRecurring ? 'bg-violet-50 text-violet-700 ring-violet-200' : 'bg-slate-100 text-slate-700 ring-slate-200'}`}>
            {exp.category}{exp.isRecurring ? ' · auto' : ''}
        </span>
    );

    return (
        <div className="space-y-5 mb-10">
            {/* Header */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
                <div className="p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="flex items-center gap-4 min-w-0">
                        <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                            <AccountingIcon className="w-6 h-6" />
                        </div>
                        <div className="min-w-0">
                            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Accounting</h2>
                            <p className="text-sm text-slate-500">Revenue, expenses and profit · {periodLabel.toLowerCase()}</p>
                        </div>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full lg:w-auto">
                        <div className="grid grid-cols-3 sm:inline-flex p-1 bg-slate-100 rounded-xl">
                            {filterTabs.map(t => (
                                <button key={t.key} onClick={() => setFilter(t.key)}
                                    className={`px-3 py-1.5 text-sm font-semibold rounded-lg whitespace-nowrap ${filter === t.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
                                    {t.name}
                                </button>
                            ))}
                        </div>
                        <button onClick={() => handleActionAttempt('add')}
                            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 shadow-sm">
                            <PlusIcon className="w-4 h-4" /> Add expense
                        </button>
                    </div>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 border-t border-slate-100 divide-x divide-y lg:divide-y-0 divide-slate-100">
                    {kpis.map(k => (
                        <div key={k.label} className="px-4 sm:px-5 py-4 min-w-0">
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{k.label}</p>
                            <p className={`mt-1 text-lg sm:text-2xl font-bold tabular-nums truncate ${k.tone}`} title={k.value}>{k.value}</p>
                        </div>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                <div className="lg:col-span-2 min-w-0 min-h-[320px]">
                    <BarChart data={chartData} title={`Monthly overview · ${new Date().getFullYear()}`} unit="JOD" unitPosition="before" />
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6 min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Revenue breakdown</p>
                    <div className="mt-4 space-y-4">
                        {breakdown.map(b => (
                            <div key={b.label}>
                                <div className="flex items-baseline justify-between gap-3">
                                    <span className="text-sm text-slate-600">{b.label}</span>
                                    <span className="text-sm font-semibold text-slate-900 tabular-nums">{formatCurrency(b.value)}</span>
                                </div>
                                <div className="mt-1.5 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                    <div className={`h-full rounded-full ${b.bar}`} style={{ width: `${Math.max(0, Math.min(100, (num(b.value) / breakdownTotal) * 100))}%` }} />
                                </div>
                            </div>
                        ))}
                        <div className="flex items-baseline justify-between gap-3 pt-4 border-t border-slate-100">
                            <span className="text-sm font-bold text-slate-900">Total revenue</span>
                            <span className="text-base font-bold text-slate-900 tabular-nums">{formatCurrency(financialData.totalRevenue)}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Expenses */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Expenses · {filteredExpenses.length}</p>
                        <p className="text-sm text-slate-500 truncate">Payroll entries are generated automatically from active staff salaries.</p>
                    </div>
                    <span className="hidden sm:block text-sm font-bold text-slate-900 tabular-nums whitespace-nowrap">{formatCurrency(financialData.totalExpenses)}</span>
                </div>

                {filteredExpenses.length === 0 ? (
                    <div className="px-6 py-14 text-center">
                        <div className="mx-auto w-12 h-12 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center">
                            <AccountingIcon className="w-6 h-6" />
                        </div>
                        <p className="mt-3 font-semibold text-slate-700">No expenses for this period</p>
                        <p className="text-sm text-slate-500">Add an expense or choose a different period.</p>
                    </div>
                ) : (
                    <>
                        <div className="hidden md:block">
                            <table className="min-w-full text-sm">
                                <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                                    <tr>
                                        <th className="px-5 py-3 text-left font-semibold">Date</th>
                                        <th className="px-5 py-3 text-left font-semibold">Category</th>
                                        <th className="px-5 py-3 text-left font-semibold">Description</th>
                                        <th className="px-5 py-3 text-right font-semibold">Amount</th>
                                        <th className="px-5 py-3 text-right font-semibold w-24">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {filteredExpenses.map(exp => (
                                        <tr key={exp.id} className="hover:bg-slate-50/70">
                                            <td className="px-5 py-3 whitespace-nowrap text-slate-600 tabular-nums">{formatDate(exp.date)}</td>
                                            <td className="px-5 py-3 whitespace-nowrap"><CategoryPill exp={exp} /></td>
                                            <td className="px-5 py-3 text-slate-800">{exp.description}</td>
                                            <td className="px-5 py-3 text-right font-semibold text-slate-900 tabular-nums whitespace-nowrap">{formatCurrency(exp.amount)}</td>
                                            <td className="px-5 py-3 text-right">
                                                {!exp.isRecurring && (
                                                    <div className="inline-flex items-center gap-1">
                                                        <button onClick={() => handleActionAttempt('edit', exp)} className="p-2 rounded-lg text-slate-500 hover:bg-indigo-50 hover:text-indigo-600" title="Edit" aria-label="Edit expense"><EditIcon className="w-4 h-4" /></button>
                                                        <button onClick={() => handleActionAttempt('delete', exp)} className="p-2 rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-600" title="Delete" aria-label="Delete expense"><TrashIcon className="w-4 h-4" /></button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <ul className="md:hidden divide-y divide-slate-100">
                            {filteredExpenses.map(exp => (
                                <li key={exp.id} className="px-4 py-3.5">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium text-slate-900 break-words">{exp.description}</p>
                                            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                                <CategoryPill exp={exp} />
                                                <span className="tabular-nums">{formatDate(exp.date)}</span>
                                            </div>
                                        </div>
                                        <span className="text-sm font-bold text-slate-900 tabular-nums whitespace-nowrap">{formatCurrency(exp.amount)}</span>
                                    </div>
                                    {!exp.isRecurring && (
                                        <div className="mt-3 grid grid-cols-2 gap-2">
                                            <button onClick={() => handleActionAttempt('edit', exp)} className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-xl ring-1 ring-slate-200 text-slate-700 hover:bg-slate-50"><EditIcon className="w-4 h-4" /> Edit</button>
                                            <button onClick={() => handleActionAttempt('delete', exp)} className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-xl ring-1 ring-rose-200 text-rose-600 hover:bg-rose-50"><TrashIcon className="w-4 h-4" /> Delete</button>
                                        </div>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </>
                )}
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
