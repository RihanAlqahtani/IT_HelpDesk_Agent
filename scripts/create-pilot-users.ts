/**
 * Create Pilot Users Script
 *
 * Creates 4 pilot user accounts in Supabase with the 'employee' role.
 * Run once before pilot launch.
 *
 * Usage: npx tsx scripts/create-pilot-users.ts
 *
 * Prerequisites:
 *   - .env or .env.production with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
import { randomBytes } from 'crypto';

// Load environment variables
config({ path: resolve(process.cwd(), '.env.production') });
config({ path: resolve(process.cwd(), '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// =============================================================================
// PILOT USERS - Update these with real employee details before running
// =============================================================================
const pilotUsers = [
  { email: 'abdulrafay@3lines.com.sa', fullName: 'AbdulRafay', department: 'AI' },
  { email: 'rihan.alqahtani@3lines.com.sa', fullName: 'Rihan Abdullah', department: 'AI' },
  { email: 'Ab.shahzad@3lines.com.sa', fullName: 'Abdulrahman Shahzad', department: 'AI' },
  { email: 'kh.binsalman1@3lines.com.sa', fullName: 'Khaled Bin Salman', department: 'AI' },
];

function generatePassword(): string {
  // Generate a 12-char password: uppercase + lowercase + numbers + special
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const special = '!@#$%&*';
  let password = '';
  const bytes = randomBytes(12);
  for (let i = 0; i < 10; i++) {
    password += chars[bytes[i] % chars.length];
  }
  // Ensure at least one special char and one digit
  password += special[bytes[10] % special.length];
  password += String(bytes[11] % 10);
  return password;
}

async function main() {
  console.log('========================================');
  console.log('IT HelpDesk Agent - Pilot User Creation');
  console.log('========================================\n');

  // Step 1: Get the 'employee' role ID
  const { data: roleData, error: roleError } = await supabase
    .from('it_roles')
    .select('id')
    .eq('name', 'employee')
    .single();

  if (roleError || !roleData) {
    console.error('ERROR: Could not find employee role:', roleError?.message);
    process.exit(1);
  }

  const employeeRoleId = roleData.id;
  console.log(`Employee role ID: ${employeeRoleId}\n`);

  const results: Array<{ email: string; password: string; success: boolean; error?: string }> = [];

  for (const user of pilotUsers) {
    console.log(`Creating user: ${user.email}...`);

    const password = generatePassword();

    // Create auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: user.email,
      password,
      email_confirm: true, // Auto-confirm, no email verification needed
    });

    if (authError) {
      console.error(`  FAILED (auth): ${authError.message}`);
      results.push({ email: user.email, password: '', success: false, error: authError.message });
      continue;
    }

    const userId = authData.user.id;

    // Create it_users profile
    const { error: profileError } = await supabase.from('it_users').insert({
      id: userId,
      email: user.email,
      full_name: user.fullName,
      department: user.department,
      role_id: employeeRoleId,
      is_active: true,
    });

    if (profileError) {
      console.error(`  FAILED (profile): ${profileError.message}`);
      // Clean up auth user if profile creation fails
      await supabase.auth.admin.deleteUser(userId);
      results.push({ email: user.email, password: '', success: false, error: profileError.message });
      continue;
    }

    console.log(`  SUCCESS: ${user.fullName} (${user.department})`);
    results.push({ email: user.email, password, success: true });
  }

  // Summary
  console.log('\n========================================');
  console.log('PILOT USER CREDENTIALS');
  console.log('Distribute securely to each user');
  console.log('========================================\n');

  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  if (successful.length > 0) {
    console.log('Portal URL: https://helpdesk.ai3lines.com\n');
    for (const r of successful) {
      console.log(`Email:    ${r.email}`);
      console.log(`Password: ${r.password}`);
      console.log('---');
    }
  }

  if (failed.length > 0) {
    console.log('\nFAILED:');
    for (const r of failed) {
      console.log(`  ${r.email}: ${r.error}`);
    }
  }

  console.log(`\nTotal: ${successful.length} created, ${failed.length} failed`);
  console.log('\nIMPORTANT: Save these passwords securely. They cannot be retrieved later.');
}

main().catch(console.error);
