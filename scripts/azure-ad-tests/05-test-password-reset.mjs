#!/usr/bin/env node
/**
 * Test 5: Password Reset (TEST USER ONLY)
 *
 * RISK LEVEL: Medium (modifies user account)
 * PURPOSE: Verify password reset capability works
 *
 * SAFETY MEASURES:
 * 1. Requires explicit test user email in environment
 * 2. Email must contain "test" (case-insensitive)
 * 3. User must NOT be an admin
 * 4. Requires manual confirmation before execution
 * 5. Generates a secure temporary password
 *
 * Run: node scripts/azure-ad-tests/05-test-password-reset.mjs
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { createInterface } from 'readline';

config({ path: resolve(process.cwd(), '.env') });

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║        TEST 5: Password Reset (TEST USER ONLY)               ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

console.log('⚠️  WARNING: This test will CHANGE a user password!');
console.log('   Only proceed if you have a dedicated test user.\n');

// Helper: Generate secure temporary password
function generateTempPassword() {
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lower = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const special = '!@#$%^&*';
  const all = upper + lower + numbers + special;

  let password = '';
  // Ensure at least one of each type
  password += upper[Math.floor(Math.random() * upper.length)];
  password += lower[Math.floor(Math.random() * lower.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += special[Math.floor(Math.random() * special.length)];

  // Fill rest with random characters
  for (let i = 4; i < 16; i++) {
    password += all[Math.floor(Math.random() * all.length)];
  }

  // Shuffle the password
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

// Helper: Prompt for confirmation
function prompt(question) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

async function getAccessToken() {
  const response = await fetch(
    `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.AZURE_CLIENT_ID,
        client_secret: process.env.AZURE_CLIENT_SECRET,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      }),
    }
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data.error_description);
  return data.access_token;
}

async function callGraphAPI(endpoint, token, options = {}) {
  const response = await fetch(`https://graph.microsoft.com/v1.0${endpoint}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    ...options,
  });

  let data;
  const text = await response.text();
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { rawResponse: text };
  }

  return { status: response.status, ok: response.ok, data };
}

try {
  // SAFETY CHECK 1: Require test user email
  const testUserEmail = process.env.AZURE_TEST_USER_2_EMAIL || process.env.AZURE_TEST_USER_EMAIL;

  if (!testUserEmail) {
    console.error('❌ No test user email configured');
    console.error('\n   Add AZURE_TEST_USER_2_EMAIL to your .env file:');
    console.error('   AZURE_TEST_USER_2_EMAIL=testuser2@yourdomain.onmicrosoft.com');
    process.exit(1);
  }

  // SAFETY CHECK 2: Email must contain "test"
  if (!testUserEmail.toLowerCase().includes('test')) {
    console.error('❌ SAFETY BLOCK: Email does not contain "test"');
    console.error(`   Email: ${testUserEmail}`);
    console.error('\n   This safety check prevents accidental password resets on real users.');
    console.error('   Use a test user with "test" in the email address.');
    process.exit(1);
  }

  console.log(`Target user: ${testUserEmail}\n`);

  // Step 1: Get token and verify user exists
  console.log('Step 1: Obtaining access token...');
  const token = await getAccessToken();
  console.log('✅ Token obtained\n');

  console.log('─────────────────────────────────────────────────────────────────');
  console.log('Step 2: Verifying user exists and is safe to test...\n');

  const encodedEmail = encodeURIComponent(testUserEmail);
  const userResult = await callGraphAPI(`/users/${encodedEmail}?$select=id,displayName,userPrincipalName,accountEnabled`, token);

  if (!userResult.ok) {
    console.error('❌ User not found');
    console.error(`   Status: ${userResult.status}`);
    process.exit(1);
  }

  const user = userResult.data;
  console.log('   User found:');
  console.log(`   - ID: ${user.id}`);
  console.log(`   - Name: ${user.displayName}`);
  console.log(`   - Email: ${user.userPrincipalName}`);
  console.log(`   - Enabled: ${user.accountEnabled}`);

  // SAFETY CHECK 3: Check if user is an admin
  console.log('\n   Checking for admin roles...');

  const rolesResult = await callGraphAPI(`/users/${user.id}/memberOf?$select=displayName`, token);

  if (rolesResult.ok) {
    const adminRoles = rolesResult.data.value?.filter(r =>
      r.displayName?.toLowerCase().includes('admin') ||
      r.displayName?.toLowerCase().includes('global')
    );

    if (adminRoles && adminRoles.length > 0) {
      console.error('\n❌ SAFETY BLOCK: User has admin role(s)!');
      console.error('   Admin roles found:');
      adminRoles.forEach(r => console.error(`   - ${r.displayName}`));
      console.error('\n   NEVER reset passwords for admin accounts via automation.');
      process.exit(1);
    }

    console.log('   ✅ No admin roles detected');
  }

  // SAFETY CHECK 4: Manual confirmation
  console.log('\n─────────────────────────────────────────────────────────────────');
  console.log('Step 3: Manual Confirmation Required\n');

  console.log('   You are about to reset the password for:');
  console.log(`   ${user.displayName} (${user.userPrincipalName})`);
  console.log('\n   The user will need to sign in with a new temporary password.');
  console.log('   They will be forced to change it on next login.\n');

  const answer = await prompt('   Type "reset" to proceed, or anything else to abort: ');

  if (answer !== 'reset') {
    console.log('\n   ✅ Aborted. No changes made.');
    process.exit(0);
  }

  // Step 4: Perform password reset
  console.log('\n─────────────────────────────────────────────────────────────────');
  console.log('Step 4: Performing password reset...\n');

  const tempPassword = generateTempPassword();

  const resetResult = await callGraphAPI(
    `/users/${user.id}`,
    token,
    {
      method: 'PATCH',
      body: JSON.stringify({
        passwordProfile: {
          password: tempPassword,
          forceChangePasswordNextSignIn: true,
        },
      }),
    }
  );

  if (resetResult.ok || resetResult.status === 204) {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('✅ PASSWORD RESET SUCCESSFUL');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
    console.log(`   User: ${user.displayName}`);
    console.log(`   Email: ${user.userPrincipalName}`);
    console.log(`   Temporary Password: ${tempPassword}`);
    console.log('');
    console.log('   ⚠️  User must change password on next sign-in');
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
    console.log('📝 AUDIT LOG:');
    console.log(`   Timestamp: ${new Date().toISOString()}`);
    console.log(`   Action: PASSWORD_RESET`);
    console.log(`   Target: ${user.id}`);
    console.log(`   Result: SUCCESS`);
    console.log('');
    console.log('Next: Run 06-test-disable-enable.mjs to test account disable/enable');
  } else {
    console.error('❌ Password reset failed');
    console.error(`   Status: ${resetResult.status}`);
    console.error(`   Error: ${JSON.stringify(resetResult.data, null, 2)}`);

    if (resetResult.status === 403) {
      console.error('\n   Possible causes:');
      console.error('   - UserAuthenticationMethod.ReadWrite.All permission not granted');
      console.error('   - User is protected (admin, directory sync, etc.)');
    }

    process.exit(1);
  }

} catch (error) {
  console.error('❌ Test failed:', error.message);
  process.exit(1);
}
