import React from 'react';
import { CarExchange, CarView, DamageMarker, Reservation } from '../../types';
import { KmFieldProps } from './Fields';
import { Bi } from '../ui/Bi';
import { labelCls } from '../ui/Crm';
import { StepSection, FuelGauge, ChecklistGrid, DamageBoard, SignatureBlock, inputCls, areaCls } from './AgreementParts';
import { CHECKLIST_ITEMS } from './InspectionStep';

export interface ExchangeStepProps {
  step: 'checkin' | 'checkout';
  reservation: Reservation;
  localReservation: Reservation;
  hasOutstandingTickets: boolean;
  hasDueExtension: boolean;
  currentExchange: Partial<CarExchange>;
  setCurrentExchange: React.Dispatch<React.SetStateAction<Partial<CarExchange>>>;
  renderKmField: (props: KmFieldProps) => React.ReactNode;
  renderTextField: (label: string, value: string, onChange: (val: string) => void, isEditable: boolean, isEmail?: boolean) => React.ReactNode;
}

/** Car exchange during a rental: return the current car (check-in), then hand over the new one (check-out). */
const ExchangeStep: React.FC<ExchangeStepProps> = ({
  step, reservation, localReservation, hasOutstandingTickets, hasDueExtension, currentExchange, setCurrentExchange, renderKmField, renderTextField,
}) => {
  const checklistItems = CHECKLIST_ITEMS;
  const isEditable = !localReservation.dropOffCompleted && !hasOutstandingTickets && !hasDueExtension;
  const checklist = currentExchange[step === 'checkin' ? 'checkinChecklist' : 'checkoutChecklist'] || {};
  const damageMarkers = currentExchange[step === 'checkin' ? 'checkinDamageMarkers' : 'checkoutDamageMarkers'] || [];
  const fuelLevel = currentExchange[step === 'checkin' ? 'checkinFuelLevel' : 'checkoutFuelLevel'];
  const renterSign = currentExchange[step === 'checkin' ? 'checkinRenterSignature' : 'checkoutRenterSignature'];
  const agentSign = currentExchange[step === 'checkin' ? 'checkinAgentSignature' : 'checkoutAgentSignature'];
  const agentName = currentExchange[step === 'checkin' ? 'checkinAgentName' : 'checkoutAgentName'];

  const handleExchangeFieldChange = (field: keyof CarExchange, value: any) => {
    if (!isEditable) return;
    setCurrentExchange(prev => ({ ...prev, [field]: value }));
  };

  const handleExchangeDamageMark = (e: React.MouseEvent<HTMLDivElement>, view: CarView) => {
    if (!isEditable) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    const field = step === 'checkin' ? 'checkinDamageMarkers' : 'checkoutDamageMarkers';
    handleExchangeFieldChange(field, [...(currentExchange[field] || []), { x, y, view }]);
  };

  const removeExchangeDamageMarker = (index: number) => {
    if (!isEditable) return;
    const field = step === 'checkin' ? 'checkinDamageMarkers' : 'checkoutDamageMarkers';
    handleExchangeFieldChange(field, currentExchange[field]?.filter((_, i) => i !== index));
  };

  const updateExchangeDamageMarker = (index: number, patch: Partial<DamageMarker>) => {
    if (!isEditable) return;
    const field = step === 'checkin' ? 'checkinDamageMarkers' : 'checkoutDamageMarkers';
    handleExchangeFieldChange(field, (currentExchange[field] || []).map((m, i) => (i === index ? { ...m, ...patch } : m)));
  };

  const isIn = step === 'checkin';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 p-2 rounded-xl bg-white border border-slate-200 shadow-sm">
        <span className={`px-2.5 py-1 rounded-md text-xs font-semibold ${isIn ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>1 · Return current car</span>
        <span className="text-slate-300">→</span>
        <span className={`px-2.5 py-1 rounded-md text-xs font-semibold ${!isIn ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>2 · Hand over new car</span>
      </div>
      <div className="space-y-4">
        <div>
          <StepSection title={isIn ? 'Current car inspection' : 'New car inspection'}>
            <ChecklistGrid items={checklistItems} checked={checklist} disabled={!isEditable}
              onToggle={(item, v) => handleExchangeFieldChange(isIn ? 'checkinChecklist' : 'checkoutChecklist', { ...checklist, [item]: v })} />
          </StepSection>
        </div>
        <div>
          <StepSection title="Fuel, mileage & details">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <FuelGauge level={fuelLevel} disabled={!isEditable}
                onLevelChange={level => handleExchangeFieldChange(isIn ? 'checkinFuelLevel' : 'checkoutFuelLevel', level)}
                pickupLevel={isIn ? localReservation.pickupFuelLevel : undefined} />
              {renderKmField({ label: isIn ? 'Odometer in (current car)' : 'Odometer out (new car)', value: isIn ? currentExchange.checkinKmIn : currentExchange.checkoutKmOut, onChange: v => handleExchangeFieldChange(isIn ? 'checkinKmIn' : 'checkoutKmOut', v), editable: isEditable, reference: isIn ? localReservation.pickupKmOut : undefined, referenceLabel: isIn ? 'Out' : undefined, placeholder: isIn ? 'Returning reading' : 'Starting reading' })}
              {isIn ? (
                <div>
                  <label className={labelCls}><Bi en="Reason for exchange" /></label>
                  <textarea value={currentExchange.reason || ''} onChange={e => handleExchangeFieldChange('reason', e.target.value)} rows={2} className={areaCls} required disabled={!isEditable} />
                </div>
              ) : (
                <div>
                  <label className={labelCls}><Bi en="New car license plate" /></label>
                  <input value={currentExchange.newCarLicensePlate || ''} onChange={e => handleExchangeFieldChange('newCarLicensePlate', e.target.value)} className={inputCls} required disabled={!isEditable} />
                </div>
              )}
            </div>
          </StepSection>
        </div>
      </div>
      <StepSection title="Damage report">
        <DamageBoard markers={damageMarkers} priorMarkers={isIn ? localReservation.pickupDamageMarkers || [] : undefined}
          editable={isEditable} onMark={handleExchangeDamageMark} onRemove={removeExchangeDamageMarker} onUpdate={updateExchangeDamageMarker} />
      </StepSection>
      <StepSection title="Signatures">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SignatureBlock title="Renter" subtitle={reservation.personName} signature={renterSign} disabled={!isEditable}
            onSave={data => handleExchangeFieldChange(isIn ? 'checkinRenterSignature' : 'checkoutRenterSignature', data)}
            onClear={() => handleExchangeFieldChange(isIn ? 'checkinRenterSignature' : 'checkoutRenterSignature', undefined)} />
          <SignatureBlock title="Company representative" signature={agentSign} disabled={!isEditable}
            onSave={data => handleExchangeFieldChange(isIn ? 'checkinAgentSignature' : 'checkoutAgentSignature', data)}
            onClear={() => handleExchangeFieldChange(isIn ? 'checkinAgentSignature' : 'checkoutAgentSignature', undefined)}>
            <div className="mb-3">{renderTextField('Representative name', agentName || '', val => handleExchangeFieldChange(isIn ? 'checkinAgentName' : 'checkoutAgentName', val), isEditable)}</div>
          </SignatureBlock>
        </div>
      </StepSection>
    </div>
  );
};

export default ExchangeStep;
