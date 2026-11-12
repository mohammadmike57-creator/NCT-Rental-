import React, { useEffect, useRef, useState } from 'react';
import { User, UserPermission } from '../types';
import { MONTHS } from '../constants';
import { ChevronDownIcon, InboxIcon, MenuIcon, PlusIcon, SaveIcon } from '../components/icons';
import { OnlineNowButton } from '../components/OnlinePresence';
import { hasPermission } from './permissions';

declare const __APP_BUILD__: string;

interface DateProps {
  selectedYear: number;
  years: number[];
  selectedMonth: string;
  mainView: string;
  handleSetSelectedYear: (year: number) => void;
  handleSetSelectedMonth: (month: string) => void;
}

/** Year and month pickers for the screens that show one month. */
export const DateSelectors: React.FC<DateProps & { compact?: boolean }> = ({ compact, selectedYear, years, selectedMonth, mainView, handleSetSelectedYear, handleSetSelectedMonth }) => (
  <div className="flex items-center gap-2">
    <select value={String(selectedYear)} onChange={e => handleSetSelectedYear(Number(e.target.value))} aria-label="Select year"
      className={`${compact ? 'h-8 text-xs w-[6.25rem]' : 'h-9 text-[13px]'} pl-2.5 pr-7 bg-white border border-slate-200 rounded-lg text-slate-700 font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none`}>
      {years.map(y => <option key={y} value={y}>{y}</option>)}
    </select>
    {mainView !== 'Yearly Summary' && (
      <select value={selectedMonth} onChange={e => handleSetSelectedMonth(e.target.value)} aria-label="Select month"
        className={`${compact ? 'h-8 text-xs w-[8.5rem]' : 'h-9 text-[13px] w-36'} pl-2.5 pr-7 bg-white border border-slate-200 rounded-lg text-slate-700 font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none`}>
        {MONTHS.map(month => <option key={month} value={month}>{month}</option>)}
      </select>
    )}
  </div>
);

/** "Saving…", "Save failed" or "Saved hh:mm". */
export const SaveState: React.FC<{ saveStatus: 'saved' | 'saving' | 'error'; lastSaved: string | null }> = ({ saveStatus, lastSaved }) => (
  saveStatus === 'saving' ? <span className="inline-flex items-center gap-1.5 text-xs text-slate-500"><span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />Saving…</span>
  : saveStatus === 'error' ? <span className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-600"><span className="w-1.5 h-1.5 rounded-full bg-rose-500" />Save failed</span>
  : saveStatus === 'saved' && lastSaved ? <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 whitespace-nowrap" title={`Last saved ${lastSaved}`}><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Saved<span className="hidden sm:inline">{lastSaved}</span></span>
  : null
);


export interface NewItem { label: string; hint: string; run: () => void }

export interface AppHeaderProps {
  mainView: string;
  currentUser: User | null;
  setIsSidebarOpen: (open: boolean) => void;
  sidebarCollapsed: boolean;
  toggleSidebarCollapsed: () => void;
  runGlobalSearch: (q: string) => void;
  saveStatus: 'saved' | 'saving' | 'error';
  lastSaved: string | null;
  setMainView: (view: string) => void;
  fetchAllData: () => void;
  executeAutoSave: () => void;
  showDateSelectors: boolean;
  dates: DateProps;
  newItems: NewItem[];
  handleNavigation: (view: string) => void;
  unreadCount: number;
  userInitials: string;
  handleLogout: () => void;
}

