/**
 * Environment Configuration
 *
 * Loads and validates all environment variables.
 * Fails fast if required variables are missing.
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { z } from 'zod';

// Load .env from project root (2 levels up from apps/api/src)
config({ path: resolve(process.cwd(), '../../.env') });
// Also try loading from current directory for Docker/production
config({ path: resolve(process.cwd(), '.env') });

const envSchema = z.object({
  // Node
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // API Server
  API_PORT: z.string().transform(Number).default('3001'),
  API_BASE_URL: z.string().url().optional(),

  // Supabase
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // Private LLM
  LLM_ENDPOINT: z.string().url(),
  LLM_API_KEY: z.string().min(1),
  LLM_MODEL: z.string().default('default'),
  LLM_MAX_TOKENS: z.string().transform(Number).default('4096'),
  LLM_TEMPERATURE: z.string().transform(Number).default('0.3'),
  LLM_TIMEOUT_MS: z.string().transform(Number).default('30000'),

  // Security
  JWT_SECRET: z.string().min(32),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  RATE_LIMIT_WINDOW_MS: z.string().transform(Number).default('60000'),
  RATE_LIMIT_MAX_REQUESTS: z.string().transform(Number).default('100'),

  // Logging
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  AUDIT_LOG_RETENTION_DAYS: z.string().transform(Number).default('365'),
  PII_REDACTION_ENABLED: z.string().transform((v) => v === 'true').default('true'),

  // Feature Flags
  FEATURE_PRIVILEGED_ACTIONS: z.string().transform((v) => v === 'true').default('false'),
  FEATURE_APPROVAL_WORKFLOWS: z.string().transform((v) => v === 'true').default('false'),
  FEATURE_EMAIL_ESCALATION: z.string().transform((v) => v === 'true').default('false'),

  // Azure AD / Microsoft 365 (Optional - only required if FEATURE_PRIVILEGED_ACTIONS is enabled)
  AZURE_TENANT_ID: z.string().optional(),
  AZURE_CLIENT_ID: z.string().optional(),
  AZURE_CLIENT_SECRET: z.string().optional(),
  GRAPH_API_ENDPOINT: z.string().url().default('https://graph.microsoft.com/v1.0'),

  // Azure AD User / Domain Configuration
  AZURE_USER_DOMAIN: z.string().default('3lines.com.sa'),
  AZURE_DEFAULT_USAGE_LOCATION: z.string().default('SA'),
  AZURE_DEFAULT_LICENSE_SKU: z.string().default('O365_BUSINESS_PREMIUM'),

  // HR Onboarding Configuration
  HR_ONBOARDING_ACCESS_CODE: z.string().min(10, 'HR onboarding access code must be at least 10 characters'),
  HR_CREDENTIAL_SENDER_EMAIL: z.string().email().optional(),
  HR_CREDENTIAL_SENDER_USER_ID: z.string().optional(),
});

function loadEnv() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('Environment validation failed:');
    console.error(result.error.format());
    process.exit(1);
  }

  return result.data;
}

export const env = loadEnv();

/**
 * Check if running in production
 */
export function isProduction(): boolean {
  return env.NODE_ENV === 'production';
}

/**
 * Check if running in development
 */
export function isDevelopment(): boolean {
  return env.NODE_ENV === 'development';
}

/**
 * Check if privileged actions are enabled
 */
export function arePrivilegedActionsEnabled(): boolean {
  return env.FEATURE_PRIVILEGED_ACTIONS;
}

/**
 * Check if Azure AD is configured
 */
export function isAzureADConfigured(): boolean {
  return !!(env.AZURE_TENANT_ID && env.AZURE_CLIENT_ID && env.AZURE_CLIENT_SECRET);
}

/**
 * Get Azure AD configuration (throws if not configured)
 */
export function getAzureADConfig() {
  if (!isAzureADConfigured()) {
    throw new Error('Azure AD is not configured. Set AZURE_TENANT_ID, AZURE_CLIENT_ID, and AZURE_CLIENT_SECRET.');
  }
  return {
    tenantId: env.AZURE_TENANT_ID!,
    clientId: env.AZURE_CLIENT_ID!,
    clientSecret: env.AZURE_CLIENT_SECRET!,
    graphEndpoint: env.GRAPH_API_ENDPOINT,
  };
}
