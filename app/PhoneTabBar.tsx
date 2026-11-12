import React from 'react';
import { User, UserPermission } from '../types';
import { CalendarCheckIcon, CalendarIcon, DocumentReportIcon, HomeIcon, MenuIcon } from '../components/icons';
import { hasPermission } from './permissions';

/** Phone tab bar: the four most used screens plus the full menu. */
const PhoneTabBar: React.FC<{ currentUser: User | null; mainView: string; handleNavigation: (view: string) => void; setIsSidebarOpen: (open: boolean) => void; unreadCount: number }> =
  ({ currentUser, mainView, handleNavigation, setIsSidebarOpen, unreadCount }) => (
  <nav className="md:hidden no-print fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur border-t border-slate-200 pb-[env(safe-area-inset-bottom)]" aria-label="Quick navigation">
      <div className="grid grid-cols-5">
          {[
              { name: 'Home', label: 'Home', icon: HomeIcon, ok: hasPermission(currentUser, UserPermission.VIEW_HOME_DASHBOARD) },
              { name: 'Reservations', label: 'Bookings', icon: CalendarIcon, ok: hasPermission(currentUser, UserPermission.VIEW_RESERVATIONS) },
              { name: 'Agreement', label: 'Agreements', icon: DocumentReportIcon, ok: hasPermission(currentUser, UserPermission.VIEW_AGREEMENTS) },
              { name: "Today's Reservations", label: 'Today', icon: CalendarCheckIcon, ok: hasPermission(currentUser, UserPermission.VIEW_TODAYS_RESERVATIONS) },
          ].filter(t => t.ok).map(({ name, label, icon: Icon }) => (
              <button key={name} onClick={() => handleNavigation(name)} aria-current={mainView === name ? 'page' : undefined}
                  className={`relative flex flex-col items-center justify-center gap-0.5 h-14 text-[10.5px] font-medium [&_svg]:w-5 [&_svg]:h-5 ${mainView === name ? 'text-indigo-600' : 'text-slate-500'}`}>
                  {mainView === name && <span className="absolute top-0 inset-x-5 h-0.5 rounded-full bg-indigo-600" />}
                  <Icon />{label}
              </button>
          ))}
          <button onClick={() => setIsSidebarOpen(true)} className="relative flex flex-col items-center justify-center gap-0.5 h-14 text-[10.5px] font-medium text-slate-500 [&_svg]:w-5 [&_svg]:h-5">
              <MenuIcon />Menu
              {unreadCount > 0 && <span className="absolute top-2 right-[calc(50%-16px)] w-2 h-2 rounded-full bg-rose-500" />}
          </button>
      </div>
  </nav>
);

export default PhoneTabBar;
