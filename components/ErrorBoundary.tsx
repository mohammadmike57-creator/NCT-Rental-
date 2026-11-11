import React from 'react';
import { reportScreenError } from '../firebase/api';

/**
 * Keeps one failing screen from blanking the whole system: the error is shown in place of
 * that screen, with the details staff can pass on, and the rest of the app keeps working.
 * When the cause is an outdated copy of the app (its files were replaced by a new release),
 * the page reloads itself once to pick up the new version.
 */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode; fullPage?: boolean; resetKey?: string }, { error: Error | null; reference?: string }> {
  state = { error: null as Error | null, reference: undefined as string | undefined };

  static getDerivedStateFromError(error: Error) { return { error }; }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Screen failed to render', error);
    if (isOutdatedBuild(error)) { reloadOnce(); return; }
    // Reported to the server (Activity Log → System errors); the person sees the reference.
    reportScreenError(error, info.componentStack || '').then(reference => { if (reference && this.state.error === error) this.setState({ reference }); });
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null, reference: undefined });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className={this.props.fullPage ? 'min-h-screen flex items-center justify-center bg-slate-50 p-6' : 'p-6 sm:p-10 flex justify-center'}>
        <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-sm p-6">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-rose-600">Something went wrong</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-900">This screen could not be shown</h2>
          <p className="mt-2 text-sm text-slate-600">Your data is safe. Reload the page to try again. If it happens again, send the message below to your administrator.</p>
          <pre className="mt-3 max-h-32 overflow-auto rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs text-slate-700 whitespace-pre-wrap break-words">{error.message || String(error)}</pre>
          {this.state.reference && <p className="mt-2 text-xs text-slate-500">Reported to your administrator. Reference: <span className="font-mono font-semibold text-slate-700">{this.state.reference}</span></p>}
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => window.location.reload()} className="h-9 px-4 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700">Reload</button>
            {!this.props.fullPage && <button type="button" onClick={() => this.setState({ error: null, reference: undefined })} className="h-9 px-4 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50">Try again</button>}
          </div>
        </div>
      </div>
    );
  }
}

/** A screen's code file could not be downloaded: the release it belonged to was replaced. */
export const isOutdatedBuild = (e: unknown) =>
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Unable to preload CSS/i.test(String((e as Error)?.message || e));

/** Reloads the page, but at most once a minute so it can never loop. */
export function reloadOnce() {
  try {
    const last = Number(sessionStorage.getItem('nct.autoReloadAt') || 0);
    if (Date.now() - last < 60000) return;
    sessionStorage.setItem('nct.autoReloadAt', String(Date.now()));
  } catch { /* storage unavailable: still reload once */ }
  window.location.reload();
}

export default ErrorBoundary;
