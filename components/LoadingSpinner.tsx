import React, { useEffect, useState } from 'react';
import { NCT_LOGIN_LOGO_B64 } from '../constants';

/** What is being prepared while the full-screen loader shows, in the order it happens. */
const STEPS = [
  'Securing your session',
  'Loading reservations and agreements',
  'Loading fleet and branches',
  'Preparing your dashboard',
];

const CSS = `
.ld-root{--ld-ink:#0b1222;--ld-night:#070b16;--ld-text:#e8edf7;--ld-muted:#93a1ba;--ld-accent:#6d7cff;--ld-accent2:#a5b4fc;--ld-line:rgba(148,163,184,.16);
  position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;overflow:hidden;
  background:radial-gradient(90% 60% at 50% 0%,rgba(109,124,255,.16),transparent 60%),radial-gradient(70% 50% at 50% 100%,rgba(52,211,153,.06),transparent 60%),var(--ld-ink);
  color:var(--ld-text);font-family:'Plus Jakarta Sans',system-ui,-apple-system,'Segoe UI',sans-serif;animation:ld-fade .35s ease-out both}
.ld-grid{position:absolute;inset:0;background-image:linear-gradient(var(--ld-line) 1px,transparent 1px),linear-gradient(90deg,var(--ld-line) 1px,transparent 1px);
  background-size:56px 56px;mask-image:radial-gradient(60% 50% at 50% 45%,#000 0%,transparent 75%);-webkit-mask-image:radial-gradient(60% 50% at 50% 45%,#000 0%,transparent 75%);opacity:.55}
.ld-card{position:relative;display:flex;flex-direction:column;align-items:center;text-align:center;padding:0 24px;width:100%;max-width:380px}
.ld-mark{position:relative;width:88px;height:88px;border-radius:21px;
  box-shadow:0 22px 50px -14px rgba(109,124,255,.6),0 0 0 1px rgba(255,255,255,.08)}
.ld-mark img{display:block;width:88px;height:88px;border-radius:21px}
.ld-ring{position:absolute;inset:-10px;border-radius:30px;border:1px solid rgba(165,180,252,.35);animation:ld-pulse 2.2s cubic-bezier(.4,0,.2,1) infinite}
.ld-ring.b{animation-delay:1.1s}
.ld-name{margin-top:26px;font-family:'Sora','Plus Jakarta Sans',system-ui,sans-serif;font-size:21px;font-weight:600;letter-spacing:-.01em}
.ld-bar{position:relative;margin-top:30px;width:220px;height:4px;border-radius:99px;background:rgba(148,163,184,.26);overflow:hidden}
.ld-bar i{position:absolute;top:0;bottom:0;width:40%;border-radius:99px;background:linear-gradient(90deg,transparent,var(--ld-accent2),var(--ld-accent),transparent);animation:ld-sweep 1.25s cubic-bezier(.45,0,.25,1) infinite}
.ld-step{margin-top:16px;height:20px;font-size:13.5px;font-weight:500;color:#c3cde0;display:flex;align-items:center;gap:8px}
.ld-step b{width:6px;height:6px;border-radius:50%;background:#34d399;box-shadow:0 0 0 3px rgba(52,211,153,.18)}
.ld-step span{animation:ld-rise .4s ease-out both}
.ld-foot{position:absolute;bottom:28px;left:0;right:0;text-align:center;font-size:11.5px;color:rgba(147,161,186,.75);letter-spacing:.02em}
.ld-foot svg{display:inline-block;vertical-align:-2px;margin-right:6px}
@keyframes ld-fade{from{opacity:0}to{opacity:1}}
@keyframes ld-pulse{0%{transform:scale(.92);opacity:.0}25%{opacity:.9}100%{transform:scale(1.22);opacity:0}}
@keyframes ld-sweep{0%{left:-40%}100%{left:100%}}
@keyframes ld-rise{from{opacity:.2;transform:translateY(3px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.ld-root,.ld-ring,.ld-bar i,.ld-step span{animation:none}.ld-ring{display:none}.ld-bar i{left:30%}}
`;

/**
 * Loading states.
 * - "page" (default): full screen while the system opens after sign-in, in the sign-in screen's style.
 * - "inline": a quiet indicator inside a screen while that screen's code loads.
 */
const LoadingSpinner: React.FC<{ variant?: 'page' | 'inline'; message?: string }> = ({ variant = 'page', message }) => {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (variant !== 'page' || message) return;
    const id = window.setInterval(() => setStep(s => Math.min(s + 1, STEPS.length - 1)), 1100);
    return () => window.clearInterval(id);
  }, [variant, message]);

  if (variant === 'inline') {
    return (
      <div className="flex items-center justify-center gap-3 py-16 text-slate-500" role="status" aria-live="polite">
        <span className="h-5 w-5 rounded-full border-2 border-slate-200 border-t-indigo-600 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        <span className="text-sm font-medium">{message || 'Loading…'}</span>
      </div>
    );
  }

  const text = message || STEPS[step];
  return (
    <div className="ld-root" role="status" aria-live="polite" aria-label={`Loading. ${text}`}>
      <style>{CSS}</style>
      <div className="ld-grid" aria-hidden="true" />
      <div className="ld-card">
        <div className="ld-mark" aria-hidden="true">
          <span className="ld-ring" /><span className="ld-ring b" />
          <img src={NCT_LOGIN_LOGO_B64} alt="" />
        </div>
        <div className="ld-name">NCT Rental</div>
        <div className="ld-bar" aria-hidden="true"><i /></div>
        <div className="ld-step"><b aria-hidden="true" /><span key={text}>{text}</span></div>
      </div>
      <div className="ld-foot" aria-hidden="true">
        <svg width="11" height="12" viewBox="0 0 11 12" fill="none"><rect x="1" y="5" width="9" height="6.5" rx="1.5" stroke="currentColor" /><path d="M3 5V3.5a2.5 2.5 0 015 0V5" stroke="currentColor" /></svg>
        Secure connection
      </div>
    </div>
  );
};

export default LoadingSpinner;
