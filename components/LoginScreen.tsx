import React, { useEffect, useRef, useState } from 'react';
import { User } from '../types';
import { signInUser } from '../firebase/api';
import { NCT_LOGIN_LOGO_B64 } from '../constants';

interface LoginScreenProps {
  users: User[];
}

/**
 * "Night drive" scene: Amman skyline at dusk, a road whose centre lines flow toward the viewer,
 * roadside posts and the lights of other cars. `speed` eases toward `target`; signing in sets the
 * target higher so the road speeds up. Draws one still frame when the user prefers reduced motion.
 */
function useNightDrive(canvas: React.RefObject<HTMLCanvasElement>, target: React.MutableRefObject<number>) {
  useEffect(() => {
    const cv = canvas.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let W = 0, H = 0, t = 0, speed = 1, raf = 0;
    const size = () => {
      const r = cv.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      W = r.width; H = r.height; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    size();
    window.addEventListener('resize', size);
    const lights = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random() * 0.1, r: Math.random() * 1.4 + 0.3, a: Math.random() * 0.6 + 0.2, tw: Math.random() * 6 }));
    const towers = Array.from({ length: 34 }, (_, i) => ({ x: i / 34 + Math.random() * 0.01, w: 0.012 + Math.random() * 0.02, h: 0.03 + Math.random() * 0.09 }));
    const traffic = Array.from({ length: 5 }, (_, i) => ({ z: Math.random(), lane: i % 2 ? 1 : -1, v: 0.0012 + Math.random() * 0.0016 }));

    const frame = () => {
      t += 1; speed += (target.current - speed) * 0.04;
      const hz = H * 0.46, cx = W * 0.52;
      let g = ctx.createLinearGradient(0, 0, 0, hz);
      g.addColorStop(0, '#060914'); g.addColorStop(0.7, '#121a3a'); g.addColorStop(1, '#3a2a4a');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, hz);
      let rg = ctx.createRadialGradient(cx, hz, 0, cx, hz, W * 0.6);
      rg.addColorStop(0, 'rgba(255,181,71,.28)'); rg.addColorStop(1, 'rgba(255,181,71,0)');
      ctx.fillStyle = rg; ctx.fillRect(0, 0, W, hz + 4);
      ctx.fillStyle = '#0a0f22';
      towers.forEach(k => ctx.fillRect(k.x * W, hz - k.h * H, k.w * W, k.h * H + 1));
      lights.forEach(l => {
        const a = l.a * (0.6 + 0.4 * Math.sin(t / 40 + l.tw));
        ctx.fillStyle = `rgba(255,214,150,${a})`; ctx.beginPath(); ctx.arc(l.x * W, hz - l.y * H - 4, l.r, 0, 7); ctx.fill();
      });
      g = ctx.createLinearGradient(0, hz, 0, H); g.addColorStop(0, '#0b1020'); g.addColorStop(1, '#05070e');
      ctx.fillStyle = g; ctx.fillRect(0, hz, W, H - hz);
      const roadTop = 8, roadBottom = W * 0.9;
      ctx.fillStyle = '#10162a';
      ctx.beginPath(); ctx.moveTo(cx - roadTop, hz); ctx.lineTo(cx + roadTop, hz); ctx.lineTo(cx + roadBottom, H); ctx.lineTo(cx - roadBottom, H); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(232,237,247,.35)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx - roadTop * 0.9, hz); ctx.lineTo(cx - roadBottom * 0.92, H); ctx.moveTo(cx + roadTop * 0.9, hz); ctx.lineTo(cx + roadBottom * 0.92, H); ctx.stroke();
      const off = (t * 0.012 * speed) % 1;
      const py = (z: number) => hz + (H - hz) * Math.pow(z, 2.2);
      for (let i = 0; i < 14; i++) {
        const z1 = (i + off) / 14, z2 = Math.min(1, z1 + 0.028);
        const w1 = 1 + 9 * Math.pow(z1, 2.2), w2 = 1 + 9 * Math.pow(z2, 2.2);
        ctx.fillStyle = `rgba(255,181,71,${0.25 + 0.6 * z1})`;
        ctx.beginPath(); ctx.moveTo(cx - w1 / 2, py(z1)); ctx.lineTo(cx + w1 / 2, py(z1)); ctx.lineTo(cx + w2 / 2, py(z2)); ctx.lineTo(cx - w2 / 2, py(z2)); ctx.closePath(); ctx.fill();
      }
      for (let i = 0; i < 10; i++) {
        const z = ((i + off * 2) / 10) % 1, e = Math.pow(z, 2.2), y = hz + (H - hz) * e, x = roadTop + (roadBottom * 1.05 - roadTop) * e, h = 4 + 40 * e;
        ctx.fillStyle = `rgba(148,163,184,${0.15 + 0.5 * z})`;
        ctx.fillRect(cx - x - 3 * e, y - h, 2 + 3 * e, h); ctx.fillRect(cx + x, y - h, 2 + 3 * e, h);
        ctx.fillStyle = `rgba(255,77,94,${0.4 + 0.5 * z})`; ctx.fillRect(cx - x - 3 * e, y - h, 2 + 3 * e, 2 + 2 * e);
      }
      traffic.forEach(c => {
        c.z += c.lane > 0 ? c.v * speed : -c.v * 0.6;
        if (c.z > 1) c.z = 0; if (c.z < 0) c.z = 1;
        const e = Math.pow(c.z, 2.2), y = hz + (H - hz) * e, half = roadTop + (roadBottom - roadTop) * e, x = cx + c.lane * half * 0.45, s = 1 + 7 * e;
        const col = c.lane > 0 ? '255,214,150' : '255,77,94';
        [-1, 1].forEach(sd => {
          const gx = x + sd * s * 2.2;
          const gg = ctx.createRadialGradient(gx, y, 0, gx, y, s * 4); gg.addColorStop(0, `rgba(${col},.9)`); gg.addColorStop(1, `rgba(${col},0)`);
          ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(gx, y, s * 4, 0, 7); ctx.fill();
        });
      });
      rg = ctx.createRadialGradient(cx, H * 0.55, H * 0.2, cx, H * 0.55, W * 0.8);
      rg.addColorStop(0, 'rgba(0,0,0,0)'); rg.addColorStop(1, 'rgba(0,0,0,.55)');
      ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
      if (!reduce) raf = requestAnimationFrame(frame);
    };
    frame();
    const still = reduce ? window.setInterval(() => { t += 30; frame(); }, 2000) : 0;
    return () => { cancelAnimationFrame(raf); window.clearInterval(still); window.removeEventListener('resize', size); };
  }, [canvas, target]);
}

