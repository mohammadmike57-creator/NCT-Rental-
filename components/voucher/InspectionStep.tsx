import React from 'react';
import { CarView, DamageMarker, Reservation, ReturnCharges } from '../../types';
import { PdfIcon } from '../icons';
import { KmFieldProps } from './Fields';
import { Bi } from '../ui/Bi';
import { Button, labelCls } from '../ui/Crm';
import { PICKUP_TERMS_AR, RETURN_TERMS_AR } from '../../services/agreementDoc';
import ReturnChargesPanel from '../ReturnChargesPanel';
import { StepSection, FuelGauge, ChecklistGrid, DamageBoard, SignatureBlock, areaCls } from './AgreementParts';

/** Items checked when the car leaves and when it comes back. */
export const CHECKLIST_ITEMS = ["Spare Tire", "Jack & Tools", "Windows & Windshield", "Headlights", "Turn Signals", "AC / Heater", "Audio System", "Mirrors", "Interior Cleanliness"];

export const PICKUP_TERMS = "By signing, the Renter acknowledges receipt of the vehicle in the condition documented above and agrees to the rental terms and conditions. The Renter accepts financial responsibility for all charges, traffic violations, damages and losses during the rental period. The Company Representative confirms the vehicle's condition and rental details are accurate at pickup.";
export const RETURN_TERMS = "By signing, the Renter confirms the return of the vehicle. The final condition and any additional charges (such as fuel shortage or new damage) have been reviewed and accepted. The Company Representative confirms receipt of the vehicle and the accuracy of the return inspection.";

export type CheckSection = 'inspection' | 'fuel' | 'damage' | 'charges' | 'signatures';

export interface InspectionStepProps {
  mode: 'pickup' | 'dropoff';
  section: CheckSection;
  stepNo?: number;
  /** The booking as opened (for the renter's name). */
  reservation: Reservation;
  /** The agreement being edited. */
  localReservation: Reservation;
  isPickupEditable: boolean;
  isDropoffEditable: boolean;
  charges: ReturnCharges;
  setCharges: (c: ReturnCharges) => void;
  handleFieldChange: (field: keyof Reservation, value: any) => void;
  handleDamageMark: (e: React.MouseEvent<HTMLDivElement>, view: CarView) => void;
  removeDamageMarker: (index: number) => void;
  updateDamageMarker: (index: number, patch: Partial<DamageMarker>) => void;
  handlePreviewCharges: () => void;
  handleDownloadVoucherPDF: () => void;
  renderKmField: (props: KmFieldProps) => React.ReactNode;
  renderTextField: (label: string, value: string, onChange: (val: string) => void, isEditable: boolean, isEmail?: boolean) => React.ReactNode;
}

