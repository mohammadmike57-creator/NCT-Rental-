/**
 * Standard rental terms printed on page 2 of the rental agreement when the
 * company has not entered its own text (Company Details → Rental agreement terms).
 *
 * Format: one clause per paragraph, separated by a blank line. The first line
 * of each paragraph is the clause title.
 */
export const DEFAULT_AGREEMENT_TERMS = `Definitions
"Company" means the rental company named on the front of this agreement. "Renter" means the person who signs this agreement. "Authorised driver" means the Renter and any additional driver named on the agreement. "Vehicle" means the vehicle described on the agreement, including its keys, tyres, tools, documents and accessories.

Drivers
The Vehicle may only be driven by an authorised driver who holds a full driving licence that has been valid for at least one year and remains valid for the whole rental. The Company may refuse a rental if documents cannot be produced or verified. Additional drivers must be registered at the counter before they drive.

Rental period and return
The Vehicle must be returned to the agreed branch on the date and at the time shown on the agreement, in the same condition in which it was received apart from normal wear. A grace period of up to two hours applies; after that an additional rental day may be charged. Extensions must be agreed with the Company before the return time. If the Vehicle is not returned and no extension has been agreed, the Company may treat it as unlawfully retained.

Use of the vehicle
The Vehicle must not be used to carry passengers or goods for hire, to tow or push any vehicle, in races, rallies or tests, off paved roads, to commit any offence, by a driver under the influence of alcohol or drugs, or outside the country without the Company's written consent. Smoking and pets are not permitted in the Vehicle unless agreed. The Renter must keep the Vehicle locked when unattended and keep the keys and documents safe.

Fuel and mileage
The Vehicle is supplied with the fuel level recorded at check-out and must be returned with the same level. Any shortage is charged at the Company's refuelling rate. Mileage is recorded at check-out and at return; any mileage limit shown on the agreement applies.

Condition, damage and loss
The Vehicle's condition at check-out and at return is recorded on the agreement and its damage diagram. The Renter is responsible for loss of, or damage to, the Vehicle during the rental, up to the excess shown on the agreement where cover applies, and in full where cover does not apply or is invalidated by a breach of these terms. Damage to tyres, glass, the underside and the interior, and loss of keys or documents, may not be covered.

Accidents, breakdown and theft
In case of accident, theft or damage the Renter must inform the Company and the police immediately, obtain a police report, and not admit liability to third parties. Repairs may only be carried out with the Company's authorisation. The Company will provide a replacement vehicle where reasonably possible if a breakdown is not caused by the Renter.

Traffic fines and tolls
The Renter is responsible for all traffic and parking fines, tolls and penalties incurred during the rental. The Company may pay such amounts on the Renter's behalf and charge them, together with a reasonable administration fee, to the Renter after the rental has ended.

Charges, deposit and payment
The Renter agrees to pay the rental charges, extras, fuel, damage, fines and any other amounts due under this agreement. The security deposit shown on the agreement is held during the rental and released after the return inspection, less any amounts due. Amounts found after return (for example fines) may be charged later using the payment details provided.

Personal belongings and data
The Company is not responsible for property left in the Vehicle. Personal data is used to manage the rental, to meet legal obligations and to recover amounts due, and is kept only as long as necessary.

General
This agreement, together with the condition record and any invoices issued under it, is the entire agreement between the Company and the Renter for this rental. If any term is found invalid the remaining terms still apply. This agreement is governed by the laws of the country in which the Vehicle was rented.`;

export interface TermsClause { title: string; body: string }

export function parseTerms(text?: string): TermsClause[] {
  const source = (text && text.trim()) ? text : DEFAULT_AGREEMENT_TERMS;
  return source
    .split(/\n\s*\n/)
    .map(block => block.trim())
    .filter(Boolean)
    .map(block => {
      const [first, ...rest] = block.split('\n');
      return rest.length ? { title: first.trim(), body: rest.join(' ').trim() } : { title: '', body: first.trim() };
    });
}
