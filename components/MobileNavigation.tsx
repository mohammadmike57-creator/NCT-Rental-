'use client';

import React, { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  HomeIcon,
  CalendarIcon,
  TruckIcon,
  Bars3Icon,
  XMarkIcon,
  BellIcon,
  UserCircleIcon,
  MagnifyingGlassIcon,
  ChevronRightIcon,
  Cog6ToothIcon,
  DocumentTextIcon,
  CurrencyDollarIcon,
  ChartBarIcon,
  UsersIcon,
  ArrowRightOnRectangleIcon,
} from '@heroicons/react/24/outline';

interface MobileNavigationProps {
  currentUser?: {
    name: string;
    email: string;
    avatar?: string;
    role: string;
  };
}

export default function MobileNavigation({ currentUser }: MobileNavigationProps) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [notifications, setNotifications] = useState(3);
  const pathname = usePathname();
  const router = useRouter();

  // Bottom navigation items
  const bottomNavItems = [
    { name: 'Home', icon: HomeIcon, href: '/' },
    { name: 'Reservations', icon: CalendarIcon, href: '/reservations' },
    { name: 'Fleet', icon: TruckIcon, href: '/fleet' },
    { name: 'More', icon: Bars3Icon, href: '#', action: () => setIsDrawerOpen(true) },
  ];

  // Drawer menu items
  const drawerMenuItems = [
    { name: 'Dashboard', icon: HomeIcon, href: '/' },
    { name: 'Reservations', icon: CalendarIcon, href: '/reservations' },
    { name: 'Fleet Management', icon: TruckIcon, href: '/fleet' },
    { name: 'Customers', icon: UsersIcon, href: '/customers' },
    { name: 'Invoices', icon: DocumentTextIcon, href: '/invoices' },
    { name: 'Payments', icon: CurrencyDollarIcon, href: '/payments' },
    { name: 'Reports', icon: ChartBarIcon, href: '/reports' },
    { name: 'Settings', icon: Cog6ToothIcon, href: '/settings' },
  ];

  // Close drawer on route change
  useEffect(() => {
    setIsDrawerOpen(false);
  }, [pathname]);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (isDrawerOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isDrawerOpen]);

  const handleNavigation = (href: string) => {
    if (href !== '#') {
      router.push(href);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Searching for:', searchQuery);
    // Implement search functionality
  };

  return (
    <>
      {/* Top App Bar */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-white border-b border-gray-200 safe-area-top">
        <div className="flex items-center justify-between px-4 h-14">
          {/* Logo */}
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setIsDrawerOpen(true)}
              className="p-2 -ml-2 text-gray-700 active:bg-gray-100 rounded-lg transition-colors touch-manipulation"
              aria-label="Open menu"
            >
              <Bars3Icon className="w-6 h-6" />
            </button>
            <h1 className="text-lg font-bold text-gray-900">NCT Rental</h1>
          </div>

          {/* Right Actions */}
          <div className="flex items-center space-x-2">
            {/* Search */}
            <button
              onClick={() => setIsSearchExpanded(!isSearchExpanded)}
              className="p-2 text-gray-700 active:bg-gray-100 rounded-lg transition-colors touch-manipulation"
              aria-label="Search"
            >
              <MagnifyingGlassIcon className="w-6 h-6" />
            </button>

            {/* Notifications */}
            <button
              className="relative p-2 text-gray-700 active:bg-gray-100 rounded-lg transition-colors touch-manipulation"
              aria-label="Notifications"
            >
              <BellIcon className="w-6 h-6" />
              {notifications > 0 && (
                <span className="absolute top-1 right-1 flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-red-500 rounded-full">
                  {notifications}
                </span>
              )}
            </button>

            {/* Profile */}
            <button
              className="p-1 active:bg-gray-100 rounded-lg transition-colors touch-manipulation"
              aria-label="Profile"
            >
              {currentUser?.avatar ? (
                <img
                  src={currentUser.avatar}
                  alt={currentUser.name}
                  className="w-8 h-8 rounded-full"
                />
              ) : (
                <UserCircleIcon className="w-8 h-8 text-gray-700" />
              )}
            </button>
          </div>
        </div>

        {/* Expandable Search Bar */}
        <div
          className={`overflow-hidden transition-all duration-300 ${
            isSearchExpanded ? 'max-h-20 opacity-100' : 'max-h-0 opacity-0'
          }`}
        >
          <form onSubmit={handleSearch} className="px-4 pb-3">
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search reservations, vehicles, customers..."
                className="w-full pl-10 pr-4 py-3 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                autoFocus={isSearchExpanded}
              />
            </div>
          </form>
        </div>
      </header>

      {/* Drawer Menu */}
      <div
        className={`fixed inset-0 z-50 transition-opacity duration-300 ${
          isDrawerOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black bg-opacity-50"
          onClick={() => setIsDrawerOpen(false)}
        />

        {/* Drawer */}
        <div
          className={`absolute top-0 left-0 bottom-0 w-80 max-w-[85vw] bg-white shadow-2xl transform transition-transform duration-300 ${
            isDrawerOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          {/* Drawer Header */}
          <div className="flex items-center justify-between px-4 h-14 border-b border-gray-200 safe-area-top">
            <h2 className="text-lg font-semibold text-gray-900">Menu</h2>
            <button
              onClick={() => setIsDrawerOpen(false)}
              className="p-2 -mr-2 text-gray-700 active:bg-gray-100 rounded-lg transition-colors touch-manipulation"
              aria-label="Close menu"
            >
              <XMarkIcon className="w-6 h-6" />
            </button>
          </div>

          {/* User Profile Section */}
          {currentUser && (
            <div className="px-4 py-4 bg-gradient-to-r from-blue-600 to-blue-700">
              <div className="flex items-center space-x-3">
                {currentUser.avatar ? (
                  <img
                    src={currentUser.avatar}
                    alt={currentUser.name}
                    className="w-12 h-12 rounded-full border-2 border-white"
                  />
                ) : (
                  <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center">
                    <UserCircleIcon className="w-10 h-10 text-blue-600" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">
                    {currentUser.name}
                  </p>
                  <p className="text-xs text-blue-100 truncate">{currentUser.email}</p>
                  <p className="text-xs text-blue-200 mt-0.5">{currentUser.role}</p>
                </div>
              </div>
            </div>
          )}

          {/* Menu Items */}
          <nav className="flex-1 overflow-y-auto py-2 safe-area-bottom">
            {drawerMenuItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <button
                  key={item.name}
                  onClick={() => handleNavigation(item.href)}
                  className={`w-full flex items-center justify-between px-4 py-3 text-sm font-medium transition-colors touch-manipulation ${
                    isActive
                      ? 'bg-blue-50 text-blue-700 border-l-4 border-blue-700'
                      : 'text-gray-700 active:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <item.icon className="w-6 h-6" />
                    <span>{item.name}</span>
                  </div>
                  <ChevronRightIcon className="w-5 h-5 text-gray-400" />
                </button>
              );
            })}

            {/* Divider */}
            <div className="my-2 border-t border-gray-200" />

            {/* Logout */}
            <button
              onClick={() => {
                console.log('Logout');
                // Implement logout
              }}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-red-600 active:bg-red-50 transition-colors touch-manipulation"
            >
              <div className="flex items-center space-x-3">
                <ArrowRightOnRectangleIcon className="w-6 h-6" />
                <span>Logout</span>
              </div>
            </button>
          </nav>
        </div>
      </div>

      {/* Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 safe-area-bottom">
        <div className="grid grid-cols-4 h-16">
          {bottomNavItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <button
                key={item.name}
                onClick={() => item.action ? item.action() : handleNavigation(item.href)}
                className={`flex flex-col items-center justify-center space-y-1 transition-colors touch-manipulation ${
                  isActive ? 'text-blue-700' : 'text-gray-600 active:text-blue-600'
                }`}
                aria-label={item.name}
              >
                <item.icon className="w-6 h-6" />
                <span className="text-xs font-medium">{item.name}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Spacer for bottom navigation */}
      <div className="h-16" />
    </>
  );
}
