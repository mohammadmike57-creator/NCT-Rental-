import React, { useRef, useState } from 'react';
import { CompanyDetails } from '../types';
import { mediaUrl, uploadImage } from '../services/api';
import { BRAND_PRESETS, brandColor, initialsOf, isPrimarySupplier } from '../services/brand';
import { compressImage } from '../services/imageCompress';
import { Button, Field, inputCls } from './ui/Crm';

/**
 * Company Details → Branding: the logo, main colour and sign-in line people of this company see, and that print on
 * agreements, invoices, receipts and emails.
 */
const BrandingPanel: React.FC<{ value: CompanyDetails; onChange: (field: keyof CompanyDetails, v: string) => void; supplierCode?: string }> = ({ value, onChange, supplierCode }) => {
  const file = useRef<HTMLInputElement>(null);
  const linkRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const color = brandColor(value);
  const logo = mediaUrl(value.logoUrl);
  const link = supplierCode && !isPrimarySupplier() ? `${window.location.origin}/s/${supplierCode}` : '';

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setError('');
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(f.type)) { setError('Use a PNG, JPEG or WebP image.'); return; }
    setBusy(true);
    try {
      // Small PNG/WebP logos keep their transparency; large photos are made smaller first.
      const dataUrl = f.size <= 600_000 && f.type !== 'image/jpeg'
        ? await new Promise<string>((ok, fail) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = fail; r.readAsDataURL(f); })
        : await compressImage(f, 800, 0.85);
      onChange('logoUrl', await uploadImage(dataUrl));
    } catch {
      setError('The logo could not be uploaded. Try a smaller image.');
    } finally {
      setBusy(false);
      if (file.current) file.current.value = '';
    }
  };

  return (
    <div className="p-4 space-y-5" data-testid="branding-panel">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="space-y-4">
          <Field label="Logo" hint="PNG with a transparent background works best. Shown in the menu and on agreements, invoices and receipts.">
            <div className="flex items-center gap-3">
              <span className="w-20 h-14 rounded-lg border border-slate-200 bg-white inline-flex items-center justify-center overflow-hidden">
                {logo ? <img src={logo} alt="Logo" className="max-w-[72px] max-h-12 object-contain" />
                  : <span className="text-[11px] text-slate-400 text-center px-1">{isPrimarySupplier() ? 'Standard logo' : 'No logo'}</span>}
              </span>
              <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e => pick(e.target.files?.[0])} data-testid="logo-input" />
              <Button size="sm" onClick={() => file.current?.click()} disabled={busy}>{busy ? 'Uploading…' : logo ? 'Replace' : 'Upload logo'}</Button>
              {logo && <Button size="sm" variant="ghost" onClick={() => onChange('logoUrl', '')}>Remove</Button>}
            </div>
            {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
          </Field>
          <Field label="Main colour" hint="Used for your initials badge and your sign-in page.">
            <div className="flex flex-wrap items-center gap-2">
              {BRAND_PRESETS.map(c => (
                <button key={c} type="button" onClick={() => onChange('brandColor', c)} aria-label={`Colour ${c}`} title={c}
                  className={`w-7 h-7 rounded-full ring-offset-2 ${color.toLowerCase() === c ? 'ring-2 ring-slate-900' : 'hover:ring-2 hover:ring-slate-300'}`} style={{ background: c }} />
              ))}
              <input className={`${inputCls} !w-28 font-mono`} value={value.brandColor || ''} placeholder="#4f46e5" maxLength={7}
                onChange={e => onChange('brandColor', e.target.value.trim())} aria-label="Colour code" />
            </div>
          </Field>
          <Field label="Sign-in line" hint="One short line under your name on your sign-in page.">
            <input className={inputCls} value={value.signInTagline || ''} maxLength={90} placeholder="e.g. Staff sign-in · Amman and Aqaba"
              onChange={e => onChange('signInTagline', e.target.value)} />
          </Field>
        </div>

        {/* Preview of the sign-in page */}
        <div>
          <p className="text-[13px] font-medium text-slate-700 mb-1">Preview</p>
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="h-1.5" style={{ background: color }} />
            <div className="p-5 bg-slate-50">
              <div className="max-w-[280px] mx-auto bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                <div className="flex items-center gap-2.5">
                  {logo ? <img src={logo} alt="" className="h-8 max-w-[96px] object-contain" />
                    : <span className="w-8 h-8 rounded-lg inline-flex items-center justify-center text-white text-[11px] font-bold" style={{ background: color }}>{initialsOf(value.name || '')}</span>}
                  <span className="text-[13px] font-semibold text-slate-900 truncate">{value.name || 'Your company'}</span>
                </div>
                <p className="mt-3 text-[15px] font-semibold text-slate-900">Welcome back</p>
                <p className="text-[11.5px] text-slate-500">{value.signInTagline || 'Sign in to your staff account'}</p>
                <div className="mt-3 h-7 rounded-md border border-slate-200" /><div className="mt-2 h-7 rounded-md border border-slate-200" />
                <div className="mt-3 h-8 rounded-md text-white text-[12px] font-semibold inline-flex w-full items-center justify-center" style={{ background: color }}>Sign in</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {link && (
        <Field label="Your sign-in link" hint="Share it with your staff: it opens the sign-in page with your logo and colour.">
          <div className="flex gap-2">
            <input ref={linkRef} readOnly value={link} className={`${inputCls} font-mono`} onFocus={e => e.currentTarget.select()} data-testid="branded-link" />
            <Button size="sm" onClick={async () => { try { await navigator.clipboard.writeText(link); setCopied(true); } catch { linkRef.current?.select(); } }}>{copied ? 'Copied' : 'Copy'}</Button>
          </div>
        </Field>
      )}
    </div>
  );
};

export default BrandingPanel;
