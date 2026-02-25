'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { authAPI, APIError } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { createClient } from '@/lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const { setUser, setSession, isAuthenticated, setLoading } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoadingState] = useState(false);
  const [ssoLoading, setSsoLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setLoading(false);
  }, [setLoading]);

  useEffect(() => {
    if (mounted && isAuthenticated()) {
      router.push('/dashboard');
    }
  }, [mounted, isAuthenticated, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoadingState(true);

    try {
      const result = await authAPI.signIn(email, password);

      setUser({
        id: result.user.id,
        email: result.user.email,
        fullName: result.user.fullName,
        role: result.user.role,
        permissions: [],
      });

      setSession({
        accessToken: result.session.accessToken,
        refreshToken: result.session.refreshToken,
        expiresAt: result.session.expiresAt,
      });

      router.push('/dashboard');
    } catch (err) {
      console.error('Login error:', err);
      if (err instanceof APIError) {
        setError(err.message);
      } else if (err instanceof TypeError && err.message.includes('fetch')) {
        setError('Unable to connect to the server. Please ensure the backend is running on port 3001.');
      } else if (err instanceof Error) {
        setError(`Connection error: ${err.message}`);
      } else {
        setError('An unexpected error occurred. Please try again.');
      }
    } finally {
      setLoadingState(false);
    }
  };

  const handleMicrosoftSignIn = async () => {
    setSsoLoading(true);
    setError('');
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'azure',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          scopes: 'email profile openid',
        },
      });
      if (error) {
        setError('Failed to initiate Microsoft sign-in. Please try again.');
        setSsoLoading(false);
      }
      // If successful, browser will redirect — no need to reset loading
    } catch (err) {
      setError('Failed to connect to Microsoft. Please try again.');
      setSsoLoading(false);
    }
  };

  if (!mounted) {
    return null;
  }

  return (
    <div className="min-h-screen flex">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary via-primary-dark to-primary-800 p-12 flex-col justify-between">
        <div>
          <div className="flex items-center space-x-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 backdrop-blur">
              <svg className="h-7 w-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-heading font-bold text-white">3Lines IT Helpdesk</h1>
              <p className="text-primary-100 text-sm">Support Portal</p>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <h2 className="text-4xl font-heading font-bold text-white leading-tight">
            Get IT support<br />in minutes, not hours.
          </h2>
          <p className="text-primary-100 text-lg max-w-md">
            Our AI-powered assistant helps you troubleshoot common issues instantly. For complex problems, we'll connect you with our expert IT team.
          </p>
          <div className="grid grid-cols-3 gap-4 pt-4">
            <div className="bg-white/10 backdrop-blur rounded-lg p-4">
              <div className="text-3xl font-heading font-bold text-white">24/7</div>
              <div className="text-primary-100 text-sm">AI Support</div>
            </div>
            <div className="bg-white/10 backdrop-blur rounded-lg p-4">
              <div className="text-3xl font-heading font-bold text-white">&lt;5m</div>
              <div className="text-primary-100 text-sm">Avg Response</div>
            </div>
            <div className="bg-white/10 backdrop-blur rounded-lg p-4">
              <div className="text-3xl font-heading font-bold text-white">85%</div>
              <div className="text-primary-100 text-sm">Auto-Resolved</div>
            </div>
          </div>
        </div>

        <div className="text-primary-200 text-sm">
          &copy; 2025 3Lines IT Helpdesk. All rights reserved.
        </div>
      </div>

      {/* Right side - Login form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-surface-light">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden mb-8 text-center">
            <div className="inline-flex items-center space-x-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
                <svg className="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
              <span className="text-xl font-heading font-bold text-body-dark">3Lines IT Helpdesk</span>
            </div>
          </div>

          <div className="card rounded-xl shadow-card p-8">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-heading font-bold text-primary-dark">Welcome back</h2>
              <p className="mt-2 text-text-muted">Sign in to access your helpdesk portal</p>
            </div>

            {error && (
              <div className="alert-danger mb-6">
                <div className="flex items-center">
                  <svg className="h-5 w-5 text-danger mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm text-danger-dark">{error}</span>
                </div>
              </div>
            )}

            {/* Microsoft SSO Button */}
            <button
              type="button"
              onClick={handleMicrosoftSignIn}
              disabled={ssoLoading || loading}
              className="w-full flex items-center justify-center gap-3 rounded-lg border border-border-light bg-white px-4 py-3 text-sm font-medium text-body-dark shadow-sm transition-all hover:bg-surface-light hover:shadow focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {ssoLoading ? (
                <>
                  <span className="spinner mr-2"></span>
                  Connecting to Microsoft...
                </>
              ) : (
                <>
                  <svg width="20" height="20" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
                    <rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
                    <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>
                    <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
                  </svg>
                  Sign in with Microsoft
                </>
              )}
            </button>

            {/* Divider */}
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border-light" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-white px-4 text-text-muted">or sign in with email</span>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-body-dark mb-1.5">
                  Email address
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input w-full"
                  placeholder="you@company.com"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-body-dark mb-1.5">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input w-full"
                  placeholder="Enter your password"
                />
              </div>

              <div className="flex items-center justify-between">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    className="h-4 w-4 text-primary border-border-light rounded focus:ring-primary"
                  />
                  <span className="ml-2 text-sm text-text-muted">Remember me</span>
                </label>
                <button type="button" className="text-sm text-primary-light hover:text-primary font-medium transition-colors">
                  Forgot password?
                </button>
              </div>

              <button
                type="submit"
                disabled={loading || ssoLoading}
                className="btn-primary w-full py-3 text-base font-medium"
              >
                {loading ? (
                  <>
                    <span className="spinner mr-2"></span>
                    Signing in...
                  </>
                ) : (
                  'Sign in'
                )}
              </button>
            </form>

            <div className="mt-6 pt-6 border-t border-border-light">
              <p className="text-center text-sm text-text-gray">
                Need help? Contact your IT administrator
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
