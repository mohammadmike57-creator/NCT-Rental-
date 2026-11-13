import { useEffect, useRef } from 'react';
import { startActivityTracking, track, lastInteractionAt } from '../services/activityTracker';
import { sendHeartbeat } from '../services/api';

const deviceType = () => (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop');

/**
 * "Online now" and the staff activity log for the signed-in person:
 * - a heartbeat to the server every minute while they are actually using the app
 *   (the tab is open and they touched something in the last 5 minutes);
 * - every screen opened and every button, tab, row and field they touch.
 */
export function usePresence(signedInEmail: string | undefined, isLoading: boolean, mainView: string): void {
  const mainViewRef = useRef(mainView);
  mainViewRef.current = mainView;

  useEffect(() => {
    if (!signedInEmail || isLoading) return;
    const device = deviceType();
    const beat = () => { if (document.visibilityState === 'visible' && Date.now() - lastInteractionAt() < 5 * 60000) sendHeartbeat(device, mainViewRef.current); };
    sendHeartbeat(device, mainViewRef.current);
    const interval = setInterval(beat, 60000);
    const onVisible = () => { if (document.visibilityState === 'visible') beat(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', onVisible); };
  }, [signedInEmail, isLoading]);

  useEffect(() => {
    if (!signedInEmail) return;
    return startActivityTracking(() => mainViewRef.current);
  }, [signedInEmail]);

  useEffect(() => {
    if (!signedInEmail) return;
    track('UI_VIEW', `Opened screen “${mainView}”`);
    sendHeartbeat(deviceType(), mainView);
  }, [mainView, signedInEmail]);
}

/** Asks before the page is closed while changes are still being saved (or failed to save). */
export function useLeaveWarning(unsaved: boolean): void {
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (unsaved) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [unsaved]);
}
