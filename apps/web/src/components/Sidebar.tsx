'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/lib/store';
import { privilegedAPI } from '@/lib/api';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  roles?: string[];
  comingSoon?: boolean;
  showBadge?: boolean;
}

const TicketIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
  </svg>
);

const DashboardIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
  </svg>
);

const PlusIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
  </svg>
);

const UsersIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
  </svg>
);

const ShieldIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
  </svg>
);

const KeyIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
  </svg>
);

const ChartIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
);

const CogIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const ClipboardCheckIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
  </svg>
);

const mainNavItems: NavItem[] = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: <DashboardIcon />,
  },
  {
    label: 'My Tickets',
    href: '/tickets',
    icon: <TicketIcon />,
  },
  {
    label: 'New Ticket',
    href: '/tickets/new',
    icon: <PlusIcon />,
  },
];

const itAdminNavItems: NavItem[] = [
  {
    label: 'All Tickets',
    href: '/admin/tickets',
    icon: <TicketIcon />,
    roles: ['it_support', 'it_admin'],
  },
  {
    label: 'Approvals',
    href: '/admin/approvals',
    icon: <ClipboardCheckIcon />,
    roles: ['it_admin'],
    showBadge: true,
  },
  {
    label: 'Analytics',
    href: '/admin/analytics',
    icon: <ChartIcon />,
    roles: ['it_support', 'it_admin'],
    comingSoon: true,
  },
  {
    label: 'Password Resets',
    href: '/admin/password-resets',
    icon: <KeyIcon />,
    roles: ['it_admin'],
    comingSoon: true,
  },
  {
    label: 'Security',
    href: '/admin/security',
    icon: <ShieldIcon />,
    roles: ['it_admin'],
    comingSoon: true,
  },
];

const hrNavItems: NavItem[] = [
  {
    label: 'HR Dashboard',
    href: '/hr/dashboard',
    icon: <DashboardIcon />,
    roles: ['hr', 'it_admin'],
  },
  {
    label: 'Employees',
    href: '/hr/employees',
    icon: <UsersIcon />,
    roles: ['hr', 'it_admin'],
  },
];

const systemNavItems: NavItem[] = [
  {
    label: 'Settings',
    href: '/settings',
    icon: <CogIcon />,
    comingSoon: true,
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, session } = useAuthStore();
  const [pendingApprovals, setPendingApprovals] = useState(0);

  // Fetch pending approvals count for IT admins
  useEffect(() => {
    if (user?.role !== 'it_admin' || !session?.accessToken) return;

    const fetchApprovals = async () => {
      try {
        const response = await privilegedAPI.getApprovals(session.accessToken);
        setPendingApprovals(response.count || 0);
      } catch (err) {
        // Silently fail - not critical
        console.error('Failed to fetch approvals count:', err);
      }
    };

    fetchApprovals();
    // Poll every 15 seconds
    const interval = setInterval(fetchApprovals, 15000);
    return () => clearInterval(interval);
  }, [user?.role, session?.accessToken]);

  const filterByRole = (items: NavItem[]) =>
    items.filter((item) => {
      if (!item.roles) return true;
      return user?.role && item.roles.includes(user.role);
    });

  const isActive = (href: string) => {
    if (href === '/dashboard') {
      return pathname === '/dashboard';
    }
    if (href === '/tickets') {
      return pathname === '/tickets' || (pathname?.startsWith('/tickets/') && !pathname.includes('/new'));
    }
    return pathname?.startsWith(href);
  };

  const filteredITItems = filterByRole(itAdminNavItems);
  const filteredHRItems = filterByRole(hrNavItems);

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 bg-primary-800 text-white">
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div className="flex h-16 items-center border-b border-primary-700 px-6">
          <div className="flex items-center space-x-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-light">
              <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-heading font-bold">3Lines IT</h1>
              <p className="text-xs text-primary-200">Support Portal</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          <div className="mb-4">
            <p className="px-3 text-xs font-semibold uppercase tracking-wider text-primary-300">
              Main
            </p>
          </div>

          {mainNavItems.map((item) => (
            <NavLink key={item.href} item={item} isActive={isActive(item.href)} />
          ))}

          {/* IT Staff Section */}
          {filteredITItems.length > 0 && (
            <>
              <div className="mb-4 mt-8">
                <p className="px-3 text-xs font-semibold uppercase tracking-wider text-primary-300">
                  IT Administration
                </p>
              </div>
              {filteredITItems.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  isActive={isActive(item.href)}
                  badgeCount={item.showBadge ? pendingApprovals : 0}
                />
              ))}
            </>
          )}

          {/* HR Section */}
          {filteredHRItems.length > 0 && (
            <>
              <div className="mb-4 mt-8">
                <p className="px-3 text-xs font-semibold uppercase tracking-wider text-primary-300">
                  HR Management
                </p>
              </div>
              {filteredHRItems.map((item) => (
                <NavLink key={item.href} item={item} isActive={isActive(item.href)} />
              ))}
            </>
          )}

          <div className="mb-4 mt-8">
            <p className="px-3 text-xs font-semibold uppercase tracking-wider text-primary-300">
              System
            </p>
          </div>
          {systemNavItems.map((item) => (
            <NavLink key={item.href} item={item} isActive={isActive(item.href)} />
          ))}
        </nav>

        {/* User info */}
        <div className="border-t border-primary-700 p-4">
          <div className="flex items-center space-x-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-600 text-sm font-medium">
              {user?.fullName?.split(' ').map((n) => n[0]).join('').toUpperCase() || '?'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-medium">{user?.fullName || 'User'}</p>
              <p className="truncate text-xs text-primary-300 capitalize">{user?.role?.replace('_', ' ') || 'Employee'}</p>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

function NavLink({ item, isActive, badgeCount = 0 }: { item: NavItem; isActive: boolean; badgeCount?: number }) {
  if (item.comingSoon) {
    return (
      <div
        className="group flex items-center rounded-lg px-3 py-2.5 text-sm font-medium text-primary-400 cursor-not-allowed opacity-60"
      >
        <span className="mr-3 text-primary-500">{item.icon}</span>
        <span>{item.label}</span>
        <span className="ml-auto rounded bg-primary-700 px-1.5 py-0.5 text-xs text-primary-300">
          Soon
        </span>
      </div>
    );
  }

  return (
    <Link
      href={item.href}
      className={`group flex items-center rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
        isActive
          ? 'bg-primary-light text-white'
          : 'text-primary-100 hover:bg-primary-700 hover:text-white'
      }`}
    >
      <span className={`mr-3 ${isActive ? 'text-white' : 'text-primary-300 group-hover:text-white'}`}>
        {item.icon}
      </span>
      <span>{item.label}</span>
      {badgeCount > 0 && (
        <span className="ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-danger px-1.5 text-xs font-bold text-white animate-pulse">
          {badgeCount}
        </span>
      )}
    </Link>
  );
}

export default Sidebar;
