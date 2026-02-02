/**
 * Supabase Client Configuration
 *
 * Creates and exports Supabase clients for different use cases:
 * - supabaseClient: For user-authenticated requests (uses anon key)
 * - supabaseAdmin: For service operations (uses service role key)
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from './env.js';

/**
 * Public Supabase client for user-authenticated requests.
 * This client respects RLS policies.
 */
export const supabaseClient = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: false,
  },
});

/**
 * Admin Supabase client for service operations.
 * This client bypasses RLS - use with caution!
 * Only use for:
 * - Audit logging
 * - System operations
 * - Background jobs
 */
export const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

/**
 * Create a Supabase client with user's JWT token.
 * Used for requests that need to respect the user's permissions.
 */
export function createUserClient(accessToken: string): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}
