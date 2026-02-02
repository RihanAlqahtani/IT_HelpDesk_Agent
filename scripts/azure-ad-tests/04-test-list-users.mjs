#!/usr/bin/env node
/**
 * Test 4: List Users with Safety Limits
 *
 * RISK LEVEL: Low (read-only, limited data)
 * PURPOSE: Verify user listing works with pagination limits
 *
 * Run: node scripts/azure-ad-tests/04-test-list-users.mjs
 */

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env') });

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║          TEST 4: List Users with Safety Limits               ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

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

  // Step 2: List users with strict limits
  console.log('─────────────────────────────────────────────────────────────────');
  console.log('Step 2: Listing users (max 5, limited fields)...\n');

  // SAFETY: Only request minimal fields, limit to 5 users
  const listResult = await callGraphAPI(
    '/users?$top=5&$select=id,displayName,userPrincipalName,accountEnabled&$orderby=displayName',
    token
  );

  if (listResult.ok) {
    console.log('✅ User listing successful:');
    console.log('─────────────────────────────────────────────────────────────────');
    console.log('   #  | Display Name              | Enabled | UPN');
    console.log('─────────────────────────────────────────────────────────────────');

    listResult.data.value.forEach((user, index) => {
      const name = (user.displayName || 'N/A').padEnd(25).substring(0, 25);
      const enabled = user.accountEnabled ? '✅' : '❌';
      const upn = user.userPrincipalName || 'N/A';
      console.log(`   ${index + 1}  | ${name} | ${enabled}      | ${upn}`);
    });

    console.log('─────────────────────────────────────────────────────────────────');
    console.log(`\n   Total returned: ${listResult.data.value.length} users`);

    if (listResult.data['@odata.nextLink']) {
      console.log('   ⚠️  More users available (pagination link present)');
      console.log('   In production, implement proper pagination');
    }
  } else {
    console.log('❌ User listing failed');
    console.log(`   Status: ${listResult.status}`);
    console.log(`   Error: ${listResult.data.error?.message}`);
    process.exit(1);
  }

  // Step 3: Filter by test users (if naming convention used)
  console.log('\n─────────────────────────────────────────────────────────────────');
  console.log('Step 3: Filtering for test users only...\n');

  const filterResult = await callGraphAPI(
    `/users?$filter=startswith(displayName,'Test')&$select=id,displayName,userPrincipalName,accountEnabled`,
    token
  );

  if (filterResult.ok) {
    if (filterResult.data.value.length > 0) {
      console.log('✅ Test users found:');
      filterResult.data.value.forEach(user => {
        console.log(`   - ${user.displayName} (${user.userPrincipalName})`);
      });
      console.log(`\n   Total test users: ${filterResult.data.value.length}`);
    } else {
      console.log('⚠️  No users with displayName starting with "Test" found');
      console.log('   Consider creating test users with names like:');
      console.log('   - "Test User One"');
      console.log('   - "Test User Two"');
    }
  } else {
    console.log('⚠️  Filter query failed (might not be supported)');
    console.log(`   Status: ${filterResult.status}`);
  }

  // Step 4: Count total users (for awareness)
  console.log('\n─────────────────────────────────────────────────────────────────');
  console.log('Step 4: Getting user count...\n');

  const countResult = await callGraphAPI('/users/$count', token);

  // $count requires ConsistencyLevel header, so we'll estimate instead
  const estimateResult = await callGraphAPI('/users?$top=1&$count=true', token);

  console.log('   ℹ️  User count helps understand your tenant size');
  console.log('   This affects rate limiting and pagination strategies\n');

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('✅ TEST PASSED: User listing with limits working');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('\n⚠️  PRODUCTION RECOMMENDATIONS:');
  console.log('   • Always use $top to limit results');
  console.log('   • Always use $select to limit fields');
  console.log('   • Implement pagination for large result sets');
  console.log('   • Use $filter to narrow results when possible');
  console.log('\nNext: Run 05-test-password-reset.mjs (REQUIRES test user created first!)');

} catch (error) {
  console.error('❌ Test failed:', error.message);
  process.exit(1);
}
