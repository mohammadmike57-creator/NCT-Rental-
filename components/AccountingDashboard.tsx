import React, { useState, useMemo } from 'react';
import { AppData, TrafficTicket, VehicleDamage, User, Expense, ExpenseCategory, ReservationStatus, TrafficTicketStatus, VehicleDamageStatus, UserStatus, Reservation, YearData } from '../types';
import { MONTHS, USD_TO_JOD_RATE } from '../constants';
import BarChart from './BarChart';
import ManageExpensesModal from './ManageExpensesModal';
import { PlusIcon, EditIcon, TrashIcon, AccountingIcon } from './icons';
import SecurityKeyModal from './SecurityKeyModal';
import ConfirmationDialog from './ConfirmationDialog';
import { Page, PageHeader, StatGrid, StatItem, Panel, Segmented, Badge, Button, EmptyState, table } from './ui/Crm';

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

    const kpis: StatItem[] = [
        { label: 'Revenue', value: formatCurrency(financialData.totalRevenue), sub: periodLabel },
        { label: 'Expenses', value: formatCurrency(financialData.totalExpenses), sub: 'incl. payroll' },
        { label: 'Net profit', value: formatCurrency(financialData.netProfit), tone: financialData.netProfit < 0 ? 'danger' : 'success' },
        { label: 'Profit margin', value: `${num(financialData.profitMargin).toFixed(1)}%`, tone: financialData.profitMargin < 0 ? 'danger' : 'default' },
    ];

    const breakdown = [
        { label: 'Rentals', value: financialData.revenueFromRentals, bar: 'bg-indigo-500' },
        { label: 'Traffic fines', value: financialData.revenueFromTickets, bar: 'bg-amber-500' },
        { label: 'Damages', value: financialData.revenueFromDamages, bar: 'bg-rose-500' },
    ];
    const breakdownTotal = financialData.totalRevenue > 0 ? financialData.totalRevenue : 1;

    const CategoryPill: React.FC<{ exp: Expense }> = ({ exp }) => (
        <Badge tone={exp.isRecurring ? 'info' : 'default'} dot={false}>
            {exp.category}{exp.isRecurring ? ' · auto' : ''}
        </Badge>
    );

    return (
        <Page>
            <PageHeader
                section="Financials & Incidents"
                title="Accounting"
                subtitle={`Revenue, expenses and profit · ${periodLabel.toLowerCase()}`}
                actions={<>
                    <Segmented
                        options={filterTabs.map(t => ({ key: t.key, label: t.name }))}
                        value={filter}
                        onChange={k => setFilter(k as FilterPeriod)}
                    />
                    <Button variant="primary" onClick={() => handleActionAttempt('add')} icon={<PlusIcon className="w-4 h-4" />}>
                        Add expense
                    </Button>
                </>}
            />

            <StatGrid items={kpis} />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 min-w-0 min-h-[320px] [&>div]:rounded-xl [&>div]:p-4 [&_h3]:text-sm">
                    <BarChart data={chartData} title={`Monthly overview · ${new Date().getFullYear()}`} unit="JOD" unitPosition="before" />
                </div>
                <Panel title="Revenue breakdown" subtitle={periodLabel} padded>
                    <div className="space-y-4">
                        {breakdown.map(b => (
                            <div key={b.label}>
                                <div className="flex items-baseline justify-between gap-3">
                                    <span className="text-[13px] text-slate-600">{b.label}</span>
                                    <span className="text-[13px] font-semibold text-slate-900 tabular-nums">{formatCurrency(b.value)}</span>
                                </div>
                                <div className="mt-1.5 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                    <div className={`h-full rounded-full ${b.bar}`} style={{ width: `${Math.max(0, Math.min(100, (num(b.value) / breakdownTotal) * 100))}%` }} />
                                </div>
                            </div>
                        ))}
                        <div className="flex items-baseline justify-between gap-3 pt-3 border-t border-slate-100">
                            <span className="text-[13px] font-semibold text-slate-900">Total revenue</span>
                            <span className="text-sm font-semibold text-slate-900 tabular-nums">{formatCurrency(financialData.totalRevenue)}</span>
                        </div>
                    </div>
                </Panel>
            </div>

            {/* Expenses */}
            <Panel
                title={<>Expenses <span className="ml-1 text-slate-400 font-normal tabular-nums">{filteredExpenses.length}</span></>}
                subtitle="Payroll entries are generated automatically from active staff salaries."
                actions={<span className="text-[13px] font-semibold text-slate-900 tabular-nums whitespace-nowrap">{formatCurrency(financialData.totalExpenses)}</span>}
            >
                {filteredExpenses.length === 0 ? (
                    <EmptyState
                        icon={<AccountingIcon />}
                        title="No expenses for this period"
                        hint="Add an expense or choose a different period."
                        action={<Button variant="primary" size="sm" onClick={() => handleActionAttempt('add')} icon={<PlusIcon className="w-4 h-4" />}>Add expense</Button>}
                    />
                ) : (
                    <>
                        <table className={`hidden md:table ${table.wrap}`}>
                            <thead className={table.head}>
                                <tr>
                                    <th className={table.th}>Date</th>
                                    <th className={table.th}>Category</th>
                                    <th className={table.th}>Description</th>
                                    <th className={`${table.th} text-right`}>Amount</th>
                                    <th className={`${table.th} text-right w-24`}>Actions</th>
                                </tr>
                            </thead>
                            <tbody className={table.body}>
                                {filteredExpenses.map(exp => (
                                    <tr key={exp.id} className={table.row}>
                                        <td className={`${table.td} whitespace-nowrap text-slate-600 tabular-nums`}>{formatDate(exp.date)}</td>
                                        <td className={`${table.td} whitespace-nowrap`}><CategoryPill exp={exp} /></td>
                                        <td className={`${table.td} text-slate-800`}>{exp.description}</td>
                                        <td className={`${table.td} text-right font-semibold text-slate-900 tabular-nums whitespace-nowrap`}>{formatCurrency(exp.amount)}</td>
                                        <td className={`${table.td} text-right`}>
                                            {!exp.isRecurring && (
                                                <div className="inline-flex items-center gap-0.5">
                                                    <button onClick={() => handleActionAttempt('edit', exp)} className="w-8 h-8 inline-flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900" title="Edit" aria-label="Edit expense"><EditIcon className="w-4 h-4" /></button>
                                                    <button onClick={() => handleActionAttempt('delete', exp)} className="w-8 h-8 inline-flex items-center justify-center rounded-md text-slate-500 hover:bg-rose-50 hover:text-rose-600" title="Delete" aria-label="Delete expense"><TrashIcon className="w-4 h-4" /></button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <ul className="md:hidden divide-y divide-slate-100">
                            {filteredExpenses.map(exp => (
                                <li key={exp.id} className="px-4 py-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="text-[13px] font-medium text-slate-900 break-words">{exp.description}</p>
                                            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                                <CategoryPill exp={exp} />
                                                <span className="tabular-nums">{formatDate(exp.date)}</span>
                                            </div>
                                        </div>
                                        <span className="text-[13px] font-semibold text-slate-900 tabular-nums whitespace-nowrap">{formatCurrency(exp.amount)}</span>
                                    </div>
                                    {!exp.isRecurring && (
                                        <div className="mt-2.5 grid grid-cols-2 gap-2">
                                            <Button size="sm" onClick={() => handleActionAttempt('edit', exp)} icon={<EditIcon className="w-4 h-4" />}>Edit</Button>
                                            <Button size="sm" variant="danger" onClick={() => handleActionAttempt('delete', exp)} icon={<TrashIcon className="w-4 h-4" />}>Delete</Button>
                                        </div>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </>
                )}
            </Panel>

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
        </Page>
    );
};

export default AccountingDashboard;
