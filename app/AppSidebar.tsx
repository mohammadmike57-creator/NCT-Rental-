import React, { useState } from 'react';
import { CompanyDetails, User, UserPermission } from '../types';
import { NCT_LOGIN_LOGO_B64 } from '../constants';
import { ChevronDownIcon, CloseIcon, LogoutIcon, UserCircleIcon } from '../components/icons';
import { SidebarLink } from './navigation';
import { hasPermission } from './permissions';

const SidebarSection: React.FC<{ title: string, children: React.ReactNode, collapsed?: boolean }> = ({ title, children, collapsed }) => {
    const [isOpen, setIsOpen] = useState(true);
    if (collapsed) return <div className="space-y-px pt-2 first:pt-0 border-t border-white/5 first:border-0">{children}</div>;
    return (
        <div>
            <button onClick={() => setIsOpen(!isOpen)} className="w-full flex justify-between items-center px-3 py-1.5 text-[10.5px] font-semibold text-slate-500 uppercase tracking-[0.08em] hover:text-slate-300">
                {title}
                <ChevronDownIcon className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${isOpen ? '' : '-rotate-90'}`} />
            </button>
            {isOpen && <div className="pt-0.5 space-y-px">{children}</div>}
        </div>
    );
};

export interface AppSidebarProps {
  isSidebarOpen: boolean;
  setIsSidebarOpen: (open: boolean) => void;
  sidebarCollapsed: boolean;
  toggleSidebarCollapsed: () => void;
  sidebarGroups: Record<string, SidebarLink[]>;
  companyDetails: CompanyDetails;
  currentUser: User | null;
  mainView: string;
  handleNavigation: (view: string) => void;
  userInitials: string;
  handleLogout: () => void;
}

/** The side menu: screens grouped by section, the signed-in person, collapse and log out. */
const AppSidebar: React.FC<AppSidebarProps> = ({ isSidebarOpen, setIsSidebarOpen, sidebarCollapsed, toggleSidebarCollapsed, sidebarGroups,
  companyDetails, currentUser, mainView, handleNavigation, userInitials, handleLogout }) => (
  <>
  {isSidebarOpen && <div className="fixed inset-0 z-30 bg-slate-900/50 md:hidden" onClick={() => setIsSidebarOpen(false)}></div>}

  <aside className={`absolute md:relative z-40 md:z-auto w-60 ${sidebarCollapsed ? 'md:w-[68px]' : ''} bg-slate-900 text-white flex-shrink-0 transition-transform duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 flex flex-col h-full border-r border-slate-800`}>
     <div className="flex items-center justify-between px-4 h-14 border-b border-white/5 flex-shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
            <img src={NCT_LOGIN_LOGO_B64} alt="NCT Rental" className="h-8 w-8 rounded-lg shrink-0 shadow-sm" />
            <div className={`min-w-0 leading-tight ${sidebarCollapsed ? 'md:hidden' : ''}`}>
                <h1 className="text-[15px] font-semibold text-white tracking-tight">NCT Rental</h1>
                <p className="text-[10.5px] text-slate-400 truncate">Rental management</p>
            </div>
        </div>
        <button className="text-slate-400 md:hidden hover:text-white" onClick={() => setIsSidebarOpen(false)} aria-label="Close menu"><CloseIcon /></button>
     </div>

     <div className="flex-1 overflow-y-auto flex flex-col">
        <nav className="px-2.5 py-3 space-y-3 flex-1 [&_svg]:w-[18px] [&_svg]:h-[18px]">
            {Object.entries(sidebarGroups).map(([sectionTitle, links]) => {
                const visibleLinks = links.filter(link => {
                    if (link.name === 'Payment Approvals' && !(companyDetails.requirePaymentApproval ?? true)) {
                        return false;
                    }
                    return hasPermission(currentUser, link.permission)
                });
                if(visibleLinks.length === 0) return null;

                return (
                    <SidebarSection key={sectionTitle} title={sectionTitle} collapsed={sidebarCollapsed && !isSidebarOpen}>
                        {visibleLinks.map(({ name, icon: Icon, badge, badgeText, action }) => (
                            <a
                                key={name}
                                href="#"
                                onClick={(e) => { e.preventDefault(); if (action) { setIsSidebarOpen(false); action(); } else handleNavigation(name); }}
                                aria-current={mainView === name ? 'page' : undefined}
                                title={sidebarCollapsed ? name : undefined}
                                className={`relative flex items-center ${sidebarCollapsed && !isSidebarOpen ? 'md:justify-center' : ''} justify-between gap-3 px-3 py-[7px] rounded-md text-[13px] font-medium transition-colors ${mainView === name ? 'bg-white/10 text-white before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-[3px] before:rounded-full before:bg-indigo-400' : 'text-slate-400 hover:bg-white/5 hover:text-slate-100'}`}
                            >
                                <div className="flex items-center gap-2.5 min-w-0">
                                <Icon />
                                <span className={`line-clamp-2 leading-[1.25] ${sidebarCollapsed && !isSidebarOpen ? 'md:hidden' : ''}`}>{name}</span>
                                </div>
                                {badgeText ? (
                                <span className={`${sidebarCollapsed && !isSidebarOpen ? 'md:absolute md:top-0.5 md:right-1 md:h-4 md:text-[9px]' : ''} h-5 px-1.5 inline-flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-wide text-white bg-rose-500 rounded-full whitespace-nowrap`}><span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />{badgeText}</span>
                                ) : typeof badge === 'number' && badge > 0 && (
                                <span className={`${sidebarCollapsed && !isSidebarOpen ? 'md:absolute md:top-0.5 md:right-1 md:min-w-[16px] md:h-4 md:text-[10px]' : ''} min-w-[20px] h-5 px-1.5 inline-flex items-center justify-center text-[11px] font-semibold text-white bg-rose-500 rounded-full tabular-nums`}>{badge}</span>
                                )}
                            </a>
                        ))}
                    </SidebarSection>
                );
            })}
        </nav>

        <div className="p-2.5 border-t border-white/5 flex-shrink-0 space-y-1 [&_svg]:w-[18px] [&_svg]:h-[18px]">
            <button onClick={toggleSidebarCollapsed} title={sidebarCollapsed ? 'Expand menu' : 'Collapse menu'} aria-label={sidebarCollapsed ? 'Expand menu' : 'Collapse menu'}
                className={`hidden md:flex items-center w-full gap-2.5 px-3 py-[7px] text-[13px] font-medium text-slate-400 hover:bg-white/5 hover:text-white rounded-md ${sidebarCollapsed ? 'justify-center' : ''}`}>
                <svg className={`transition-transform ${sidebarCollapsed ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M18.75 19.5l-7.5-7.5 7.5-7.5m-6 15L5.25 12l7.5-7.5" /></svg>
                {!sidebarCollapsed && <span>Collapse menu</span>}
            </button>
            <div className={sidebarCollapsed ? 'md:hidden space-y-1' : 'space-y-1'}>
            <div className="mt-1 flex items-center gap-2.5 px-2 py-2 rounded-lg bg-white/[0.04]">
                <div className="w-8 h-8 rounded-full bg-indigo-500/90 text-white text-xs font-semibold flex items-center justify-center shrink-0">{userInitials}</div>
                <div className="min-w-0 flex-1 leading-tight">
                    <p className="text-[13px] font-medium text-white truncate">{currentUser?.fullName}</p>
                    <p className="text-[11px] text-slate-400 truncate capitalize">{(currentUser?.role || 'staff').toLowerCase()}</p>
                </div>
                {hasPermission(currentUser, UserPermission.VIEW_MY_PROFILE) && (
                    <button onClick={() => handleNavigation('My Profile')} title="My profile" aria-label="My profile"
                        className={`p-1.5 rounded-md ${mainView === 'My Profile' ? 'text-white bg-white/10' : 'text-slate-400 hover:text-white hover:bg-white/10'}`}><UserCircleIcon /></button>
                )}
                <button onClick={handleLogout} title="Log out" aria-label="Log out" className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-white/10"><LogoutIcon /></button>
            </div>
            </div>
        </div>
     </div>
  </aside>
  </>
);

export default AppSidebar;
