
import React, { useState } from 'react';
import { StopSale, Fleet } from '../types';
import { PlusIcon, TrashIcon, StopIcon } from './icons';
import { CAR_CATEGORIES } from '../constants';
import { Panel, Segmented, Button, Field, EmptyState, inputCls, selectCls, table } from './ui/Crm';
import { displayDay } from '../services/displayDate';

interface ManageStopSaleViewProps {
    stopSales: StopSale[];
    onUpdate: (updatedStopSales: StopSale[]) => void;
    fleet: Fleet;
    /** When given, a block can be limited to some channels (none chosen = every channel). */
    channels?: { id: string; name: string }[];
    /** Replaces the red "Global Stop Sale" notice (used by the multi-channel editor). */
    intro?: React.ReactNode;
    /** Wording for the list title and the add button. */
    listTitle?: string;
}

const ManageStopSaleView: React.FC<ManageStopSaleViewProps> = ({ stopSales, onUpdate, fleet, channels, intro, listTitle = 'Active stop sales' }) => {
    const [type, setType] = useState<'vehicle' | 'category'>('vehicle');
    const [channelIds, setChannelIds] = useState<string[]>([]);
    const channelNames = (ss: StopSale) => !ss.channelIds?.length ? 'All channels'
        : ss.channelIds.map(id => channels?.find(c => c.id === id)?.name || id).join(', ');
    const [target, setTarget] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [reason, setReason] = useState('');

    const handleAddStopSale = () => {
        if (!target || !startDate || !endDate) {
            alert('Choose a car or category, a start date and an end date.');
            return;
        }
        if (startDate > endDate) {
            alert('Start date cannot be after end date.');
            return;
        }

        const newStopSale: StopSale = {
            id: `ss-${Date.now()}`,
            type,
            target,
            startDate,
            endDate,
            reason: reason.trim(),
            ...(channels && channelIds.length ? { channelIds } : {}),
        };

        onUpdate([...stopSales, newStopSale]);
        setTarget('');
        setStartDate('');
        setEndDate('');
        setReason('');
        setChannelIds([]);
    };

    const handleDelete = (id: string) => {
        if (window.confirm('Are you sure you want to remove this stop sale? This will make the vehicle/category available again.')) {
            onUpdate(stopSales.filter(ss => ss.id !== id));
        }
    };
    
    const getTargetName = (ss: StopSale) => {
        if (ss.type === 'category') {
            return <span className="font-semibold text-slate-900">Category: {ss.target}</span>;
        }
        const vehicle = fleet.find(v => v.id === ss.target);
        return vehicle ? <span className="font-medium text-slate-900">{vehicle.modelName} <span className="text-slate-400 text-xs font-normal">({vehicle.licensePlate})</span></span> : 'Unknown Vehicle';
    };

    return (
        <div className="space-y-4">
            {intro ?? (
            <div className="flex items-start gap-3 px-4 py-3 bg-white border border-slate-200 rounded-xl">
                <span className="w-7 h-7 rounded-lg bg-rose-50 text-rose-600 ring-1 ring-inset ring-rose-100 flex items-center justify-center shrink-0"><StopIcon className="w-4 h-4" /></span>
                <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-slate-900">How stop sales work</h3>
                    <p className="text-[13px] text-slate-600">
                        A stopped car or category is not offered over XML{channels ? ' to the channels you choose (every channel when none is chosen)' : ' to any broker'} for those dates, whatever its availability.
                    </p>
                </div>
            </div>
            )}

            <Panel
                title="New stop sale"
                actions={
                    <Segmented
                        options={[{ key: 'vehicle', label: 'One car' }, { key: 'category', label: 'Whole category' }]}
                        value={type}
                        onChange={k => { setType(k as 'vehicle' | 'category'); setTarget(''); }}
                    />
                }
                footer={
                    <div className="flex justify-end">
                        <Button variant="primary" onClick={handleAddStopSale} icon={<PlusIcon className="w-4 h-4" />} className="w-full sm:w-auto">Add stop sale</Button>
                    </div>
                }
            >
                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
                    <Field label={type === 'vehicle' ? 'Vehicle' : 'Category'} required className="sm:col-span-2 lg:col-span-1">
                        <select value={target} onChange={e => setTarget(e.target.value)} className={`${selectCls} w-full`}>
                            <option value="">Choose…</option>
                            {type === 'vehicle' ? (
                                fleet.map(v => <option key={v.id} value={v.id}>{v.modelName} ({v.licensePlate})</option>)
                            ) : (
                                CAR_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)
                            )}
                        </select>
                    </Field>
                    <Field label="From" required>
                        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={inputCls} />
                    </Field>
                    <Field label="To" required>
                        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className={inputCls} />
                    </Field>
                    <Field label="Reason (optional)" className="sm:col-span-2 lg:col-span-1">
                        <input type="text" value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Maintenance" className={inputCls} />
                    </Field>
                    {channels && channels.length > 0 && (
                        <Field label="Channels" hint={channelIds.length ? `${channelIds.length} of ${channels.length} chosen` : 'None chosen: the stop sale applies to every channel'} className="sm:col-span-2 lg:col-span-4">
                            <div className="flex flex-wrap gap-1.5">
                                {channels.map(c => {
                                    const on = channelIds.includes(c.id);
                                    return (
                                        <button key={c.id} type="button" aria-pressed={on} onClick={() => setChannelIds(ids => (on ? ids.filter(x => x !== c.id) : [...ids, c.id]))}
                                            className={`h-8 px-3 rounded-lg border text-xs font-semibold transition-colors ${on ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>
                                            {on ? '✓ ' : ''}{c.name}
                                        </button>
                                    );
                                })}
                            </div>
                        </Field>
                    )}
                </div>
            </Panel>

            <Panel title={listTitle} subtitle={`${stopSales.length} stop sale${stopSales.length === 1 ? '' : 's'}`}>
                {stopSales.length === 0 ? (
                    <EmptyState icon={<StopIcon />} title="No stop sales" hint="Every car is offered to the brokers on its available dates." />
                ) : (
                    <>
                        <table className={`hidden md:table ${table.wrap}`}>
                            <thead className={table.head}>
                                <tr>
                                    <th className={table.th}>Target</th>
                                    <th className={table.th}>Period</th>
                                    <th className={table.th}>Reason</th>
                                    {channels && <th className={table.th}>Channels</th>}
                                    <th className={`${table.th} text-right`}>Action</th>
                                </tr>
                            </thead>
                            <tbody className={table.body}>
                                {stopSales.map(ss => (
                                    <tr key={ss.id} className={table.row}>
                                        <td className={`${table.td} whitespace-nowrap`}>{getTargetName(ss)}</td>
                                        <td className={`${table.td} whitespace-nowrap text-slate-700 tabular-nums`}>{displayDay(ss.startDate)} &rarr; {displayDay(ss.endDate)}</td>
                                        <td className={`${table.td} text-slate-600`}>{ss.reason || '-'}</td>
                                        {channels && <td className={`${table.td} text-slate-600`}>{channelNames(ss)}</td>}
                                        <td className={`${table.td} text-right`}>
                                            <Button size="sm" variant="ghost" className="hover:!text-rose-600 hover:!bg-rose-50" onClick={() => handleDelete(ss.id)} title="Remove stop sale" icon={<TrashIcon className="w-4 h-4" />}>Remove</Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <ul className="md:hidden divide-y divide-slate-100">
                            {stopSales.map(ss => (
                                <li key={ss.id} className="px-4 py-3 flex items-start gap-3">
                                    <div className="min-w-0 flex-1 text-[13px]">
                                        <div className="truncate">{getTargetName(ss)}</div>
                                        <p className="mt-0.5 text-xs text-slate-600 tabular-nums">{displayDay(ss.startDate)} &rarr; {displayDay(ss.endDate)}</p>
                                        {ss.reason && <p className="mt-0.5 text-xs text-slate-500">{ss.reason}</p>}
                                        {channels && <p className="mt-0.5 text-xs text-slate-500">{channelNames(ss)}</p>}
                                    </div>
                                    <button onClick={() => handleDelete(ss.id)} title="Remove stop sale" aria-label="Remove Block" className="w-8 h-8 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50">
                                        <TrashIcon className="w-4 h-4" />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </>
                )}
            </Panel>
        </div>
    );
};

export default ManageStopSaleView;
