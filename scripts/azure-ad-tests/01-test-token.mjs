#!/usr/bin/env node
/**
 * Test 1: Azure AD Token Generation
 *
 * RISK LEVEL: None (read-only, no user data accessed)
 * PURPOSE: Verify credentials are correct and token can be obtained
 *
 * Run: node scripts/azure-ad-tests/01-test-token.mjs
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables
config({ path: resolve(process.cwd(), '.env') });

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║           TEST 1: Azure AD Token Generation                  ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

// Step 1: Verify environment variables exist
console.log('Step 1: Checking environment variables...\n');

const requiredVars = [
  'AZURE_TENANT_ID',
  'AZURE_CLIENT_ID',
  'AZURE_CLIENT_SECRET'
];

const missing = requiredVars.filter(v => !process.env[v]);

if (missing.length > 0) {
  console.error('❌ Missing required environment variables:');
  missing.forEach(v => console.error(`   - ${v}`));
  console.error('\nAdd these to your .env file and try again.');
  process.exit(1);
}

console.log('✅ All required environment variables present');
console.log(`   Tenant ID: ${process.env.AZURE_TENANT_ID.substring(0, 8)}...`);
console.log(`   Client ID: ${process.env.AZURE_CLIENT_ID.substring(0, 8)}...`);
console.log(`   Client Secret: ${'*'.repeat(20)}`);

// Step 2: Request access token
console.log('\n─────────────────────────────────────────────────────────────────');
console.log('Step 2: Requesting access token from Azure AD...\n');

const tokenEndpoint = `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`;

try {
  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: process.env.AZURE_CLIENT_ID,
      client_secret: process.env.AZURE_CLIENT_SECRET,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error('❌ Token request failed:');
    console.error(`   Error: ${data.error}`);
    console.error(`   Description: ${data.error_description}`);

    if (data.error === 'invalid_client') {
      console.error('\n   Possible causes:');
      console.error('   - Client secret is incorrect or expired');
      console.error('   - Client ID is incorrect');
    } else if (data.error === 'unauthorized_client') {
      console.error('\n   Possible causes:');
      console.error('   - App registration not configured for client credentials flow');
      console.error('   - Permissions not granted by admin');
    }

    process.exit(1);
  }

  console.log('✅ Access token obtained successfully!');
  console.log(`   Token type: ${data.token_type}`);
  console.log(`   Expires in: ${data.expires_in} seconds (${Math.round(data.expires_in / 60)} minutes)`);
  console.log(`   Token preview: ${data.access_token.substring(0, 50)}...`);

  // Step 3: Decode token to verify claims (without validation)
  console.log('\n─────────────────────────────────────────────────────────────────');
  console.log('Step 3: Inspecting token claims...\n');

  const tokenParts = data.access_token.split('.');
  if (tokenParts.length === 3) {
    const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());

    console.log('   Token claims:');
    console.log(`   - App ID: ${payload.appid || payload.azp}`);
    console.log(`   - Tenant ID: ${payload.tid}`);
    console.log(`   - Audience: ${payload.aud}`);
    console.log(`   - Issued at: ${new Date(payload.iat * 1000).toISOString()}`);
    console.log(`   - Expires at: ${new Date(payload.exp * 1000).toISOString()}`);

    if (payload.roles && payload.roles.length > 0) {
      console.log(`   - Roles/Permissions: ${payload.roles.join(', ')}`);
    } else {
      console.log('   - Roles/Permissions: (check API permissions in Azure portal)');
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('✅ TEST PASSED: Token generation working correctly');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('\nNext: Run 02-test-app-info.mjs to verify Graph API connectivity');

} catch (error) {
  console.error('❌ Network error:', error.message);
  console.error('\n   Check your internet connection and try again.');
  process.exit(1);
}
