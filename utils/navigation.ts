// Minimal stand-ins for next/navigation's hooks, so the mobile screens run in this Vite app.
import { useEffect, useState } from 'react';

const NAVIGATION_EVENT = 'nct:navigate';

export const usePathname = (): string => {
  const [pathname, setPathname] = useState(() => window.location.pathname);
  useEffect(() => {
    const update = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', update);
    window.addEventListener(NAVIGATION_EVENT, update);
    return () => {
      window.removeEventListener('popstate', update);
      window.removeEventListener(NAVIGATION_EVENT, update);
    };
  }, []);
  return pathname;
};

const go = (href: string, replace: boolean) => {
  if (replace) window.history.replaceState(null, '', href);
  else window.history.pushState(null, '', href);
  window.dispatchEvent(new Event(NAVIGATION_EVENT));
};

export const useRouter = () => ({
  push: (href: string) => go(href, false),
  replace: (href: string) => go(href, true),
  back: () => window.history.back(),
  refresh: () => window.location.reload(),
});