/** The bar above every screen: title, booking search, save state, reload, month, "New", inbox and the person menu. */
const AppHeader: React.FC<AppHeaderProps> = ({ mainView, currentUser, setIsSidebarOpen, sidebarCollapsed, toggleSidebarCollapsed, runGlobalSearch,
  saveStatus, lastSaved, setMainView, fetchAllData, executeAutoSave, showDateSelectors, dates, newItems, handleNavigation, unreadCount,
  userInitials, handleLogout }) => {
  const [openMenu, setOpenMenu] = useState<null | 'new' | 'user'>(null);
  const globalSearchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    // "/" jumps to the booking search, Escape closes header menus.
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey) { e.preventDefault(); globalSearchRef.current?.focus(); }
      if (e.key === 'Escape') setOpenMenu(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <header className="flex items-center gap-3 px-4 sm:px-6 bg-white border-b border-slate-200 no-print h-14 flex-shrink-0">
          <button className="text-slate-600 md:hidden -ml-1 p-1" onClick={() => setIsSidebarOpen(true)} aria-label="Open menu"><MenuIcon /></button>
          <div className="min-w-0 md:w-56 shrink-0">
              <h2 className="text-[15px] font-semibold text-slate-900 truncate leading-tight" title={mainView}>{mainView}</h2>
              <p className="text-[11px] text-slate-500 truncate" title="UR-Drive Jordan">UR-Drive Jordan</p>
          </div>
          <form className="hidden md:block flex-1 max-w-md" onSubmit={e => { e.preventDefault(); const f = e.currentTarget.elements.namedItem('q') as HTMLInputElement; runGlobalSearch(f.value); f.value = ''; }} role="search">
              <div className="relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
                  <input ref={globalSearchRef} name="q" type="search" placeholder="Find a booking — number, customer, phone or plate" aria-label="Find a booking"
                      className="peer w-full h-9 pl-9 pr-9 bg-slate-100 border border-transparent rounded-lg text-[13px] text-slate-700 placeholder:text-slate-400 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none" />
                  <kbd className="peer-focus:hidden absolute right-2.5 top-1/2 -translate-y-1/2 px-1.5 rounded border border-slate-300 bg-white text-[10px] font-semibold text-slate-400">/</kbd>
              </div>
          </form>
          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
              <div className="hidden lg:block mr-1"><SaveState saveStatus={saveStatus} lastSaved={lastSaved} /></div>
              {(hasPermission(currentUser, UserPermission.ACTION_ADMIN_MANAGE_USERS) || hasPermission(currentUser, UserPermission.VIEW_SYSTEM_ACTIVITY_LOG)) && (
                  <div className="hidden sm:block"><OnlineNowButton selfEmail={currentUser?.email} onOpenStaff={hasPermission(currentUser, UserPermission.ACTION_ADMIN_MANAGE_USERS) ? () => setMainView('User & Staff Management') : undefined} /></div>
              )}
              <button onClick={() => { fetchAllData(); }} title="Reload data from the server" aria-label="Reload data"
                  className="hidden md:inline-flex w-9 h-9 items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100">
                  <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
              </button>
              <button onClick={() => { executeAutoSave(); }} title="Save all changes now"
                  className="hidden md:inline-flex h-9 items-center gap-1.5 px-3 rounded-lg border border-slate-200 text-[13px] font-medium text-slate-700 hover:bg-slate-50">
                  <SaveIcon className="w-4 h-4 text-slate-500" />Save
              </button>
              {showDateSelectors && <div className="hidden md:block pl-2 ml-1 border-l border-slate-200"><DateSelectors {...dates} /></div>}
              <div className="relative">
                  <button onClick={() => setOpenMenu(m => (m === 'new' ? null : 'new'))} aria-haspopup="menu" aria-expanded={openMenu === 'new'}
                      className="h-9 inline-flex items-center gap-1.5 px-2.5 sm:px-3 rounded-lg bg-indigo-600 text-white text-[13px] font-semibold shadow-sm hover:bg-indigo-700">
                      <PlusIcon className="w-4 h-4" /><span className="hidden sm:inline">New</span>
                      <ChevronDownIcon className="hidden sm:block w-3.5 h-3.5 opacity-80" />
                  </button>
                  {openMenu === 'new' && (
                      <>
                          <div className="fixed inset-0 z-40" onClick={() => setOpenMenu(null)} />
                          <div role="menu" className="absolute right-0 mt-1.5 z-50 w-64 bg-white rounded-lg border border-slate-200 shadow-xl py-1">
                              <p className="px-3 pt-1.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Create</p>
                              {newItems.map(i => (
                                  <button key={i.label} role="menuitem" onClick={() => { setOpenMenu(null); i.run(); }} className="w-full text-left px-3 py-2 hover:bg-slate-50">
                                      <span className="block text-[13px] font-medium text-slate-800">{i.label}</span>
                                      <span className="block text-[11px] text-slate-500">{i.hint}</span>
                                  </button>
                              ))}
                          </div>
                      </>
                  )}
              </div>
              <button
                  onClick={() => handleNavigation('Internal Messages')}
                  className="relative w-9 h-9 inline-flex items-center justify-center text-slate-500 rounded-lg hover:text-slate-900 hover:bg-slate-100"
                  aria-label={`Open Inbox (${unreadCount} unread)`}
              >
                  <InboxIcon className="w-5 h-5" />
                  {unreadCount > 0 && (
                      <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 inline-flex items-center justify-center rounded-full bg-rose-500 text-white text-[10px] font-semibold tabular-nums">{unreadCount}</span>
                  )}
              </button>
              <div className="relative hidden md:block">
                  <button onClick={() => setOpenMenu(m => (m === 'user' ? null : 'user'))} aria-haspopup="menu" aria-expanded={openMenu === 'user'} title={currentUser?.fullName}
                      className="w-9 h-9 rounded-full bg-indigo-500 text-white text-xs font-semibold inline-flex items-center justify-center ring-2 ring-white hover:ring-indigo-100">{userInitials}</button>
                  {openMenu === 'user' && (
                      <>
                          <div className="fixed inset-0 z-40" onClick={() => setOpenMenu(null)} />
                          <div role="menu" className="absolute right-0 mt-1.5 z-50 w-60 bg-white rounded-lg border border-slate-200 shadow-xl py-1 text-[13px]">
                              <div className="px-3 py-2 border-b border-slate-100">
                                  <p className="font-semibold text-slate-900 truncate">{currentUser?.fullName}</p>
                                  <p className="text-[11px] text-slate-500 truncate">{currentUser?.email || currentUser?.username}</p>
                              </div>
                              {hasPermission(currentUser, UserPermission.VIEW_MY_PROFILE) && (
                                  <button role="menuitem" onClick={() => { setOpenMenu(null); handleNavigation('My Profile'); }} className="w-full text-left px-3 py-2 text-slate-700 hover:bg-slate-50">My profile</button>
                              )}
                              <button role="menuitem" onClick={() => { setOpenMenu(null); toggleSidebarCollapsed(); }} className="w-full text-left px-3 py-2 text-slate-700 hover:bg-slate-50">{sidebarCollapsed ? 'Expand side menu' : 'Collapse side menu'}</button>
                              <div className="border-t border-slate-100 mt-1 pt-1">
                                  <button role="menuitem" onClick={() => { setOpenMenu(null); handleLogout(); }} className="w-full text-left px-3 py-2 text-rose-600 hover:bg-rose-50">Log out</button>
                                  <p className="px-3 pt-1.5 pb-1 border-t border-slate-100 text-[10.5px] text-slate-400 tabular-nums">Version {typeof __APP_BUILD__ !== 'undefined' ? __APP_BUILD__ : 'dev'}</p>
                              </div>
                          </div>
                      </>
                  )}
              </div>
          </div>
      </header>

      {/* Mobile sub-header */}
      <div className="md:hidden flex items-center justify-between gap-2 px-4 py-2 bg-white border-b border-slate-200">
          <SaveState saveStatus={saveStatus} lastSaved={lastSaved} />
          {showDateSelectors && <DateSelectors {...dates} compact />}
      </div>

    </>
  );
};

export default AppHeader;