const LoginScreen: React.FC<LoginScreenProps> = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [welcomeName, setWelcomeName] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState(0);
  const [clock, setClock] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const speedTarget = useRef(1);
  useNightDrive(canvasRef, speedTarget);

  useEffect(() => {
    const tick = () => {
      try { setClock(new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Amman' })); }
      catch { setClock(new Date().toLocaleTimeString('en-GB')); }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  const fail = (msg: string) => { setError(msg); setErrorKey(k => k + 1); speedTarget.current = 1; };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const enteredInput = username.trim();
    if (!enteredInput || !password) { fail('Enter your username or email and your password.'); return; }
    setIsLoading(true);
    speedTarget.current = 6;
    try {
      // The server accepts either email or username and checks the account is active.
      await signInUser(enteredInput, password);
      let name = '';
      try { name = (JSON.parse(localStorage.getItem('user') || '{}').fullName || '').split(' ')[0]; } catch { /* name is optional */ }
      setWelcomeName(name);
      window.setTimeout(() => window.location.reload(), 1300);
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 403) fail(typeof err.response.data === 'string' ? err.response.data : 'This account has been disabled.');
      else if (!err?.response) fail('Cannot reach the server. Check your connection and try again.');
      else fail('Invalid username/email or password.');
      setIsLoading(false);
    }
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => setCapsLock(!!e.getModifierState && e.getModifierState('CapsLock'));
  const done = welcomeName !== null;

  return (
    <div className="lg-root">
      <style>{LOGIN_CSS}</style>
      <section className="lg-scene" aria-hidden="true">
        <canvas ref={canvasRef} />
        <div className="lg-brand lg-in lg-d1">
          <img src={NCT_LOGIN_LOGO_B64} alt="" />
          <div><div className="lg-brand-name">NCT Rental</div><div className="lg-brand-sub">UR-Drive Jordan</div></div>
        </div>
        <div className="lg-hero">
          <h1 className="lg-in lg-d2">Every rental, <em>from counter to return.</em></h1>
          <div className="lg-ticker lg-in lg-d4">
            <span><i />All systems running</span>
            <span>Amman <b className="lg-clock">{clock}</b></span>
            <span>Queen Alia Airport · City Center · Hotel Kiosk</span>
          </div>
        </div>
      </section>

      <section className="lg-side">
        <form className="lg-card" onSubmit={handleSubmit} noValidate>
          <h2 className="lg-in lg-d3">Welcome back</h2>
          <p className="lg-lead lg-in lg-d4">Sign in to your staff account</p>

          <div className="lg-field lg-in lg-d5">
            <input id="username-input" name="username" type="text" placeholder=" " autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false}
              value={username} onChange={e => setUsername(e.target.value)} onKeyUp={onKey} onKeyDown={onKey} disabled={isLoading || done} />
            <label htmlFor="username-input">Username or email</label>
          </div>
          <div className="lg-field lg-in lg-d6">
            <input id="password-input" name="password" type={showPassword ? 'text' : 'password'} placeholder=" " autoComplete="current-password"
              value={password} onChange={e => setPassword(e.target.value)} onKeyUp={onKey} onKeyDown={onKey} disabled={isLoading || done} />
            <label htmlFor="password-input">Password</label>
            <button type="button" className="lg-eye" onClick={() => setShowPassword(s => !s)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
              {showPassword
                ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6" /></svg>
                : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>}
            </button>
          </div>

          {capsLock && <p className="lg-caps">Caps Lock is on</p>}
          {error && <p key={errorKey} className="lg-err" role="alert">{error}</p>}

          <button className={`lg-btn lg-in lg-d7 ${isLoading && !done ? 'busy' : ''} ${done ? 'done' : ''}`} type="submit" disabled={isLoading || done}>
            <span>{done ? 'Signed in' : isLoading ? 'Signing in…' : 'Sign in'}</span>
            <span className="lg-fill" />
          </button>

          <p className="lg-help lg-in lg-d8">Forgot your password? Ask your administrator to reset it.</p>
          <div className="lg-secure lg-in lg-d8">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
            Encrypted connection · Staff access only
          </div>
        </form>

        <div className={`lg-welcome ${done ? 'show' : ''}`} aria-live="polite">
          <div>
            <svg className="lg-tick" viewBox="0 0 64 64"><circle cx="32" cy="32" r="29" /><path d="M20 33 L28 41 L45 24" /></svg>
            <h3>{welcomeName ? `Welcome, ${welcomeName}` : 'Welcome back'}</h3>
            <p>Opening today's counter…</p>
          </div>
        </div>
      </section>
    </div>
  );
};

const LOGIN_CSS = `
.lg-root { --lg-night:#070b16; --lg-ink:#0b1222; --lg-line:rgba(148,163,184,.16); --lg-text:#e8edf7; --lg-muted:#93a1ba; --lg-accent:#6d7cff; --lg-amber:#ffb547; --lg-ok:#34d399;
  --lg-display:'Sora','Plus Jakarta Sans',system-ui,sans-serif; --lg-body:'Plus Jakarta Sans',system-ui,-apple-system,'Segoe UI',sans-serif; --lg-mono:'JetBrains Mono',ui-monospace,Consolas,monospace;
  position:fixed; inset:0; display:grid; grid-template-columns:minmax(0,1.35fr) minmax(360px,1fr); background:var(--lg-ink); color:var(--lg-text); font:15px/1.5 var(--lg-body);
  -webkit-font-smoothing:antialiased; overflow-y:auto; color-scheme:dark; }
.lg-root :focus-visible { outline:2px solid var(--lg-amber); outline-offset:2px; }
.lg-scene { position:relative; overflow:hidden; background:var(--lg-night); min-height:100%; }
.lg-scene canvas { position:absolute; inset:0; width:100%; height:100%; display:block; }
.lg-brand { position:absolute; top:max(32px, env(safe-area-inset-top)); left:clamp(20px,5vw,64px); display:flex; align-items:center; gap:12px; }
.lg-brand img { width:44px; height:44px; border-radius:12px; background:rgba(255,255,255,.08); padding:5px; box-shadow:0 0 0 1px rgba(255,255,255,.12); }
.lg-brand-name { font:700 18px/1.1 var(--lg-display); letter-spacing:.02em; }
.lg-brand-sub { font-size:12px; color:var(--lg-muted); }
.lg-hero { position:absolute; inset:auto 0 0 0; padding:90px clamp(20px,5vw,64px) 44px; background:linear-gradient(to top, rgba(7,11,22,.96) 0%, rgba(7,11,22,.88) 55%, rgba(7,11,22,0) 100%); }
.lg-hero h1 { margin:0; font:600 clamp(28px,3.6vw,46px)/1.08 var(--lg-display); letter-spacing:-.02em; text-wrap:balance; max-width:15ch; color:var(--lg-text); }
.lg-hero h1 em { font-style:normal; color:var(--lg-amber); }
.lg-ticker { margin-top:22px; display:flex; flex-wrap:wrap; gap:8px 22px; font-size:12.5px; color:var(--lg-muted); }
.lg-ticker span { display:inline-flex; align-items:center; gap:8px; }
.lg-ticker i { width:7px; height:7px; border-radius:50%; background:var(--lg-ok); box-shadow:0 0 0 4px rgba(52,211,153,.15); }
.lg-clock { font:500 13px var(--lg-mono); color:var(--lg-text); letter-spacing:.04em; }
.lg-side { position:relative; display:flex; align-items:center; justify-content:center; padding:48px max(24px,env(safe-area-inset-right)) max(48px,env(safe-area-inset-bottom)) max(24px,env(safe-area-inset-left));
  background:radial-gradient(120% 70% at 100% 0%, rgba(109,124,255,.12), transparent 60%), var(--lg-ink); }
.lg-card { width:100%; max-width:400px; }
.lg-card h2 { margin:0 0 4px; font:600 26px/1.2 var(--lg-display); letter-spacing:-.01em; color:var(--lg-text); }
.lg-lead { margin:0 0 28px; color:var(--lg-muted); }
.lg-field { position:relative; margin-bottom:16px; }
.lg-field input { width:100%; height:56px; padding:22px 48px 6px 16px; border-radius:14px; border:1px solid var(--lg-line); background:rgba(15,23,42,.8); color:var(--lg-text);
  font:500 16px var(--lg-body); transition:border-color .25s, box-shadow .25s, background .25s; }
.lg-field input:-webkit-autofill { -webkit-text-fill-color:var(--lg-text); -webkit-box-shadow:0 0 0 40px #111a31 inset; caret-color:var(--lg-text); }
.lg-field label { position:absolute; left:16px; top:18px; color:var(--lg-muted); font-size:15px; pointer-events:none; transform-origin:left top; transition:transform .22s cubic-bezier(.2,.8,.2,1), color .22s; }
.lg-field input:focus { outline:none; border-color:var(--lg-accent); background:rgba(15,23,42,1); box-shadow:0 0 0 4px rgba(109,124,255,.18); }
.lg-field input:focus + label, .lg-field input:not(:placeholder-shown) + label, .lg-field input:-webkit-autofill + label { transform:translateY(-11px) scale(.78); color:#b9c3ff; }
.lg-eye { position:absolute; right:8px; top:8px; width:40px; height:40px; border:0; background:transparent; color:var(--lg-muted); border-radius:10px; cursor:pointer; display:grid; place-items:center; }
.lg-eye:hover { color:var(--lg-text); background:rgba(148,163,184,.08); }
.lg-caps { margin:-6px 0 12px; font-size:12.5px; font-weight:600; color:var(--lg-amber); }
.lg-err { margin:-4px 0 16px; padding:10px 12px; border-radius:10px; background:rgba(239,68,68,.1); border:1px solid rgba(239,68,68,.3); font-size:13px; color:#fca5a5; animation:lg-shake .4s; }
.lg-btn { position:relative; width:100%; height:54px; margin-top:6px; border:0; border-radius:14px; cursor:pointer; overflow:hidden; color:#fff; font:600 16px var(--lg-body);
  background:linear-gradient(135deg,#5a6bff,#7b5cff); box-shadow:0 10px 30px -10px rgba(109,124,255,.7); transition:transform .15s, box-shadow .25s, background .4s; }
.lg-btn:hover:not(:disabled) { transform:translateY(-1px); box-shadow:0 14px 34px -10px rgba(109,124,255,.85); }
.lg-btn:disabled { cursor:default; }
.lg-btn::after { content:""; position:absolute; inset:0; background:linear-gradient(110deg, transparent 30%, rgba(255,255,255,.28) 50%, transparent 70%); transform:translateX(-120%); }
.lg-btn:hover:not(:disabled)::after { transform:translateX(120%); transition:transform .9s ease; }
.lg-fill { position:absolute; left:0; bottom:0; height:3px; width:0; background:var(--lg-amber); }
.lg-btn.busy .lg-fill { animation:lg-fill 2.4s cubic-bezier(.4,0,.2,1) forwards; }
.lg-btn.done { background:linear-gradient(135deg,#10b981,#34d399); box-shadow:0 10px 30px -10px rgba(52,211,153,.7); }
.lg-help { margin:18px 0 0; text-align:center; font-size:13px; color:var(--lg-muted); }
.lg-secure { margin-top:10px; display:flex; align-items:center; justify-content:center; gap:8px; font-size:12.5px; color:var(--lg-muted); }
.lg-welcome { position:fixed; inset:0; z-index:5; display:grid; place-items:center; background:rgba(7,11,22,0); pointer-events:none; opacity:0; transition:opacity .6s, background .6s; }
.lg-welcome.show { opacity:1; background:rgba(7,11,22,.88); pointer-events:auto; }
.lg-welcome > div { text-align:center; transform:translateY(12px); transition:transform .6s .1s cubic-bezier(.2,.8,.2,1); }
.lg-welcome.show > div { transform:none; }
.lg-welcome h3 { margin:14px 0 4px; font:600 28px var(--lg-display); color:var(--lg-text); }
.lg-welcome p { margin:0; color:var(--lg-muted); }
.lg-tick { width:64px; height:64px; }
.lg-tick circle { fill:none; stroke:var(--lg-ok); stroke-width:3; stroke-dasharray:190; stroke-dashoffset:190; }
.lg-tick path { fill:none; stroke:var(--lg-ok); stroke-width:4; stroke-linecap:round; stroke-linejoin:round; stroke-dasharray:40; stroke-dashoffset:40; }
.lg-welcome.show .lg-tick circle { animation:lg-dash .6s .15s forwards; }
.lg-welcome.show .lg-tick path { animation:lg-dash .4s .65s forwards; }
.lg-in { opacity:0; animation:lg-rise .7s cubic-bezier(.2,.8,.2,1) forwards; }
.lg-d1 { animation-delay:.15s } .lg-d2 { animation-delay:.35s } .lg-d3 { animation-delay:.45s } .lg-d4 { animation-delay:.55s }
.lg-d5 { animation-delay:.65s } .lg-d6 { animation-delay:.75s } .lg-d7 { animation-delay:.95s } .lg-d8 { animation-delay:1.1s }
@keyframes lg-rise { from { opacity:0; transform:translateY(14px); filter:blur(4px); } to { opacity:1; transform:none; filter:none; } }
@keyframes lg-fill { to { width:92%; } }
@keyframes lg-shake { 20%,60% { transform:translateX(-6px); } 40%,80% { transform:translateX(6px); } }
@keyframes lg-dash { to { stroke-dashoffset:0; } }
@media (max-width: 860px) {
  .lg-root { grid-template-columns:minmax(0,1fr); grid-template-rows:auto 1fr; }
  .lg-scene { height:280px; min-height:0; }
  .lg-hero { padding:60px 20px 20px; }
  .lg-hero h1 { font-size:26px; }
  .lg-ticker { display:none; }
  .lg-brand { top:max(20px, env(safe-area-inset-top)); left:20px; }
  .lg-side { align-items:flex-start; padding-top:32px; }
}
@media (prefers-reduced-motion: reduce) {
  .lg-root *, .lg-root *::before, .lg-root *::after { animation-duration:.001ms !important; animation-delay:0ms !important; transition-duration:.001ms !important; }
}
`;

export default LoginScreen;
