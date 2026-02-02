#!/usr/bin/env node
/**
 * Test 3: Read Specific Test User
 *
 * RISK LEVEL: Low (read-only operation)
 * PURPOSE: Verify we can read user details by email
 *
 * REQUIRES: AZURE_TEST_USER_EMAIL environment variable
 *
 * Run: node scripts/azure-ad-tests/03-test-read-user.mjs
 */

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env') });

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║              TEST 3: Read Specific Test User                 ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

// Safety check: Require test user email
const testUserEmail = process.env.AZURE_TEST_USER_EMAIL;

if (!testUserEmail) {
  console.error('❌ AZURE_TEST_USER_EMAIL not set in .env file');
  console.error('\n   This is a safety measure to prevent accidentally querying real users.');
  console.error('   Add this to your .env file:');
  console.error('   AZURE_TEST_USER_EMAIL=testuser1@yourdomain.onmicrosoft.com');
  process.exit(1);
}

// Safety check: Warn if email doesn't look like a test user
if (!testUserEmail.toLowerCase().includes('test')) {
  console.warn('⚠️  WARNING: Email does not contain "test"');
  console.warn(`   Email: ${testUserEmail}`);
  console.warn('   Are you sure this is a test user?\n');
  console.warn('   Press Ctrl+C within 5 seconds to abort...\n');
  await new Promise(resolve => setTimeout(resolve, 5000));
}

console.log(`Target test user: ${testUserEmail}\n`);

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

async function callGraphAPI(endpoint, token) {
  const response = await fetch(`https://graph.microsoft.com/v1.0${endpoint}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  return { status: response.status, ok: response.ok, data: await response.json() };
}

try {
  console.log('Step 1: Obtaining access token...');
  const token = await getAccessToken();
  console.log('✅ Token obtained\n');

  // Step 2: Read user by email (userPrincipalName)
  console.log('─────────────────────────────────────────────────────────────────');
  console.log('Step 2: Reading user by email...\n');

  // URL encode the email for the API call
  const encodedEmail = encodeURIComponent(testUserEmail);
  const userResult = await callGraphAPI(`/users/${encodedEmail}`, token);

  if (userResult.ok) {
    const user = userResult.data;
    console.log('✅ User found:');
    console.log('─────────────────────────────────────────────────────────────────');
    console.log(`   ID:                 ${user.id}`);
    console.log(`   Display Name:       ${user.displayName}`);
    console.log(`   User Principal:     ${user.userPrincipalName}`);
    console.log(`   Email:              ${user.mail || '(not set)'}`);
    console.log(`   Job Title:          ${user.jobTitle || '(not set)'}`);
    console.log(`   Department:         ${user.department || '(not set)'}`);
    console.log(`   Office Location:    ${user.officeLocation || '(not set)'}`);
    console.log(`   Account Enabled:    ${user.accountEnabled}`);
    console.log(`   Created:            ${user.createdDateTime || '(not available)'}`);
    console.log('─────────────────────────────────────────────────────────────────');

    // Store user ID for next tests
    console.log('\n📝 Save this user ID for password reset test:');
    console.log(`   USER_ID=${user.id}`);

  } else if (userResult.status === 404) {
    console.log('❌ User not found');
    console.log(`   Email: ${testUserEmail}`);
    console.log('\n   Possible causes:');
    console.log('   - User does not exist in Azure AD');
    console.log('   - Email is misspelled');
    console.log('   - User was deleted');
    process.exit(1);
  } else {
    console.log('❌ Error reading user');
    console.log(`   Status: ${userResult.status}`);
    console.log(`   Error: ${userResult.data.error?.message}`);
    process.exit(1);
  }

  // Step 3: Read limited fields (as we would in production)
  console.log('\nStep 3: Testing limited field selection...\n');

  const limitedResult = await callGraphAPI(
    `/users/${encodedEmail}?$select=id,displayName,userPrincipalName,accountEnabled`,
    token
  );

  if (limitedResult.ok) {
    console.log('✅ Limited field selection works:');
    console.log(`   Fields returned: ${Object.keys(limitedResult.data).join(', ')}`);
    console.log('\n   This is the recommended approach for production:');
    console.log('   - Only request fields you need');
    console.log('   - Reduces data exposure');
    console.log('   - Faster API responses');
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('✅ TEST PASSED: User read operations working');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('\nNext: Run 04-test-list-users.mjs to test listing users (with limits)');

} catch (error) {
  console.error('❌ Test failed:', error.message);
  process.exit(1);
}
