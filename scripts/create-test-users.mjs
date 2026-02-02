#!/usr/bin/env node
/**
 * Script to create test users for the IT Helpdesk system
 * Usage: node scripts/create-test-users.mjs
 *
 * Creates:
 * - employee@test.local (Employee role) - for testing user experience
 * - itadmin@test.local (IT Admin role) - for testing admin experience
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '..', '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const TEST_USERS = [
  {
    email: 'employee@test.local',
    password: 'TestPassword123!',
    fullName: 'Test Employee',
    department: 'Sales',
    role: 'employee',
  },
  {
    email: 'itadmin@test.local',
    password: 'TestPassword123!',
    fullName: 'IT Administrator',
    department: 'IT',
    role: 'it_admin',
  },
];

async function createUser(user) {
  console.log(`\nCreating user: ${user.email}...`);

  // Check if user already exists
  const { data: existingUser } = await supabase
    .from('it_users')
    .select('email')
    .eq('email', user.email)
    .single();

  if (existingUser) {
    console.log(`  ⏭️  User ${user.email} already exists, skipping.`);
    return true;
  }

  // Create auth user
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: user.email,
    password: user.password,
    email_confirm: true, // Auto-confirm email
  });

  if (authError) {
    // If user exists in auth but not in it_users, we can still create the profile
    if (!authError.message.includes('already')) {
      console.error(`  ❌ Failed to create auth user: ${authError.message}`);
      return false;
    }
  }

  const userId = authData?.user?.id;
  if (!userId) {
    console.error(`  ❌ Could not get user ID`);
    return false;
  }

  // Get role ID
  const { data: roleData, error: roleError } = await supabase
    .from('it_roles')
    .select('id')
    .eq('name', user.role)
    .single();

  if (roleError || !roleData) {
    console.error(`  ❌ Could not find role: ${user.role}`);
    return false;
  }

  // Create user profile
  const { error: profileError } = await supabase.from('it_users').insert({
    id: userId,
    email: user.email,
    full_name: user.fullName,
    department: user.department,
    role_id: roleData.id,
    is_active: true,
  });

  if (profileError) {
    console.error(`  ❌ Failed to create user profile: ${profileError.message}`);
    return false;
  }

  console.log(`  ✅ Created ${user.fullName} (${user.email})`);
  console.log(`     Role: ${user.role}`);
  console.log(`     Password: ${user.password}`);
  return true;
}

async function main() {
  console.log('🔧 Creating Test Users for IT Helpdesk\n');
  console.log('═'.repeat(50));

  for (const user of TEST_USERS) {
    await createUser(user);
  }

  console.log('\n' + '═'.repeat(50));
  console.log('\n📋 Test Credentials:\n');

  for (const user of TEST_USERS) {
    console.log(`${user.role === 'employee' ? '👤' : '🔧'} ${user.fullName}`);
    console.log(`   Email:    ${user.email}`);
    console.log(`   Password: ${user.password}`);
    console.log(`   Role:     ${user.role}`);
    console.log('');
  }

  console.log('─'.repeat(50));
  console.log('\nTo test the system:');
  console.log('1. Log in as employee@test.local to create tickets');
  console.log('2. Log in as itadmin@test.local to view admin dashboard\n');
}

main().catch(console.error);
