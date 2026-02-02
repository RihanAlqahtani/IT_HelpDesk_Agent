#!/usr/bin/env node
/**
 * Check users and their roles
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

async function main() {
  console.log('Checking users and roles...\n');

  // Get all users with their roles
  const { data: users, error } = await supabase
    .from('it_users')
    .select('id, email, full_name, department, it_roles(id, name)');

  if (error) {
    console.error('Error fetching users:', error);
    process.exit(1);
  }

  console.log('Users:');
  console.log('─'.repeat(60));

  for (const user of users) {
    const roleName = Array.isArray(user.it_roles)
      ? user.it_roles[0]?.name
      : user.it_roles?.name;

    console.log(`Email: ${user.email}`);
    console.log(`  Name: ${user.full_name}`);
    console.log(`  Role: ${roleName || 'unknown'}`);
    console.log(`  Department: ${user.department || 'N/A'}`);
    console.log('');
  }

  // Also check roles table
  const { data: roles } = await supabase.from('it_roles').select('*');
  console.log('\nAvailable Roles:');
  console.log('─'.repeat(60));
  for (const role of roles || []) {
    console.log(`  ${role.name} (ID: ${role.id})`);
  }

  // Check role permissions
  console.log('\n\nRole Permissions:');
  console.log('─'.repeat(60));

  const { data: rolePerms } = await supabase
    .from('it_role_permissions')
    .select('it_roles(name), it_permissions(name, is_privileged, is_enabled)');

  const byRole = {};
  for (const rp of rolePerms || []) {
    const roleName = rp.it_roles?.name || 'unknown';
    if (!byRole[roleName]) byRole[roleName] = [];
    byRole[roleName].push(rp.it_permissions);
  }

  for (const [role, perms] of Object.entries(byRole)) {
    console.log(`\n${role}:`);
    for (const p of perms) {
      console.log(`  - ${p.name} ${p.is_enabled ? '(enabled)' : '(disabled)'}`);
    }
  }
}

main().catch(console.error);
