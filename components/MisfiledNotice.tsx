import React, { useMemo, useState } from 'react';
import { AppData } from '../types';
import { ReservationService } from '../services/reservationService';
import { Button } from './ui/Crm';

/**
 * Shown above the reservations list when some bookings are filed under a month other than their
 * pick-up month (e.g. a booking moved from 30 Sep to 1 Oct before this was handled automatically).
 */
const MisfiledNotice: React.FC<{ data: AppData; onMove: () => Promise<void>; onReview?: () => void }> = ({ data, onMove, onReview }) => {
  const list = useMemo(() => ReservationService.misfiled(data), [data]);
  const [busy, setBusy] = useState(false);
  if (!list.length) return null;
  const sample = list[0];
  return (
    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 flex flex-wrap items-center gap-3">
      <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
      <p className="flex-1 min-w-[220px] text-[13px] text-amber-900">
        <strong>{list.length} booking{list.length === 1 ? ' is' : 's are'} listed under the wrong month.</strong>{' '}
        <span className="text-amber-800">For example {sample.reservation.bookingId || sample.reservation.personName} picks up in {sample.to.m} {sample.to.y} but is listed in {sample.from.m} {sample.from.y}.</span>
      </p>
      {onReview && <Button size="sm" onClick={onReview}>Review & edit</Button>}
      <Button size="sm" variant="primary" disabled={busy} onClick={async () => { setBusy(true); try { await onMove(); } finally { setBusy(false); } }}>
        {busy ? 'Moving…' : 'Move to pick-up month'}
      </Button>
    </div>
  );
};

export default MisfiledNotice;
