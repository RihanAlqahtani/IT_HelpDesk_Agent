'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { useAuthStore } from '@/lib/store';
import { authAPI } from '@/lib/api';

export default function AuthCallbackPage() {
  const router = useRouter();
  const { setUser, setSession } = useAuthStore();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const supabase = createClient();

        // Supabase parses the hash fragment and establishes the session
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError || !session) {
          setError('Authentication failed. Please try again.');
          setTimeout(() => router.push('/login'), 3000);
          return;
        }

        // Call backend to get or create the it_users profile
        const profileData = await authAPI.getSSOProfile(session.access_token);

        // Store in Zustand (same shape as email/password login)
        setUser({
          id: profileData.user.id,
          email: profileData.user.email,
          fullName: profileData.user.fullName,
          role: profileData.user.role,
          permissions: profileData.user.permissions || [],
        });

        setSession({
          accessToken: session.access_token,
          refreshToken: session.refresh_token!,
          expiresAt: session.expires_at!,
        });

        router.push('/dashboard');
      } catch (err) {
        console.error('SSO callback error:', err);
        setError(err instanceof Error ? err.message : 'Authentication failed');
        setTimeout(() => router.push('/login'), 3000);
      }
    };

    handleCallback();
  }, [router, setUser, setSession]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-light">
      <div className="text-center">
        {error ? (
          <div className="space-y-4">
            <div className="text-danger text-lg font-medium">{error}</div>
            <p className="text-text-muted text-sm">Redirecting to login...</p>
          </div>
        ) : (
          <>
            <div className="spinner mx-auto mb-4 h-8 w-8"></div>
            <p className="text-sm text-text-muted">Completing sign in...</p>
          </>
        )}
      </div>
    </div>
  );
}
