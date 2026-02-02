# Azure AD Testing - Safety Boundaries

## What You CAN Test Safely

### ✅ Read-Only Operations (Low Risk)
- Get organization info
- Read user by email
- List users (with $top limit)
- Check user's group memberships
- Verify authentication methods exist

### ✅ Write Operations (Medium Risk - Test Users Only)
- Reset password for test user
- Disable test user account
- Re-enable test user account
- Update test user's display name or department

---

## What You Must NEVER Test

### ❌ Production Users
- NEVER use real employee emails in test scripts
- NEVER "just try" on a production account
- NEVER assume an account is safe because it looks inactive

### ❌ Admin Accounts
- NEVER test password reset on Global Admins
- NEVER test disable on any admin role holder
- NEVER modify admin group memberships

### ❌ Bulk Operations
- NEVER run scripts that affect multiple users at once
- NEVER test with loops or batch processing
- NEVER automate without approval workflow

### ❌ Destructive Operations
- NEVER delete user accounts
- NEVER remove all licenses from a user
- NEVER revoke all group memberships at once

### ❌ Security-Sensitive Operations
- NEVER disable MFA for testing
- NEVER bypass conditional access
- NEVER create permanent passwords (always use forceChangePasswordNextSignIn)

---

## Safety Checklist Before Each Test

Before running any write operation:

- [ ] Target email contains "test" (enforced in scripts)
- [ ] Target is NOT an admin (checked in scripts)
- [ ] I have read the script source code
- [ ] I understand what the script will do
- [ ] I know how to rollback if needed
- [ ] It's a suitable time (not during critical business operations)
- [ ] IT team is aware testing is happening

---

## Rollback Procedures

### Password Reset Gone Wrong
```
1. Azure Portal → Azure AD → Users → [User]
2. Click "Reset password"
3. Generate new temporary password
4. Contact the user with new password
```

### Account Accidentally Disabled
```
1. Azure Portal → Azure AD → Users → [User]
2. Edit properties
3. Set "Account enabled" = Yes
4. Save
```

### Wrong User Modified
```
1. STOP immediately
2. Document what was changed
3. Revert the change manually in Azure Portal
4. Notify IT Security if real user affected
5. File incident report
```

---

## Verification After Tests

After completing your tests, verify in Azure Portal:

### Check Sign-in Logs
```
Azure AD → Sign-in logs
- Filter by your app name
- Should see successful authentications
- No unexpected failures
```

### Check Audit Logs
```
Azure AD → Audit logs
- Filter by "Application" = your app
- Review all user modifications
- Verify only test users were affected
```

### Verify Test Users
```
Azure AD → Users → [each test user]
- Account should be enabled
- Should have working password
- No unexpected role changes
```

---

## Emergency Contacts

If something goes wrong:

1. **IT Admin**: Contact your Microsoft 365 Global Admin
2. **Azure Support**: https://portal.azure.com → Help + Support
3. **Rollback**: See procedures above

---

## Test Environment Recommendations

### For Safe Testing
1. **Use Microsoft 365 Developer Tenant** (free, isolated)
   - https://developer.microsoft.com/microsoft-365/dev-program
   - Completely separate from production

2. **Create Dedicated Test Users**
   - Names starting with "Test"
   - No real data or access
   - No admin roles

3. **Use Separate App Registration**
   - Different client ID/secret for testing
   - Easier to audit and revoke