/** One section of the check-out / check-in inspection; the agreement workflow shows one at a time. */
const InspectionStep: React.FC<InspectionStepProps> = ({
  mode, section, stepNo, reservation, localReservation, isPickupEditable, isDropoffEditable, charges, setCharges,
  handleFieldChange, handleDamageMark, removeDamageMarker, updateDamageMarker, handlePreviewCharges, handleDownloadVoucherPDF,
  renderKmField, renderTextField,
}) => {
  const checklistItems = CHECKLIST_ITEMS;
  const isEditable = mode === 'pickup' ? isPickupEditable : isDropoffEditable;
  const checklist = localReservation[mode === 'pickup' ? 'pickupChecklist' : 'dropOffChecklist'] || {};
  const damageMarkers = localReservation[mode === 'pickup' ? 'pickupDamageMarkers' : 'dropOffDamageMarkers'] || [];
  const fuelLevel = localReservation[mode === 'pickup' ? 'pickupFuelLevel' : 'dropOffFuelLevel'];
  const renterSign = localReservation[mode === 'pickup' ? 'pickupRenterSignature' : 'dropOffRenterSignature'];
  const agentSign = localReservation[mode === 'pickup' ? 'pickupAgentSignature' : 'dropOffAgentSignature'];
  const agentName = localReservation[mode === 'pickup' ? 'pickupAgentName' : 'dropOffAgentName'];
  const isPickup = mode === 'pickup';

  switch (section) {
    case 'inspection':
      return (
        <StepSection step={stepNo} title={isPickup ? 'Vehicle inspection' : 'Return inspection'} subtitle={isPickup ? 'Confirm each item before handing over the keys' : 'Compare with the condition at pickup'}>
          <ChecklistGrid
            items={checklistItems}
            checked={checklist}
            onToggle={(item, v) => handleFieldChange(isPickup ? 'pickupChecklist' : 'dropOffChecklist', { ...checklist, [item]: v })}
            disabled={!isEditable}
            compareWith={isPickup ? undefined : localReservation.pickupChecklist || {}}
          />
        </StepSection>
      );
    case 'fuel':
      return (
        <StepSection step={stepNo} title="Fuel & mileage" subtitle={isPickup ? 'Readings when the car leaves' : 'Readings when the car comes back'}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <FuelGauge
              level={fuelLevel}
              onLevelChange={level => handleFieldChange(isPickup ? 'pickupFuelLevel' : 'dropOffFuelLevel', level)}
              disabled={!isEditable}
              pickupLevel={isPickup ? undefined : localReservation.pickupFuelLevel}
            />
            {renderKmField({ label: isPickup ? 'Odometer out' : 'Odometer in', value: isPickup ? localReservation.pickupKmOut : localReservation.dropOffKmIn, onChange: v => handleFieldChange(isPickup ? 'pickupKmOut' : 'dropOffKmIn', v), editable: isEditable, reference: isPickup ? undefined : localReservation.pickupKmOut, referenceLabel: isPickup ? undefined : 'Out', placeholder: isPickup ? 'Starting reading' : 'Returning reading' })}
          </div>
        </StepSection>
      );
    case 'damage':
      return (
        <StepSection step={stepNo} title="Damage report" subtitle={isPickup ? 'Mark existing scratches, dents and chips' : 'Mark any damage that was not there at pickup'}>
          <DamageBoard
            markers={damageMarkers}
            priorMarkers={isPickup ? undefined : localReservation.pickupDamageMarkers || []}
            editable={isEditable}
            onMark={handleDamageMark}
            onRemove={removeDamageMarker}
            onUpdate={updateDamageMarker}
          />
        </StepSection>
      );
    case 'charges':
      return (
        <StepSection step={stepNo} title="Damages, traffic tickets & charges" subtitle="Photograph new damage, add tickets and other charges, then settle or claim">
          <ReturnChargesPanel
            charges={charges}
            onChange={setCharges}
            editable={isEditable}
            markers={localReservation.dropOffDamageMarkers || []}
            customerName={reservation.personName}
            onPreview={handlePreviewCharges}
          />
        </StepSection>
      );
    case 'signatures':
      return (
        <div className="space-y-4">
          <StepSection title="Notes">
            {isPickup ? (
              <textarea
                value={localReservation.pickupNotes || ''}
                onChange={e => handleFieldChange('pickupNotes', e.target.value)}
                disabled={!isPickupEditable}
                rows={3}
                className={areaCls}
                placeholder="Vehicle condition, customer requests, anything the return team should know"
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className={labelCls}><Bi en="From pickup" /></p>
                  <p className="min-h-[84px] px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-[13px] text-slate-700 whitespace-pre-wrap">{localReservation.pickupNotes || 'No notes from pickup.'}</p>
                </div>
                <div>
                  <label className={labelCls}><Bi en="Return notes" /></label>
                  <textarea
                    value={localReservation.dropOffNotes || ''}
                    onChange={e => handleFieldChange('dropOffNotes', e.target.value)}
                    disabled={!isDropoffEditable}
                    rows={3}
                    className={areaCls}
                    placeholder="Return condition, extra charges, etc."
                  />
                </div>
              </div>
            )}
          </StepSection>

          <StepSection step={stepNo} title={isPickup ? 'Agreement & signatures' : 'Return confirmation'} subtitle="Sign on screen, or print the agreement and sign it by hand">
            {(() => {
              const paperKey = isPickup ? 'pickupSignOnPaper' : 'dropOffSignOnPaper';
              const onPaper = !!localReservation[paperKey];
              return (
                <div className={`mb-4 rounded-lg border p-3 flex flex-wrap items-center gap-3 ${onPaper ? 'border-sky-200 bg-sky-50' : 'border-slate-200 bg-white'}`}>
                  <label className={`flex items-start gap-3 flex-1 min-w-[240px] ${isEditable ? 'cursor-pointer' : ''}`}>
                    <input type="checkbox" className="mt-0.5" checked={onPaper} disabled={!isEditable} onChange={e => handleFieldChange(paperKey, e.target.checked || undefined)} />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold text-slate-900">Sign on the printed agreement</span>
                      <span className="block text-xs text-slate-500">The customer and the representative sign the paper copy by hand. On-screen signatures become optional; the print keeps blank signature lines.</span>
                    </span>
                  </label>
                  <Button size="sm" onClick={handleDownloadVoucherPDF} icon={<PdfIcon className="w-4 h-4" />}>Print agreement</Button>
                </div>
              );
            })()}
            <div className="text-xs leading-relaxed text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-3 mb-4 space-y-2"><p>{isPickup ? PICKUP_TERMS : RETURN_TERMS}</p><p lang="ar" dir="rtl" className="ar-ui !font-normal !text-slate-700 !text-[13px] leading-6 pt-2 border-t border-slate-200">{isPickup ? PICKUP_TERMS_AR : RETURN_TERMS_AR}</p></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SignatureBlock
                title="Renter"
                subtitle={reservation.personName}
                signature={renterSign}
                onSave={data => handleFieldChange(isPickup ? 'pickupRenterSignature' : 'dropOffRenterSignature', data)}
                onClear={() => handleFieldChange(isPickup ? 'pickupRenterSignature' : 'dropOffRenterSignature', undefined)}
                disabled={!isEditable}
                onPaper={!!localReservation[isPickup ? 'pickupSignOnPaper' : 'dropOffSignOnPaper']}
              />
              <SignatureBlock
                title="Company representative"
                signature={agentSign}
                onSave={data => handleFieldChange(isPickup ? 'pickupAgentSignature' : 'dropOffAgentSignature', data)}
                onClear={() => handleFieldChange(isPickup ? 'pickupAgentSignature' : 'dropOffAgentSignature', undefined)}
                disabled={!isEditable}
                onPaper={!!localReservation[isPickup ? 'pickupSignOnPaper' : 'dropOffSignOnPaper']}
              >
                <div className="mb-3">
                  {renderTextField('Representative name', agentName || '', val => handleFieldChange(isPickup ? 'pickupAgentName' : 'dropOffAgentName', val), isEditable)}
                </div>
              </SignatureBlock>
            </div>
          </StepSection>
        </div>
      );
  }
  return null;
};

export default InspectionStep;
