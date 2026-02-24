'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const router = useRouter();
  const { isAuthenticated, isLoading, setLoading } = useAuthStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setLoading(false);
  }, [setLoading]);

  useEffect(() => {
    if (mounted && !isLoading && !isAuthenticated()) {
      router.push('/login');
    }
  }, [mounted, isLoading, isAuthenticated, router]);

  // Show loading state while checking auth
  if (!mounted || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-light">
        <div className="text-center">
          <div className="spinner mx-auto mb-4 h-8 w-8"></div>
          <p className="text-sm text-text-muted">Loading...</p>
        </div>
      </div>
    );
  }

  // Don't render anything while redirecting
  if (!isAuthenticated()) {
    return null;
  }

  return (
    <div className="min-h-screen bg-surface-light">
      <Sidebar />
      <div className="ml-64 min-h-screen">
        <Header />
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}

export default DashboardLayout;
