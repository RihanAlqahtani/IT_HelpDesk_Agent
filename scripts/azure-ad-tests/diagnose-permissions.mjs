#!/usr/bin/env node
/**
 * Diagnostic Script: Check why password reset fails
 *
 * This script will:
 * 1. List the effective permissions your app has
 * 2. Check if the test user has any admin roles
 * 3. Verify the user is not protected by other policies
 *
 * Run: node scripts/azure-ad-tests/diagnose-permissions.mjs
 */

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env') });

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║          DIAGNOSTIC: Password Reset Permission Check         ║');
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
  const testUserEmail = process.env.AZURE_TEST_USER_2_EMAIL || process.env.AZURE_TEST_USER_EMAIL;

  if (!testUserEmail) {
    console.error('❌ No test user email configured');
    process.exit(1);
  }

  console.log(`Diagnosing permissions for: ${testUserEmail}\n`);

  // Get token
  console.log('Step 1: Getting access token...');
  const token = await getAccessToken();
  console.log('✅ Token obtained\n');

  // Check 1: Get service principal and its permissions
  console.log('─────────────────────────────────────────────────────────────────');
  console.log('Step 2: Checking your app\'s granted permissions...\n');

  const spResult = await callGraphAPI(
    `/servicePrincipals?$filter=appId eq '${process.env.AZURE_CLIENT_ID}'&$select=id,displayName,appRoles`,
    token
  );

  if (spResult.ok && spResult.data.value?.length > 0) {
    const sp = spResult.data.value[0];
    console.log(`   App Name: ${sp.displayName}`);
    console.log(`   Service Principal ID: ${sp.id}`);

    // Get app role assignments (granted permissions)
    const permResult = await callGraphAPI(
      `/servicePrincipals/${sp.id}/appRoleAssignments`,
      token
    );

    if (permResult.ok) {
      console.log('\n   Granted Permissions:');
      if (permResult.data.value?.length > 0) {
        // Get the Microsoft Graph service principal to resolve role names
        const graphSpResult = await callGraphAPI(
          `/servicePrincipals?$filter=displayName eq 'Microsoft Graph'&$select=id,appRoles`,
          token
        );

        const roleMap = {};
        if (graphSpResult.ok && graphSpResult.data.value?.[0]?.appRoles) {
          graphSpResult.data.value[0].appRoles.forEach(role => {
            roleMap[role.id] = role.value;
          });
        }

        permResult.data.value.forEach(perm => {
          const roleName = roleMap[perm.appRoleId] || perm.appRoleId;
          console.log(`   ✅ ${roleName}`);
        });
      } else {
        console.log('   ⚠️  No permissions found - admin consent may not be granted!');
      }
    }
  } else {
    console.log('   ⚠️  Could not find service principal');
  }

  // Check 2: Get test user details and roles
  console.log('\n─────────────────────────────────────────────────────────────────');
  console.log('Step 3: Checking test user\'s admin roles...\n');

  const encodedEmail = encodeURIComponent(testUserEmail);
  const userResult = await callGraphAPI(
    `/users/${encodedEmail}?$select=id,displayName,userPrincipalName,accountEnabled,onPremisesSyncEnabled`,
    token
  );

  if (!userResult.ok) {
    console.error('   ❌ Could not find user');
    process.exit(1);
  }

  const user = userResult.data;
  console.log(`   User: ${user.displayName}`);
  console.log(`   ID: ${user.id}`);
  console.log(`   Account Enabled: ${user.accountEnabled}`);
  console.log(`   Synced from On-Premises: ${user.onPremisesSyncEnabled || false}`);

  if (user.onPremisesSyncEnabled) {
    console.log('\n   ⚠️  WARNING: This user is synced from on-premises AD!');
    console.log('   Password reset may not work for synced users.');
    console.log('   Password must be changed in on-premises Active Directory.');
  }

  // Check directory roles (admin roles)
  const rolesResult = await callGraphAPI(
    `/users/${user.id}/memberOf?$select=displayName,@odata.type`,
    token
  );

  if (rolesResult.ok) {
    const directoryRoles = rolesResult.data.value?.filter(
      r => r['@odata.type'] === '#microsoft.graph.directoryRole'
    );

    const adminRoles = rolesResult.data.value?.filter(r =>
      r.displayName?.toLowerCase().includes('admin') ||
      r.displayName?.toLowerCase().includes('global')
    );

    console.log('\n   Directory Roles:');
    if (directoryRoles && directoryRoles.length > 0) {
      directoryRoles.forEach(r => {
        const isAdmin = r.displayName?.toLowerCase().includes('admin');
        const icon = isAdmin ? '⚠️' : '•';
        console.log(`   ${icon} ${r.displayName}`);
      });
    } else {
      console.log('   ✅ No directory roles (good - not an admin)');
    }

    console.log('\n   Group Memberships:');
    const groups = rolesResult.data.value?.filter(
      r => r['@odata.type'] === '#microsoft.graph.group'
    );
    if (groups && groups.length > 0) {
      groups.forEach(g => console.log(`   • ${g.displayName}`));
    } else {
      console.log('   (none)');
    }

    if (adminRoles && adminRoles.length > 0) {
      console.log('\n   ❌ PROBLEM FOUND: User has admin roles!');
      console.log('   ══════════════════════════════════════════════════════════');
      console.log('   Microsoft Graph API with Application permissions CANNOT');
      console.log('   reset passwords for users with admin roles.');
      console.log('   ══════════════════════════════════════════════════════════');
      console.log('\n   SOLUTION: Remove admin roles from this test user:');
      console.log('   1. Go to Azure Portal → Azure AD → Users');
      console.log(`   2. Find: ${user.displayName}`);
      console.log('   3. Click "Assigned roles"');
      console.log('   4. Remove all admin roles');
      console.log('   5. Wait 5 minutes and try again');
    }
  }

  // Summary
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('DIAGNOSTIC SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log('Required permissions for password reset:');
  console.log('   • User.ReadWrite.All (required)');
  console.log('   • Directory.ReadWrite.All (recommended)');
  console.log('   • UserAuthenticationMethod.ReadWrite.All (for some methods)\n');

  console.log('Common causes of 403 error:');
  console.log('   1. ❌ User has admin roles → Remove admin roles from test user');
  console.log('   2. ❌ User synced from on-prem AD → Cannot change cloud password');
  console.log('   3. ❌ Admin consent not granted → Re-grant admin consent');
  console.log('   4. ❌ Permission propagation delay → Wait 5-10 minutes');
  console.log('   5. ❌ Missing Directory.ReadWrite.All → Add this permission\n');

  console.log('Next steps:');
  console.log('   1. Check the diagnostic output above');
  console.log('   2. Fix any identified issues');
  console.log('   3. Wait 5 minutes for propagation');
  console.log('   4. Re-run test 05-test-password-reset.mjs');

} catch (error) {
  console.error('❌ Diagnostic failed:', error.message);
  process.exit(1);
}
