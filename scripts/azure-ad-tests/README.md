# Azure AD Integration - Safe Testing Guide

## Overview

This directory contains scripts to safely validate your Azure AD / Microsoft Graph integration.

**SAFETY FIRST**: All tests are designed to be:
- Read-only where possible
- Use test users only (never production)
- Reversible when write operations are tested
- Manual execution only (no automation)

---

## Prerequisites

Before running any tests:

1. **Create test users in Azure AD** (see instructions below)
2. **Add environment variables** to `.env`
3. **Install dependencies**: `npm install @azure/identity @microsoft/microsoft-graph-client`

---

## Test User Setup (Do This First!)

### Step 1: Create Test Users in Azure AD

1. Go to Azure Portal → Azure Active Directory → Users
2. Click "+ New user" → "Create new user"
3. Create these test users:

| Display Name | User Principal Name | Purpose |
|--------------|---------------------|---------|
| Test User One | testuser1@yourdomain.onmicrosoft.com | Read-only tests |
| Test User Two | testuser2@yourdomain.onmicrosoft.com | Password reset tests |
| Test Disabled | testdisabled@yourdomain.onmicrosoft.com | Disable/enable tests |

4. Set temporary passwords for each
5. **IMPORTANT**: Add a tag or note that these are "IT Helpdesk Test Accounts"

### Step 2: Add Environment Variables

Add these to your `.env` file:

```env
# Azure AD / Microsoft Graph (REQUIRED)
AZURE_TENANT_ID=your-tenant-id
AZURE_CLIENT_ID=your-app-client-id
AZURE_CLIENT_SECRET=your-client-secret

# Test Users (REQUIRED for safe testing)
AZURE_TEST_USER_EMAIL=testuser1@yourdomain.onmicrosoft.com
AZURE_TEST_USER_2_EMAIL=testuser2@yourdomain.onmicrosoft.com
```

---

## Test Execution Order

Run tests in this exact order:

| # | Test | Risk Level | Script |
|---|------|------------|--------|
| 1 | Token Generation | None | `01-test-token.mjs` |
| 2 | Read Own App Info | None | `02-test-app-info.mjs` |
| 3 | Read Test User | Low | `03-test-read-user.mjs` |
| 4 | List Users (Limited) | Low | `04-test-list-users.mjs` |
| 5 | Password Reset (Test User) | Medium | `05-test-password-reset.mjs` |
| 6 | Disable/Enable User | Medium | `06-test-disable-enable.mjs` |

---

## What NOT To Test (Safety Boundaries)

### NEVER DO:
- ❌ Test with real employee emails
- ❌ Test password reset on admin accounts
- ❌ Run bulk operations (more than 1 user at a time)
- ❌ Delete any user accounts
- ❌ Modify Global Administrator accounts
- ❌ Test during business hours without IT team awareness
- ❌ Store test results with real user data in logs

### ALWAYS DO:
- ✅ Use designated test accounts only
- ✅ Verify target email before any write operation
- ✅ Run tests one at a time, manually
- ✅ Check Azure AD audit logs after each test
- ✅ Document any issues encountered

---

## Rollback Procedures

If something goes wrong:

### Password Reset Gone Wrong
1. Go to Azure Portal → Azure AD → Users → [User]
2. Click "Reset password"
3. Generate new temporary password
4. Notify the user (if real user was affected accidentally)

### User Accidentally Disabled
1. Go to Azure Portal → Azure AD → Users → [User]
2. Click "Edit properties"
3. Set "Account enabled" to Yes
4. Save

---

## Verifying Permissions

After tests, verify in Azure Portal:

1. **Azure AD → App Registrations → Your App → API Permissions**
   - All permissions should show "Granted for [your tenant]"

2. **Azure AD → Enterprise Applications → Your App → Sign-in logs**
   - Should show successful authentications

3. **Azure AD → Audit logs**
   - Should show any user modifications made during tests
