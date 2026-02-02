#!/usr/bin/env node
/**
 * Test 5B: Password Reset using Authentication Methods API (Alternative)
 *
 * This uses the newer Authentication Methods API instead of PATCH /users/{id}
 * which may work in cases where the standard method fails.
 *
 * Run: node scripts/azure-ad-tests/05b-test-password-reset-alt.mjs
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { createInterface } from 'readline';

config({ path: resolve(process.cwd(), '.env') });

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║   TEST 5B: Password Reset (Authentication Methods API)       ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

function generateTempPassword() {
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lower = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const special = '!@#$%^&*';
  const all = upper + lower + numbers + special;

  let password = '';
  password += upper[Math.floor(Math.random() * upper.length)];
  password += lower[Math.floor(Math.random() * lower.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += special[Math.floor(Math.random() * special.length)];

  for (let i = 4; i < 16; i++) {
    password += all[Math.floor(Math.random() * all.length)];
  }

  return password.split('').sort(() => Math.random() - 0.5).join('');
}

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

try {
  const testUserEmail = process.env.AZURE_TEST_USER_2_EMAIL || process.env.AZURE_TEST_USER_EMAIL;

  if (!testUserEmail) {
    console.error('❌ No test user email configured');
    process.exit(1);
  }

  if (!testUserEmail.toLowerCase().includes('test')) {
    console.error('❌ SAFETY BLOCK: Email does not contain "test"');
    process.exit(1);
  }

  console.log(`Target user: ${testUserEmail}\n`);

  // Step 1: Get token
  console.log('Step 1: Obtaining access token...');
  const token = await getAccessToken();
  console.log('✅ Token obtained\n');

  // Step 2: Get user
  console.log('─────────────────────────────────────────────────────────────────');
  console.log('Step 2: Verifying user...\n');

  const encodedEmail = encodeURIComponent(testUserEmail);
  const userResult = await callGraphAPI(
    `/users/${encodedEmail}?$select=id,displayName,userPrincipalName`,
    token
  );

  if (!userResult.ok) {
    console.error('❌ User not found');
    process.exit(1);
  }

  const user = userResult.data;
  console.log(`   User: ${user.displayName}`);
  console.log(`   ID: ${user.id}`);

  // Step 3: Get authentication methods
  console.log('\n─────────────────────────────────────────────────────────────────');
  console.log('Step 3: Getting authentication methods...\n');

  const authMethodsResult = await callGraphAPI(
    `/users/${user.id}/authentication/methods`,
    token
  );

  if (authMethodsResult.ok) {
    console.log('   Authentication methods found:');
    authMethodsResult.data.value?.forEach(method => {
      console.log(`   • ${method['@odata.type']} (ID: ${method.id})`);
    });

    // Find password method
    const passwordMethod = authMethodsResult.data.value?.find(
      m => m['@odata.type'] === '#microsoft.graph.passwordAuthenticationMethod'
    );

    if (passwordMethod) {
      console.log(`\n   Password method ID: ${passwordMethod.id}`);
    }
  } else {
    console.log('   ⚠️  Could not list authentication methods');
    console.log(`   Status: ${authMethodsResult.status}`);
    console.log(`   Error: ${JSON.stringify(authMethodsResult.data)}`);
  }

  // Step 4: Manual confirmation
  console.log('\n─────────────────────────────────────────────────────────────────');
  console.log('Step 4: Manual Confirmation Required\n');

  console.log('   This test will attempt password reset using two methods:');
  console.log('   Method A: PATCH /users/{id} (standard)');
  console.log('   Method B: POST /users/{id}/authentication/passwordMethods (alternative)\n');

  const answer = await prompt('   Type "reset" to proceed: ');

  if (answer !== 'reset') {
    console.log('\n   ✅ Aborted.');
    process.exit(0);
  }

  const tempPassword = generateTempPassword();

  // Try Method A: Standard PATCH
  console.log('\n─────────────────────────────────────────────────────────────────');
  console.log('Step 5A: Trying PATCH /users/{id} method...\n');

  const methodAResult = await callGraphAPI(
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

  if (methodAResult.ok || methodAResult.status === 204) {
    console.log('   ✅ Method A SUCCEEDED!');
    console.log(`\n   Temporary Password: ${tempPassword}`);
    console.log('   User must change password on next sign-in');
  } else {
    console.log(`   ❌ Method A failed (Status: ${methodAResult.status})`);
    console.log(`   Error: ${methodAResult.data?.error?.message || JSON.stringify(methodAResult.data)}`);

    // Try Method B: Authentication Methods API (Beta)
    console.log('\n─────────────────────────────────────────────────────────────────');
    console.log('Step 5B: Trying Beta API endpoint...\n');

    // Use beta endpoint for resetPassword action
    const betaResponse = await fetch(
      `https://graph.microsoft.com/beta/users/${user.id}/authentication/passwordMethods/28c10230-6103-485e-b985-444c60001490/resetPassword`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          newPassword: tempPassword,
        }),
      }
    );

    let betaData;
    const betaText = await betaResponse.text();
    try {
      betaData = betaText ? JSON.parse(betaText) : {};
    } catch {
      betaData = { rawResponse: betaText };
    }

    if (betaResponse.ok || betaResponse.status === 202) {
      console.log('   ✅ Method B (Beta) SUCCEEDED!');
      console.log(`\n   Temporary Password: ${tempPassword}`);
    } else {
      console.log(`   ❌ Method B failed (Status: ${betaResponse.status})`);
      console.log(`   Error: ${betaData?.error?.message || JSON.stringify(betaData)}`);

      // Try Method C: Direct password method creation
      console.log('\n─────────────────────────────────────────────────────────────────');
      console.log('Step 5C: Checking tenant configuration...\n');

      // Check if there's a password policy blocking this
      const orgResult = await callGraphAPI('/organization?$select=passwordPolicies', token);

      if (orgResult.ok) {
        console.log('   Organization settings retrieved');
        console.log(`   ${JSON.stringify(orgResult.data, null, 2)}`);
      }

      console.log('\n═══════════════════════════════════════════════════════════════');
      console.log('❌ ALL METHODS FAILED');
      console.log('═══════════════════════════════════════════════════════════════\n');

      console.log('This might be caused by:');
      console.log('');
      console.log('1. TENANT-LEVEL RESTRICTION');
      console.log('   Your Azure AD tenant may have a security policy that');
      console.log('   prevents applications from resetting passwords.');
      console.log('');
      console.log('2. CONDITIONAL ACCESS POLICY');
      console.log('   Check Azure AD → Security → Conditional Access for');
      console.log('   policies that might block application access.');
      console.log('');
      console.log('3. PASSWORD PROTECTION SETTINGS');
      console.log('   Check Azure AD → Security → Authentication methods →');
      console.log('   Password protection for any restrictions.');
      console.log('');
      console.log('4. AZURE AD P1/P2 LICENSE REQUIRED');
      console.log('   Some password management features require Premium licenses.');
      console.log('');
      console.log('RECOMMENDED NEXT STEPS:');
      console.log('   • Check with your Azure AD administrator');
      console.log('   • Review Azure AD audit logs for more details');
      console.log('   • Consider using delegated permissions with user sign-in');
      console.log('');

      process.exit(1);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('✅ PASSWORD RESET SUCCESSFUL');
  console.log('═══════════════════════════════════════════════════════════════\n');

} catch (error) {
  console.error('❌ Test failed:', error.message);
  process.exit(1);
}
