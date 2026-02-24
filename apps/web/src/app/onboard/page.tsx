'use client';

import { useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const DEPARTMENTS = [
  'Engineering',
  'Finance',
  'Human Resources',
  'IT',
  'Legal',
  'Marketing',
  'Operations',
  'Sales',
  'Other',
];

type FormStep = 'access_code' | 'details' | 'submitting' | 'success' | 'error';

interface OnboardingResult {
  recordId: string;
  userPrincipalName: string;
  displayName: string;
  credentialsEmailed: boolean;
  warnings: string[];
}

export default function OnboardPage() {
  const [step, setStep] = useState<FormStep>('access_code');
  const [accessCode, setAccessCode] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [personalEmail, setPersonalEmail] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [department, setDepartment] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [result, setResult] = useState<OnboardingResult | null>(null);

  const handleAccessCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessCode.trim()) {
      setError('Please enter the access code');
      return;
    }
    setError('');
    setStep('details');
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});
    setStep('submitting');

    try {
      const response = await fetch(`${API_URL}/api/hr/onboard/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessCode,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          personalEmail: personalEmail.trim().toLowerCase(),
          jobTitle: jobTitle.trim() || undefined,
          department: department || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 403) {
          setError('Invalid access code. Please check with HR and try again.');
          setStep('access_code');
          setAccessCode('');
          return;
        }
        if (response.status === 429) {
          setError('Too many submissions. Please try again later.');
          setStep('error');
          return;
        }
        if (data.details) {
          setFieldErrors(data.details);
          setStep('details');
          return;
        }
        setError(data.error || 'Something went wrong. Please try again.');
        setStep('error');
        return;
      }

      setResult(data.data);
      setStep('success');
    } catch (err) {
      console.error('Onboarding submission error:', err);
      setError('Unable to connect to the server. Please try again later.');
      setStep('error');
    }
  };

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
              <h1 className="text-2xl font-heading font-bold text-white">3Lines</h1>
              <p className="text-primary-100 text-sm">Employee Onboarding</p>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <h2 className="text-4xl font-heading font-bold text-white leading-tight">
            Welcome to<br />the team!
          </h2>
          <p className="text-primary-100 text-lg max-w-md">
            Complete this form to set up your corporate email and Microsoft 365 account. Your login credentials will be sent to your personal email.
          </p>
          <div className="grid grid-cols-3 gap-4 pt-4">
            <div className="bg-white/10 backdrop-blur rounded-lg p-4">
              <svg className="h-8 w-8 text-white mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <div className="text-primary-100 text-sm">Corporate Email</div>
            </div>
            <div className="bg-white/10 backdrop-blur rounded-lg p-4">
              <svg className="h-8 w-8 text-white mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <div className="text-primary-100 text-sm">Microsoft 365</div>
            </div>
            <div className="bg-white/10 backdrop-blur rounded-lg p-4">
              <svg className="h-8 w-8 text-white mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <div className="text-primary-100 text-sm">Secure Setup</div>
            </div>
          </div>
        </div>

        <div className="text-primary-200 text-sm">
          &copy; 2026 3Lines. All rights reserved.
        </div>
      </div>

      {/* Right side - Form */}
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
              <span className="text-xl font-heading font-bold text-body-dark">3Lines Onboarding</span>
            </div>
          </div>

          {/* ACCESS CODE STEP */}
          {step === 'access_code' && (
            <div className="card rounded-xl shadow-card p-8">
              <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
                  <svg className="h-8 w-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-heading font-bold text-primary-dark">Employee Onboarding</h2>
                <p className="mt-2 text-text-muted">Enter the access code provided by HR to get started</p>
              </div>

              {error && (
                <div className="alert-danger mb-6">
                  <div className="flex items-center">
                    <svg className="h-5 w-5 text-danger mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-sm text-danger-dark">{error}</span>
                  </div>
                </div>
              )}

              <form onSubmit={handleAccessCodeSubmit} className="space-y-5">
                <div>
                  <label htmlFor="accessCode" className="block text-sm font-medium text-body-dark mb-1.5">
                    Access Code
                  </label>
                  <input
                    id="accessCode"
                    type="password"
                    required
                    value={accessCode}
                    onChange={(e) => setAccessCode(e.target.value)}
                    className="input w-full"
                    placeholder="Enter the access code from HR"
                    autoFocus
                  />
                </div>
                <button type="submit" className="btn-primary w-full py-3 text-base font-medium">
                  Continue
                </button>
              </form>

              <div className="mt-6 pt-6 border-t border-border-light">
                <p className="text-center text-sm text-text-gray">
                  Don&apos;t have an access code? Contact your HR representative.
                </p>
              </div>
            </div>
          )}

          {/* DETAILS FORM STEP */}
          {step === 'details' && (
            <div className="card rounded-xl shadow-card p-8">
              <div className="text-center mb-6">
                <h2 className="text-2xl font-heading font-bold text-primary-dark">Your Information</h2>
                <p className="mt-2 text-text-muted">Fill in your details to create your corporate account</p>
              </div>

              {error && (
                <div className="alert-danger mb-6">
                  <div className="flex items-center">
                    <svg className="h-5 w-5 text-danger mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-sm text-danger-dark">{error}</span>
                  </div>
                </div>
              )}

              <form onSubmit={handleFormSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="firstName" className="block text-sm font-medium text-body-dark mb-1.5">
                      First Name <span className="text-danger">*</span>
                    </label>
                    <input
                      id="firstName"
                      type="text"
                      required
                      maxLength={64}
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className={`input w-full ${fieldErrors.firstName ? 'border-danger' : ''}`}
                      placeholder="First name"
                    />
                    {fieldErrors.firstName && (
                      <p className="mt-1 text-xs text-danger">{fieldErrors.firstName[0]}</p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="lastName" className="block text-sm font-medium text-body-dark mb-1.5">
                      Last Name <span className="text-danger">*</span>
                    </label>
                    <input
                      id="lastName"
                      type="text"
                      required
                      maxLength={64}
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className={`input w-full ${fieldErrors.lastName ? 'border-danger' : ''}`}
                      placeholder="Last name"
                    />
                    {fieldErrors.lastName && (
                      <p className="mt-1 text-xs text-danger">{fieldErrors.lastName[0]}</p>
                    )}
                  </div>
                </div>

                <div>
                  <label htmlFor="personalEmail" className="block text-sm font-medium text-body-dark mb-1.5">
                    Personal Email <span className="text-danger">*</span>
                  </label>
                  <input
                    id="personalEmail"
                    type="email"
                    required
                    value={personalEmail}
                    onChange={(e) => setPersonalEmail(e.target.value)}
                    className={`input w-full ${fieldErrors.personalEmail ? 'border-danger' : ''}`}
                    placeholder="your.email@gmail.com"
                  />
                  <p className="mt-1 text-xs text-text-muted">Your login credentials will be sent to this email</p>
                  {fieldErrors.personalEmail && (
                    <p className="mt-1 text-xs text-danger">{fieldErrors.personalEmail[0]}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="jobTitle" className="block text-sm font-medium text-body-dark mb-1.5">
                    Job Title
                  </label>
                  <input
                    id="jobTitle"
                    type="text"
                    maxLength={128}
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    className="input w-full"
                    placeholder="e.g. Software Engineer"
                  />
                </div>

                <div>
                  <label htmlFor="department" className="block text-sm font-medium text-body-dark mb-1.5">
                    Department
                  </label>
                  <select
                    id="department"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="input w-full"
                  >
                    <option value="">Select department...</option>
                    {DEPARTMENTS.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>

                <div className="pt-2 space-y-3">
                  <button type="submit" className="btn-primary w-full py-3 text-base font-medium">
                    Create My Account
                  </button>
                  <button
                    type="button"
                    onClick={() => { setStep('access_code'); setError(''); }}
                    className="w-full py-2 text-sm text-text-muted hover:text-primary transition-colors"
                  >
                    Back
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* SUBMITTING STEP */}
          {step === 'submitting' && (
            <div className="card rounded-xl shadow-card p-8 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-6">
                <svg className="h-8 w-8 text-primary animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
              <h2 className="text-2xl font-heading font-bold text-primary-dark mb-2">Setting up your account...</h2>
              <p className="text-text-muted">This may take a moment. Please don&apos;t close this page.</p>
              <div className="mt-6 space-y-2 text-sm text-text-muted">
                <p>Creating your corporate email...</p>
                <p>Setting up Microsoft 365...</p>
                <p>Sending your credentials...</p>
              </div>
            </div>
          )}

          {/* SUCCESS STEP */}
          {step === 'success' && result && (
            <div className="card rounded-xl shadow-card p-8">
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-success/10 mb-4">
                  <svg className="h-8 w-8 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-heading font-bold text-primary-dark">Account Created!</h2>
                <p className="mt-2 text-text-muted">Welcome aboard, {result.displayName}</p>
              </div>

              <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 mb-6">
                <div className="text-sm text-text-muted mb-1">Your corporate email</div>
                <div className="text-lg font-bold text-primary-dark font-mono">{result.userPrincipalName}</div>
              </div>

              {result.credentialsEmailed ? (
                <div className="bg-success/5 border border-success/20 rounded-lg p-4 mb-6">
                  <div className="flex items-start">
                    <svg className="h-5 w-5 text-success mt-0.5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <div>
                      <p className="text-sm font-medium text-success-dark">Credentials sent!</p>
                      <p className="text-sm text-success-dark mt-1">
                        Check your personal email inbox for your temporary password and login instructions.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-warning/5 border border-warning/20 rounded-lg p-4 mb-6">
                  <div className="flex items-start">
                    <svg className="h-5 w-5 text-warning mt-0.5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                    <div>
                      <p className="text-sm font-medium text-warning-dark">Email delivery pending</p>
                      <p className="text-sm text-warning-dark mt-1">
                        Your account was created but the credential email could not be sent. HR will send your credentials separately.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {result.warnings && result.warnings.length > 0 && (
                <div className="bg-warning/5 border border-warning/20 rounded-lg p-4 mb-6">
                  {result.warnings.map((w, i) => (
                    <p key={i} className="text-sm text-warning-dark">{w}</p>
                  ))}
                </div>
              )}

              <div className="space-y-3 text-sm text-text-muted">
                <h3 className="font-medium text-body-dark">Next Steps:</h3>
                <ol className="list-decimal list-inside space-y-2">
                  <li>Check your personal email for login credentials</li>
                  <li>Go to <a href="https://portal.office.com" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">portal.office.com</a> and sign in</li>
                  <li>Change your password when prompted</li>
                  <li>Set up multi-factor authentication if required</li>
                </ol>
              </div>

              <div className="mt-6 pt-6 border-t border-border-light">
                <p className="text-center text-sm text-text-gray">
                  Need help? Contact IT Support at <strong>it-support@3lines.com.sa</strong>
                </p>
              </div>
            </div>
          )}

          {/* ERROR STEP */}
          {step === 'error' && (
            <div className="card rounded-xl shadow-card p-8">
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-danger/10 mb-4">
                  <svg className="h-8 w-8 text-danger" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-heading font-bold text-primary-dark">Something went wrong</h2>
                <p className="mt-2 text-text-muted">{error}</p>
              </div>

              <div className="space-y-3">
                <button
                  onClick={() => { setStep('details'); setError(''); }}
                  className="btn-primary w-full py-3 text-base font-medium"
                >
                  Try Again
                </button>
                <button
                  onClick={() => { setStep('access_code'); setError(''); setAccessCode(''); }}
                  className="w-full py-2 text-sm text-text-muted hover:text-primary transition-colors"
                >
                  Start Over
                </button>
              </div>

              <div className="mt-6 pt-6 border-t border-border-light">
                <p className="text-center text-sm text-text-gray">
                  If the problem persists, contact IT Support at <strong>it-support@3lines.com.sa</strong>
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
