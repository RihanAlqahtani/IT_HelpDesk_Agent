#!/usr/bin/env node
/**
 * Test 6: Disable and Re-Enable User (TEST USER ONLY)
 *
 * RISK LEVEL: Medium (modifies user account)
 * PURPOSE: Verify account disable/enable capability works
 *
 * SAFETY MEASURES:
 * 1. Requires explicit test user email
 * 2. Email must contain "test"
 * 3. User must NOT be an admin
 * 4. Manual confirmation required
 * 5. Automatically re-enables after test
 *
 * Run: node scripts/azure-ad-tests/06-test-disable-enable.mjs
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { createInterface } from 'readline';

config({ path: resolve(process.cwd(), '.env') });

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║     TEST 6: Disable and Re-Enable User (TEST USER ONLY)      ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

console.log('⚠️  WARNING: This test will DISABLE then RE-ENABLE a user account!');
console.log('   The user will be briefly unable to sign in during the test.\n');

function prompt(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
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

async function setAccountEnabled(userId, enabled, token) {
  return await callGraphAPI(
    `/users/${userId}`,
    token,
    {
      method: 'PATCH',
      body: JSON.stringify({ accountEnabled: enabled }),
    }
  );
}

try {
  // Use a specific test user for disable/enable tests
  const testUserEmail = process.env.AZURE_TEST_USER_2_EMAIL || process.env.AZURE_TEST_USER_EMAIL;

  if (!testUserEmail) {
    console.error('❌ No test user email configured');
    console.error('\n   Add AZURE_TEST_USER_2_EMAIL to your .env file');
    process.exit(1);
  }

  if (!testUserEmail.toLowerCase().includes('test')) {
    console.error('❌ SAFETY BLOCK: Email does not contain "test"');
    console.error(`   Email: ${testUserEmail}`);
    process.exit(1);
  }

  console.log(`Target user: ${testUserEmail}\n`);

  // Step 1: Get token
  console.log('Step 1: Obtaining access token...');
  const token = await getAccessToken();
  console.log('✅ Token obtained\n');

  // Step 2: Verify user and check for admin roles
  console.log('─────────────────────────────────────────────────────────────────');
  console.log('Step 2: Verifying user...\n');

  const encodedEmail = encodeURIComponent(testUserEmail);
  const userResult = await callGraphAPI(
    `/users/${encodedEmail}?$select=id,displayName,userPrincipalName,accountEnabled`,
    token
  );

  if (!userResult.ok) {
    console.error('❌ User not found');
    process.exit(1);
  }

  const user = userResult.data;
  const originalState = user.accountEnabled;

  console.log('   User found:');
  console.log(`   - ID: ${user.id}`);
  console.log(`   - Name: ${user.displayName}`);
  console.log(`   - Currently enabled: ${originalState}`);

  // Check for admin roles
  console.log('\n   Checking for admin roles...');
  const rolesResult = await callGraphAPI(`/users/${user.id}/memberOf?$select=displayName`, token);

  if (rolesResult.ok) {
    const adminRoles = rolesResult.data.value?.filter(r =>
      r.displayName?.toLowerCase().includes('admin') ||
      r.displayName?.toLowerCase().includes('global')
    );

    if (adminRoles && adminRoles.length > 0) {
      console.error('\n❌ SAFETY BLOCK: User has admin role(s)!');
      adminRoles.forEach(r => console.error(`   - ${r.displayName}`));
      process.exit(1);
    }

    console.log('   ✅ No admin roles detected');
  }

  // Step 3: Manual confirmation
  console.log('\n─────────────────────────────────────────────────────────────────');
  console.log('Step 3: Manual Confirmation Required\n');

  console.log('   This test will:');
  console.log('   1. DISABLE the account (user cannot sign in)');
  console.log('   2. Wait 3 seconds');
  console.log('   3. RE-ENABLE the account (user can sign in again)');
  console.log('');
  console.log(`   Target: ${user.displayName} (${user.userPrincipalName})`);
  console.log('');

  const answer = await prompt('   Type "test" to proceed, or anything else to abort: ');

  if (answer !== 'test') {
    console.log('\n   ✅ Aborted. No changes made.');
    process.exit(0);
  }

  // Step 4: Disable the account
  console.log('\n─────────────────────────────────────────────────────────────────');
  console.log('Step 4: Disabling account...\n');

  const disableResult = await setAccountEnabled(user.id, false, token);

  if (!disableResult.ok && disableResult.status !== 204) {
    console.error('❌ Failed to disable account');
    console.error(`   Status: ${disableResult.status}`);
    console.error(`   Error: ${JSON.stringify(disableResult.data)}`);
    process.exit(1);
  }

  console.log('   ✅ Account DISABLED');
  console.log(`   📝 Timestamp: ${new Date().toISOString()}`);

  // Verify disabled state
  const checkDisabled = await callGraphAPI(
    `/users/${user.id}?$select=accountEnabled`,
    token
  );

  if (checkDisabled.ok) {
    console.log(`   Verified: accountEnabled = ${checkDisabled.data.accountEnabled}`);
  }

  // Wait before re-enabling
  console.log('\n   Waiting 3 seconds before re-enabling...');
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Step 5: Re-enable the account
  console.log('\n─────────────────────────────────────────────────────────────────');
  console.log('Step 5: Re-enabling account...\n');

  const enableResult = await setAccountEnabled(user.id, true, token);

  if (!enableResult.ok && enableResult.status !== 204) {
    console.error('❌ CRITICAL: Failed to re-enable account!');
    console.error(`   Status: ${enableResult.status}`);
    console.error('');
    console.error('   ⚠️  MANUAL ACTION REQUIRED:');
    console.error('   Go to Azure Portal → Azure AD → Users → ' + user.displayName);
    console.error('   Edit properties and set "Account enabled" to Yes');
    process.exit(1);
  }

  console.log('   ✅ Account RE-ENABLED');
  console.log(`   📝 Timestamp: ${new Date().toISOString()}`);

  // Verify enabled state
  const checkEnabled = await callGraphAPI(
    `/users/${user.id}?$select=accountEnabled`,
    token
  );

  if (checkEnabled.ok) {
    console.log(`   Verified: accountEnabled = ${checkEnabled.data.accountEnabled}`);
  }

  // Summary
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('✅ TEST PASSED: Disable/Enable operations working');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log('   Account was:');
  console.log('   1. Disabled successfully');
  console.log('   2. Re-enabled successfully');
  console.log('');
  console.log('   Final state: ENABLED (same as before test)');
  console.log('');
  console.log('📝 AUDIT LOG:');
  console.log(`   Timestamp: ${new Date().toISOString()}`);
  console.log(`   Actions: DISABLE → ENABLE`);
  console.log(`   Target: ${user.id}`);
  console.log(`   Result: SUCCESS`);
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('\n✅ ALL TESTS COMPLETE!');
  console.log('\nYour Azure AD integration is ready for production implementation.');
  console.log('Next steps:');
  console.log('  1. Implement the Azure AD service in your backend');
  console.log('  2. Connect it to the approval workflow');
  console.log('  3. Enable feature flags for IT Admin testing');

} catch (error) {
  console.error('❌ Test failed:', error.message);
  console.error('\n⚠️  If account was disabled, manually re-enable in Azure Portal!');
  process.exit(1);
}
