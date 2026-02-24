'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/lib/store';

export function Header() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'it_admin':
        return 'bg-purple/10 text-purple';
      case 'it_support':
        return 'bg-info/10 text-info-dark';
      default:
        return 'bg-primary-50 text-primary';
    }
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border-light bg-white px-6">
      {/* Left side - Breadcrumb or title could go here */}
      <div className="flex items-center">
        <h2 className="text-lg font-heading font-semibold text-body-dark">
          Welcome back, {user?.fullName?.split(' ')[0] || 'User'}
        </h2>
      </div>

      {/* Right side - Actions */}
      <div className="flex items-center space-x-4">
        {/* Quick action button */}
        <Link
          href="/tickets/new"
          className="btn-primary flex items-center space-x-2"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          <span>New Ticket</span>
        </Link>

        {/* Notifications - Coming Soon */}
        <button
          className="relative rounded-lg p-2 text-text-gray hover:bg-surface-light hover:text-body-dark transition-colors"
          title="Notifications - Coming Soon"
          disabled
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
        </button>

        {/* User menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center space-x-3 rounded-lg p-1.5 hover:bg-surface-light transition-colors"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-sm font-medium text-primary">
              {user?.fullName?.split(' ').map((n) => n[0]).join('').toUpperCase() || '?'}
            </div>
            <div className="hidden text-left md:block">
              <p className="text-sm font-medium text-body-dark">{user?.fullName || 'User'}</p>
              <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${getRoleBadgeColor(user?.role || '')}`}>
                {user?.role?.replace('_', ' ') || 'Employee'}
              </span>
            </div>
            <svg className="h-4 w-4 text-text-gray" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Dropdown menu */}
          {showUserMenu && (
            <div className="absolute right-0 mt-2 w-56 origin-top-right rounded-lg bg-white py-1 shadow-modal border border-border-light">
              <div className="border-b border-border-light px-4 py-3">
                <p className="text-sm font-medium text-body-dark">{user?.fullName}</p>
                <p className="truncate text-sm text-text-muted">{user?.email}</p>
              </div>

              <Link
                href="/profile"
                className="flex items-center px-4 py-2 text-sm text-body-dark hover:bg-surface-light transition-colors"
                onClick={() => setShowUserMenu(false)}
              >
                <svg className="mr-3 h-4 w-4 text-text-gray" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Your Profile
                <span className="ml-auto text-xs text-text-gray">Soon</span>
              </Link>

              <Link
                href="/settings"
                className="flex items-center px-4 py-2 text-sm text-body-dark hover:bg-surface-light transition-colors"
                onClick={() => setShowUserMenu(false)}
              >
                <svg className="mr-3 h-4 w-4 text-text-gray" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Settings
                <span className="ml-auto text-xs text-text-gray">Soon</span>
              </Link>

              <div className="border-t border-border-light">
                <button
                  onClick={handleLogout}
                  className="flex w-full items-center px-4 py-2 text-sm text-danger hover:bg-danger/5 transition-colors"
                >
                  <svg className="mr-3 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default Header;
