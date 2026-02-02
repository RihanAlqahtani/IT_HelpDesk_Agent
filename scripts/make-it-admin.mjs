#!/usr/bin/env node
/**
 * Script to upgrade a user to IT Admin role
 * Usage: node scripts/make-it-admin.mjs [email]
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '..', '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function listUsers() {
  console.log('\n📋 Current Users:\n');

  const { data, error } = await supabase
    .from('it_users')
    .select(`
      email,
      full_name,
      department,
      it_roles (name)
    `)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching users:', error.message);
    return [];
  }

  if (!data || data.length === 0) {
    console.log('No users found in the system.');
    return [];
  }

  data.forEach((user, i) => {
    const roleName = user.it_roles?.name || 'unknown';
    console.log(`${i + 1}. ${user.email}`);
    console.log(`   Name: ${user.full_name}`);
    console.log(`   Role: ${roleName}`);
    console.log(`   Dept: ${user.department || 'N/A'}`);
    console.log('');
  });

  return data;
}

async function upgradeToAdmin(email) {
  console.log(`\n🔄 Upgrading ${email} to IT Admin...\n`);

  // Get the it_admin role ID
  const { data: roleData, error: roleError } = await supabase
    .from('it_roles')
    .select('id')
    .eq('name', 'it_admin')
    .single();

  if (roleError || !roleData) {
    console.error('Error: Could not find it_admin role');
    return false;
  }

  // Update the user's role
  const { data, error } = await supabase
    .from('it_users')
    .update({ role_id: roleData.id })
    .eq('email', email)
    .select('email, full_name')
    .single();

  if (error) {
    console.error('Error upgrading user:', error.message);
    return false;
  }

  if (!data) {
    console.error(`Error: No user found with email ${email}`);
    return false;
  }

  console.log(`✅ Successfully upgraded ${data.full_name} (${data.email}) to IT Admin!`);
  console.log('\n👉 Log out and log back in to see the admin dashboard.');
  console.log('👉 Navigate to /admin/tickets to view all tickets.\n');
  return true;
}

async function main() {
  const emailArg = process.argv[2];

  // List all users first
  const users = await listUsers();

  if (emailArg) {
    // Upgrade specified user
    await upgradeToAdmin(emailArg);
  } else if (users.length > 0) {
    console.log('─'.repeat(50));
    console.log('\nTo upgrade a user to IT Admin, run:');
    console.log(`  node scripts/make-it-admin.mjs <email>\n`);
    console.log('Example:');
    console.log(`  node scripts/make-it-admin.mjs ${users[0].email}\n`);
  }
}

main().catch(console.error);
