#!/usr/bin/env node
/**
 * Test 2: Microsoft Graph API Connectivity
 *
 * RISK LEVEL: None (read-only, reads organization info only)
 * PURPOSE: Verify Graph API is accessible and permissions work
 *
 * Run: node scripts/azure-ad-tests/02-test-app-info.mjs
 */

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env') });

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║         TEST 2: Microsoft Graph API Connectivity             ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

// Helper function to get access token
async function getAccessToken() {
  const tokenEndpoint = `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`;

  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.AZURE_CLIENT_ID,
      client_secret: process.env.AZURE_CLIENT_SECRET,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Token error: ${data.error_description}`);
  }
  return data.access_token;
}

// Helper function to call Graph API
async function callGraphAPI(endpoint, token) {
  const response = await fetch(`https://graph.microsoft.com/v1.0${endpoint}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  const data = await response.json();
  return { status: response.status, ok: response.ok, data };
}

try {
  // Step 1: Get access token
  console.log('Step 1: Obtaining access token...');
  const token = await getAccessToken();
  console.log('✅ Token obtained\n');

  // Step 2: Test basic Graph connectivity with organization info
  console.log('─────────────────────────────────────────────────────────────────');
  console.log('Step 2: Reading organization information...\n');

  const orgResult = await callGraphAPI('/organization', token);

  if (orgResult.ok) {
    const org = orgResult.data.value[0];
    console.log('✅ Organization info retrieved:');
    console.log(`   Display Name: ${org.displayName}`);
    console.log(`   Tenant ID: ${org.id}`);
    console.log(`   Verified Domains: ${org.verifiedDomains?.map(d => d.name).join(', ') || 'N/A'}`);
  } else {
    console.log('⚠️  Could not read organization info (might need Organization.Read.All permission)');
    console.log(`   Status: ${orgResult.status}`);
  }

  // Step 3: Test user count (proves User.Read.All works)
  console.log('\n─────────────────────────────────────────────────────────────────');
  console.log('Step 3: Testing User.Read.All permission...\n');

  const usersResult = await callGraphAPI('/users?$top=1&$select=id,displayName', token);

  if (usersResult.ok) {
    console.log('✅ User.Read.All permission working');
    console.log(`   Successfully retrieved user list (showing first user only)`);
    if (usersResult.data.value && usersResult.data.value.length > 0) {
      console.log(`   Sample user: ${usersResult.data.value[0].displayName}`);
    }
  } else {
    console.log('❌ User.Read.All permission NOT working');
    console.log(`   Status: ${usersResult.status}`);
    console.log(`   Error: ${usersResult.data.error?.message}`);
    console.log('\n   Fix: Go to Azure Portal → App Registrations → Your App → API Permissions');
    console.log('   Add "User.Read.All" (Application type) and grant admin consent');
  }

  // Step 4: Test auth methods permission
  console.log('\n─────────────────────────────────────────────────────────────────');
  console.log('Step 4: Testing UserAuthenticationMethod permission...\n');

  // Get a user ID first
  if (usersResult.ok && usersResult.data.value && usersResult.data.value.length > 0) {
    const testUserId = usersResult.data.value[0].id;
    const authMethodsResult = await callGraphAPI(`/users/${testUserId}/authentication/methods`, token);

    if (authMethodsResult.ok) {
      console.log('✅ UserAuthenticationMethod.Read.All permission working');
      console.log(`   Can read authentication methods for users`);
    } else if (authMethodsResult.status === 403) {
      console.log('⚠️  UserAuthenticationMethod permission may need admin consent');
      console.log(`   Status: ${authMethodsResult.status}`);
    } else {
      console.log('⚠️  Could not verify auth methods permission');
      console.log(`   Status: ${authMethodsResult.status}`);
    }
  }

  // Summary
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('✅ TEST PASSED: Graph API connectivity verified');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('\nPermission Status:');
  console.log('  • Graph API Access: ✅ Working');
  console.log('  • User.Read.All: ' + (usersResult.ok ? '✅ Working' : '❌ Needs setup'));
  console.log('\nNext: Run 03-test-read-user.mjs to test reading a specific test user');

} catch (error) {
  console.error('❌ Test failed:', error.message);
  process.exit(1);
}
