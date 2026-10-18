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

/** Arabic version of the standard terms, printed beside the English text. Same format. */
export const DEFAULT_AGREEMENT_TERMS_AR = `التعريفات
"الشركة" هي شركة التأجير المذكورة على الصفحة الأولى من هذا العقد. "المستأجر" هو الشخص الموقّع على هذا العقد. "السائق المفوّض" هو المستأجر وأي سائق إضافي مُسجّل في العقد. "المركبة" هي المركبة الموصوفة في العقد بما في ذلك مفاتيحها وإطاراتها وأدواتها ووثائقها وملحقاتها.

السائقون
لا يجوز قيادة المركبة إلا من قِبل سائق مفوّض يحمل رخصة قيادة سارية المفعول منذ سنة على الأقل وتبقى سارية طوال مدة الإيجار. يحق للشركة رفض التأجير إذا تعذّر تقديم الوثائق أو التحقق منها. ويجب تسجيل السائقين الإضافيين لدى مكتب التأجير قبل قيادتهم المركبة.

مدة الإيجار والإرجاع
يجب إرجاع المركبة إلى الفرع المتفق عليه في التاريخ والوقت المحددين في العقد وبالحالة التي استُلمت بها باستثناء الاستهلاك الطبيعي. تُمنح فترة سماح لا تتجاوز ساعتين، ويجوز بعدها احتساب يوم إيجار إضافي. ويجب الاتفاق مع الشركة على أي تمديد قبل موعد الإرجاع، وإذا لم تُرجع المركبة دون الاتفاق على تمديد، يحق للشركة اعتبارها محتجزة بصورة غير مشروعة.

استخدام المركبة
يُحظر استخدام المركبة لنقل الركاب أو البضائع بالأجرة، أو لقطر أو دفع أي مركبة، أو في السباقات والاختبارات، أو خارج الطرق المعبّدة، أو لارتكاب أي مخالفة، أو من قِبل سائق تحت تأثير الكحول أو المخدرات، أو خارج البلاد دون موافقة خطية من الشركة. ولا يُسمح بالتدخين أو اصطحاب الحيوانات الأليفة إلا بموافقة الشركة، وعلى المستأجر إقفال المركبة عند تركها والمحافظة على مفاتيحها ووثائقها.

الوقود والمسافة
تُسلَّم المركبة بمستوى الوقود المسجّل عند التسليم ويجب إرجاعها بالمستوى نفسه، ويُحتسب أي نقص وفق تعرفة التزويد لدى الشركة. وتُسجَّل قراءة العداد عند التسليم والإرجاع، ويُطبَّق أي حد للمسافة مذكور في العقد.

الحالة والأضرار والفقدان
تُوثَّق حالة المركبة عند التسليم والإرجاع في العقد ومخطط الأضرار. ويتحمّل المستأجر مسؤولية فقدان المركبة أو تضررها خلال مدة الإيجار حتى قيمة مبلغ التحمّل المذكور في العقد في حال وجود تغطية، وبالكامل في حال عدم وجود تغطية أو بطلانها بسبب مخالفة هذه الشروط. وقد لا تشمل التغطية أضرار الإطارات والزجاج وأسفل المركبة والمقصورة الداخلية وفقدان المفاتيح أو الوثائق.

الحوادث والأعطال والسرقة
في حال وقوع حادث أو سرقة أو ضرر، يجب على المستأجر إبلاغ الشركة والشرطة فوراً والحصول على تقرير من الشرطة وعدم الإقرار بالمسؤولية تجاه الغير. ولا يجوز إجراء أي إصلاح إلا بموافقة الشركة. وتوفّر الشركة مركبة بديلة قدر الإمكان إذا لم يكن العطل ناتجاً عن المستأجر.

المخالفات المرورية والرسوم
يتحمّل المستأجر جميع المخالفات المرورية ومخالفات الوقوف والرسوم والغرامات المترتبة خلال مدة الإيجار. ويحق للشركة دفعها نيابةً عنه وتحصيلها منه مع رسوم إدارية معقولة بعد انتهاء الإيجار.

الرسوم والتأمين والدفع
يوافق المستأجر على دفع رسوم الإيجار والإضافات والوقود والأضرار والمخالفات وأي مبالغ أخرى مستحقة بموجب هذا العقد. ويُحتجز مبلغ التأمين المذكور في العقد طوال مدة الإيجار ويُفرج عنه بعد فحص الإرجاع مخصوماً منه أي مبالغ مستحقة. ويجوز تحصيل المبالغ التي تظهر بعد الإرجاع (كالمخالفات) لاحقاً باستخدام بيانات الدفع المقدّمة.

المقتنيات الشخصية والبيانات
لا تتحمّل الشركة مسؤولية أي مقتنيات تُترك في المركبة. وتُستخدم البيانات الشخصية لإدارة الإيجار والوفاء بالالتزامات القانونية وتحصيل المبالغ المستحقة، ولا يُحتفظ بها إلا للمدة اللازمة.

أحكام عامة
يُشكّل هذا العقد مع محضر حالة المركبة وأي فواتير صادرة بموجبه كامل الاتفاق بين الشركة والمستأجر بشأن هذا الإيجار. وإذا تبيّن بطلان أي بند تبقى سائر البنود نافذة. ويخضع هذا العقد لقوانين الدولة التي استؤجرت فيها المركبة.`;

export function parseTermsAr(text?: string): TermsClause[] {
  return parseTerms((text && text.trim()) ? text : DEFAULT_AGREEMENT_TERMS_AR);
}
