/**
 * HR Onboarding Service
 *
 * Handles the full employee onboarding lifecycle:
 * - Public form submission with access code validation
 * - Azure AD user creation with auto-generated UPN
 * - Microsoft 365 license assignment
 * - Credential email delivery via Microsoft Graph API
 * - Employee modification (department, job title)
 * - Offboarding (Azure AD account disable)
 *
 * Security:
 * - Access code required for public form
 * - Rate limiting per IP (enforced at route level)
 * - Domain-locked to configured domain
 * - Passwords never stored — emailed to personal email only
 * - Full audit logging
 */

import { getAzureADConfig, isAzureADConfigured, env } from '../config/env.js';
import { supabaseAdmin } from '../config/supabase.js';
import { logAudit } from '../middleware/audit.middleware.js';

// =============================================================================
// TYPES
// =============================================================================

export interface OnboardingFormData {
  accessCode: string;
  firstName: string;
  lastName: string;
  personalEmail: string;
  jobTitle?: string;
  department?: string;
}

export interface OnboardingResult {
  recordId: string;
  userPrincipalName: string;
  displayName: string;
  credentialsEmailed: boolean;
  warnings: string[];
}

export interface EmployeeRecord {
  id: string;
  firstName: string;
  lastName: string;
  personalEmail: string;
  jobTitle: string | null;
  department: string | null;
  userPrincipalName: string;
  displayName: string;
  azureObjectId: string | null;
  licenseAssigned: string | null;
  credentialsEmailed: boolean;
  credentialsEmailedAt: string | null;
  status: string;
  errorMessage: string | null;
  offboardedAt: string | null;
  offboardReason: string | null;
  lastModifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardStats {
  totalEmployees: number;
  activeEmployees: number;
  pendingOnboarding: number;
  offboardedEmployees: number;
  failedOnboarding: number;
  recentOnboardings: EmployeeRecord[];
}

export interface ServiceResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: string;
  warnings?: string[];
}

// =============================================================================
// SERVICE CLASS
// =============================================================================

class HROnboardingService {
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;
  private readonly TOKEN_BUFFER_MS = 5 * 60 * 1000;

  // ===========================================================================
  // CONFIG CHECKS
  // ===========================================================================

  isConfigured(): boolean {
    return isAzureADConfigured();
  }

  isEnabled(): boolean {
    return env.FEATURE_PRIVILEGED_ACTIONS && this.isConfigured();
  }

  getDomain(): string {
    return env.AZURE_USER_DOMAIN;
  }

  // ===========================================================================
  // ACCESS CODE VALIDATION
  // ===========================================================================

  validateAccessCode(code: string): boolean {
    return code === env.HR_ONBOARDING_ACCESS_CODE;
  }

  // ===========================================================================
  // TOKEN MANAGEMENT
  // ===========================================================================

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt - this.TOKEN_BUFFER_MS) {
      return this.accessToken;
    }

    const config = getAzureADConfig();

    const response = await fetch(
      `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          scope: 'https://graph.microsoft.com/.default',
          grant_type: 'client_credentials',
        }),
      }
    );

    const data = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
      error?: string;
      error_description?: string;
    };

    if (!response.ok) {
      throw new Error(`Azure AD token error: ${data.error_description || data.error}`);
    }

    if (!data.access_token) {
      throw new Error('No access token received from Azure AD');
    }

    this.accessToken = data.access_token;
    this.tokenExpiresAt = Date.now() + (data.expires_in || 3600) * 1000;

    return this.accessToken;
  }

  // ===========================================================================
  // GRAPH API CALLER
  // ===========================================================================

  private async callGraphAPI<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ServiceResult<T>> {
    try {
      const token = await this.getAccessToken();
      const config = getAzureADConfig();

      const url = `${config.graphEndpoint}${endpoint}`;
      console.log(`[HR Onboarding] Graph API ${options.method || 'GET'} ${endpoint}`);

      const response = await fetch(url, {
        ...options,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      if (response.status === 204) {
        return { success: true };
      }

      const text = await response.text();
      let data: unknown;

      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { rawResponse: text };
      }

      if (!response.ok) {
        const errorData = data as { error?: { code?: string; message?: string } };
        console.error(`[HR Onboarding] Graph API error: ${response.status}`, errorData.error);
        return {
          success: false,
          error: errorData.error?.message || 'Unknown error',
          errorCode: errorData.error?.code,
        };
      }

      return { success: true, data: data as T };
    } catch (error) {
      console.error('[HR Onboarding] Graph API exception:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ===========================================================================
  // UPN GENERATION
  // ===========================================================================

  private generateMailNickname(firstName: string, lastName: string): string {
    const normalize = (str: string) =>
      str
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '');

    return `${normalize(firstName)}.${normalize(lastName)}`;
  }

  private async isUpnAvailable(upn: string): Promise<boolean> {
    const result = await this.callGraphAPI(`/users/${encodeURIComponent(upn)}?$select=id`);

    if (!result.success && result.errorCode === 'Request_ResourceNotFound') {
      return true;
    }

    return !result.success ? false : false;
  }

  private async generateUniqueUpn(
    firstName: string,
    lastName: string
  ): Promise<{ upn: string; available: boolean; note?: string }> {
    const domain = this.getDomain();
    const baseNickname = this.generateMailNickname(firstName, lastName);
    const baseUpn = `${baseNickname}@${domain}`;

    if (await this.isUpnAvailable(baseUpn)) {
      return { upn: baseUpn, available: true };
    }

    for (let i = 2; i <= 99; i++) {
      const upn = `${baseNickname}${i}@${domain}`;
      if (await this.isUpnAvailable(upn)) {
        return {
          upn,
          available: true,
          note: `${baseUpn} was already taken, using ${upn} instead`,
        };
      }
    }

    return {
      upn: baseUpn,
      available: false,
      note: 'Could not find an available email address. Please contact IT support.',
    };
  }

  // ===========================================================================
  // PASSWORD GENERATION
  // ===========================================================================

  private generateTemporaryPassword(): string {
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

    return password
      .split('')
      .sort(() => Math.random() - 0.5)
      .join('');
  }

  // ===========================================================================
  // LICENSE MANAGEMENT
  // ===========================================================================

  private async getDefaultLicenseSkuId(): Promise<ServiceResult<string>> {
    const skuPartNumber = env.AZURE_DEFAULT_LICENSE_SKU;

    if (!skuPartNumber) {
      return { success: false, error: 'No default license SKU configured' };
    }

    const result = await this.callGraphAPI<{
      value: Array<{
        skuId: string;
        skuPartNumber: string;
        prepaidUnits: { enabled: number };
        consumedUnits: number;
      }>;
    }>('/subscribedSkus');

    if (!result.success || !result.data) {
      return { success: false, error: result.error || 'Failed to fetch licenses' };
    }

    const sku = result.data.value.find(
      (s) => s.skuPartNumber === skuPartNumber
    );

    if (!sku) {
      return {
        success: false,
        error: `License SKU '${skuPartNumber}' not found in tenant`,
      };
    }

    const available = sku.prepaidUnits.enabled - sku.consumedUnits;
    if (available <= 0) {
      return {
        success: false,
        error: `No available seats for license '${skuPartNumber}'`,
      };
    }

    return { success: true, data: sku.skuId };
  }

  private getLicenseDisplayName(skuPartNumber: string): string {
    const names: Record<string, string> = {
      SPE_E5: 'Microsoft 365 E5',
      SPE_E3: 'Microsoft 365 E3',
      ENTERPRISEPACK: 'Office 365 E3',
      O365_BUSINESS_ESSENTIALS: 'Microsoft 365 Business Basic',
      O365_BUSINESS_PREMIUM: 'Microsoft 365 Business Standard',
      SMB_BUSINESS_PREMIUM: 'Microsoft 365 Business Premium',
    };
    return names[skuPartNumber] || skuPartNumber;
  }

  // ===========================================================================
  // CREDENTIAL EMAIL
  // ===========================================================================

  private async sendCredentialEmail(
    personalEmail: string,
    corporateEmail: string,
    tempPassword: string,
    displayName: string
  ): Promise<ServiceResult> {
    const senderUserId = env.HR_CREDENTIAL_SENDER_USER_ID;

    if (!senderUserId) {
      console.warn('[HR Onboarding] No HR_CREDENTIAL_SENDER_USER_ID configured, skipping email');
      return {
        success: false,
        error: 'Email sender not configured. Set HR_CREDENTIAL_SENDER_USER_ID.',
      };
    }

    const emailBody = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <div style="text-align: center; padding: 20px; background: #1a365d; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Welcome to 3Lines!</h1>
    <p style="color: #93c5fd; margin: 5px 0 0;">Your corporate account is ready</p>
  </div>

  <div style="padding: 30px 20px; background: #f8fafc; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px;">
    <p>Dear <strong>${displayName}</strong>,</p>

    <p>Welcome to the 3Lines team! Your corporate account has been created. Below are your login credentials:</p>

    <div style="background: white; border: 2px solid #3b82f6; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Corporate Email:</td>
          <td style="padding: 8px 0; font-weight: bold; font-size: 16px;">${corporateEmail}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Temporary Password:</td>
          <td style="padding: 8px 0; font-weight: bold; font-size: 16px; font-family: monospace;">${tempPassword}</td>
        </tr>
      </table>
    </div>

    <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 16px; margin: 20px 0; border-radius: 0 4px 4px 0;">
      <strong style="color: #92400e;">Important:</strong>
      <p style="margin: 5px 0 0; color: #92400e;">You will be required to change your password on your first login.</p>
    </div>

    <h3 style="color: #1a365d; margin-top: 25px;">Getting Started</h3>
    <ol style="line-height: 1.8; color: #475569;">
      <li>Go to <a href="https://portal.office.com" style="color: #3b82f6;">portal.office.com</a></li>
      <li>Sign in with your corporate email and temporary password</li>
      <li>Set a new password when prompted</li>
      <li>Set up multi-factor authentication (MFA) if prompted</li>
    </ol>

    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 25px 0;">

    <p style="color: #64748b; font-size: 13px;">
      If you have any issues, please contact IT Support:<br>
      <strong>Email:</strong> it-support@3lines.com.sa<br>
      <strong>Portal:</strong> <a href="https://helpdesk.3lines.com.sa" style="color: #3b82f6;">helpdesk.3lines.com.sa</a>
    </p>
  </div>
</body>
</html>`.trim();

    const result = await this.callGraphAPI(`/users/${senderUserId}/sendMail`, {
      method: 'POST',
      body: JSON.stringify({
        message: {
          subject: 'Welcome to 3Lines - Your Corporate Account Credentials',
          body: {
            contentType: 'HTML',
            content: emailBody,
          },
          toRecipients: [
            {
              emailAddress: {
                address: personalEmail,
                name: displayName,
              },
            },
          ],
        },
        saveToSentItems: true,
      }),
    });

    return result;
  }

  // ===========================================================================
  // ONBOARDING (MAIN FLOW)
  // ===========================================================================

  async onboardEmployee(
    formData: OnboardingFormData,
    submittedFromIp?: string
  ): Promise<ServiceResult<OnboardingResult>> {
    if (!this.isEnabled()) {
      return { success: false, error: 'Onboarding service is not enabled' };
    }

    const warnings: string[] = [];

    // 1. Validate access code
    if (!this.validateAccessCode(formData.accessCode)) {
      await logAudit({
        userId: null as unknown as string,
        action: 'ONBOARD_ACCESS_CODE_FAILED',
        resourceType: 'onboarding',
        details: { ip: submittedFromIp },
      });
      return {
        success: false,
        error: 'Invalid access code',
        errorCode: 'INVALID_ACCESS_CODE',
      };
    }

    // 2. Check for duplicate personal email
    const { data: existing } = await supabaseAdmin
      .from('it_onboarding_records')
      .select('id, status')
      .eq('personal_email', formData.personalEmail.toLowerCase())
      .in('status', ['pending', 'provisioning', 'completed'])
      .limit(1);

    if (existing && existing.length > 0) {
      return {
        success: false,
        error: 'This email address has already been used for onboarding',
        errorCode: 'DUPLICATE_EMAIL',
      };
    }

    // 3. Generate unique UPN
    const upnResult = await this.generateUniqueUpn(formData.firstName, formData.lastName);
    if (!upnResult.available) {
      return {
        success: false,
        error: upnResult.note || 'Could not generate a unique email address. Please contact IT support.',
        errorCode: 'UPN_UNAVAILABLE',
      };
    }
    if (upnResult.note) {
      warnings.push(upnResult.note);
    }

    const upn = upnResult.upn;
    const displayName = `${formData.firstName} ${formData.lastName}`;
    const mailNickname = upn.split('@')[0];

    // 4. Create onboarding record (status: provisioning)
    const { data: record, error: insertError } = await supabaseAdmin
      .from('it_onboarding_records')
      .insert({
        first_name: formData.firstName,
        last_name: formData.lastName,
        personal_email: formData.personalEmail.toLowerCase(),
        job_title: formData.jobTitle || null,
        department: formData.department || null,
        user_principal_name: upn,
        display_name: displayName,
        status: 'provisioning',
        submitted_from_ip: submittedFromIp || null,
      })
      .select('id')
      .single();

    if (insertError || !record) {
      console.error('[HR Onboarding] Failed to create onboarding record:', insertError);
      return {
        success: false,
        error: 'Failed to initiate onboarding. Please try again.',
      };
    }

    const recordId = record.id;

    await logAudit({
      userId: null as unknown as string,
      action: 'ONBOARD_SUBMITTED',
      resourceType: 'onboarding',
      resourceId: recordId,
      details: {
        upn,
        displayName,
        ip: submittedFromIp,
      },
    });

    // 5. Create user in Azure AD
    const temporaryPassword = this.generateTemporaryPassword();

    const createResult = await this.callGraphAPI<{
      id: string;
      userPrincipalName: string;
      displayName: string;
    }>('/users', {
      method: 'POST',
      body: JSON.stringify({
        accountEnabled: true,
        displayName,
        givenName: formData.firstName,
        surname: formData.lastName,
        mailNickname,
        userPrincipalName: upn,
        jobTitle: formData.jobTitle || null,
        department: formData.department || null,
        usageLocation: env.AZURE_DEFAULT_USAGE_LOCATION,
        passwordProfile: {
          forceChangePasswordNextSignIn: true,
          password: temporaryPassword,
        },
      }),
    });

    if (!createResult.success || !createResult.data) {
      await supabaseAdmin
        .from('it_onboarding_records')
        .update({
          status: 'failed',
          error_message: createResult.error || 'Azure AD user creation failed',
        })
        .eq('id', recordId);

      await logAudit({
        userId: null as unknown as string,
        action: 'ONBOARD_FAILED',
        resourceType: 'onboarding',
        resourceId: recordId,
        details: {
          stage: 'azure_user_creation',
          error: createResult.error,
          errorCode: createResult.errorCode,
        },
      });

      return {
        success: false,
        error: createResult.error || 'Failed to create Azure AD account',
        errorCode: createResult.errorCode,
      };
    }

    const azureUser = createResult.data;

    // Update record with Azure object ID
    await supabaseAdmin
      .from('it_onboarding_records')
      .update({ azure_object_id: azureUser.id })
      .eq('id', recordId);

    await logAudit({
      userId: null as unknown as string,
      action: 'ONBOARD_USER_CREATED',
      resourceType: 'onboarding',
      resourceId: recordId,
      details: {
        azureObjectId: azureUser.id,
        upn: azureUser.userPrincipalName,
      },
    });

    // 6. Assign license
    let licenseAssigned: string | null = null;

    const skuResult = await this.getDefaultLicenseSkuId();
    if (skuResult.success && skuResult.data) {
      const licenseResult = await this.callGraphAPI(
        `/users/${azureUser.id}/assignLicense`,
        {
          method: 'POST',
          body: JSON.stringify({
            addLicenses: [{ skuId: skuResult.data }],
            removeLicenses: [],
          }),
        }
      );

      if (licenseResult.success) {
        licenseAssigned = this.getLicenseDisplayName(env.AZURE_DEFAULT_LICENSE_SKU);
        await supabaseAdmin
          .from('it_onboarding_records')
          .update({ license_assigned: licenseAssigned })
          .eq('id', recordId);

        await logAudit({
          userId: null as unknown as string,
          action: 'ONBOARD_LICENSE_ASSIGNED',
          resourceType: 'onboarding',
          resourceId: recordId,
          details: { license: licenseAssigned },
        });
      } else {
        warnings.push(
          `License assignment failed: ${licenseResult.error}. IT Admin can assign it manually.`
        );
      }
    } else {
      warnings.push(
        `License lookup failed: ${skuResult.error}. IT Admin can assign it manually.`
      );
    }

    // 7. Also store in it_directory_users for backward compatibility
    await supabaseAdmin.from('it_directory_users').insert({
      azure_object_id: azureUser.id,
      user_principal_name: azureUser.userPrincipalName,
      display_name: displayName,
      given_name: formData.firstName,
      surname: formData.lastName,
      job_title: formData.jobTitle || null,
      department: formData.department || null,
      license_sku_id: skuResult.data || null,
      license_display_name: licenseAssigned,
      status: 'active',
      onboarding_record_id: recordId,
    });

    // 8. Send credentials email
    let credentialsEmailed = false;

    const emailResult = await this.sendCredentialEmail(
      formData.personalEmail,
      upn,
      temporaryPassword,
      displayName
    );

    if (emailResult.success) {
      credentialsEmailed = true;
      await supabaseAdmin
        .from('it_onboarding_records')
        .update({
          credentials_emailed: true,
          credentials_emailed_at: new Date().toISOString(),
        })
        .eq('id', recordId);

      await logAudit({
        userId: null as unknown as string,
        action: 'ONBOARD_CREDENTIALS_EMAILED',
        resourceType: 'onboarding',
        resourceId: recordId,
        details: { sentTo: formData.personalEmail },
      });
    } else {
      warnings.push(
        `Credential email delivery failed: ${emailResult.error}. HR can resend from the dashboard.`
      );
    }

    // 9. Mark as completed
    await supabaseAdmin
      .from('it_onboarding_records')
      .update({ status: 'completed' })
      .eq('id', recordId);

    await logAudit({
      userId: null as unknown as string,
      action: 'ONBOARD_COMPLETED',
      resourceType: 'onboarding',
      resourceId: recordId,
      details: {
        upn,
        displayName,
        licenseAssigned,
        credentialsEmailed,
        warnings: warnings.length > 0 ? warnings : undefined,
      },
    });

    return {
      success: true,
      data: {
        recordId,
        userPrincipalName: upn,
        displayName,
        credentialsEmailed,
        warnings,
      },
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  // ===========================================================================
  // OFFBOARDING
  // ===========================================================================

  async offboardEmployee(
    recordId: string,
    hrUserId: string,
    reason: string
  ): Promise<ServiceResult> {
    if (!this.isEnabled()) {
      return { success: false, error: 'Service is not enabled' };
    }

    // Get the onboarding record
    const { data: record, error } = await supabaseAdmin
      .from('it_onboarding_records')
      .select('*')
      .eq('id', recordId)
      .single();

    if (error || !record) {
      return { success: false, error: 'Employee record not found' };
    }

    if (record.status === 'offboarded') {
      return { success: false, error: 'Employee has already been offboarded' };
    }

    if (!record.azure_object_id) {
      return { success: false, error: 'No Azure AD account linked to this employee' };
    }

    // Disable Azure AD account
    const disableResult = await this.callGraphAPI(`/users/${record.azure_object_id}`, {
      method: 'PATCH',
      body: JSON.stringify({ accountEnabled: false }),
    });

    if (!disableResult.success) {
      await logAudit({
        userId: hrUserId,
        action: 'OFFBOARD_FAILED',
        resourceType: 'onboarding',
        resourceId: recordId,
        details: {
          error: disableResult.error,
          azureObjectId: record.azure_object_id,
        },
      });
      return {
        success: false,
        error: disableResult.error || 'Failed to disable Azure AD account',
      };
    }

    // Update onboarding record
    await supabaseAdmin
      .from('it_onboarding_records')
      .update({
        status: 'offboarded',
        offboarded_at: new Date().toISOString(),
        offboarded_by: hrUserId,
        offboard_reason: reason,
      })
      .eq('id', recordId);

    // Also update directory_users
    await supabaseAdmin
      .from('it_directory_users')
      .update({ status: 'disabled' })
      .eq('onboarding_record_id', recordId);

    await logAudit({
      userId: hrUserId,
      action: 'OFFBOARD_COMPLETED',
      resourceType: 'onboarding',
      resourceId: recordId,
      details: {
        upn: record.user_principal_name,
        displayName: record.display_name,
        reason,
      },
    });

    return { success: true };
  }

  // ===========================================================================
  // EMPLOYEE MODIFICATION
  // ===========================================================================

  async modifyEmployee(
    recordId: string,
    changes: { jobTitle?: string; department?: string },
    hrUserId: string
  ): Promise<ServiceResult> {
    if (!this.isEnabled()) {
      return { success: false, error: 'Service is not enabled' };
    }

    const { data: record, error } = await supabaseAdmin
      .from('it_onboarding_records')
      .select('*')
      .eq('id', recordId)
      .single();

    if (error || !record) {
      return { success: false, error: 'Employee record not found' };
    }

    if (!record.azure_object_id) {
      return { success: false, error: 'No Azure AD account linked to this employee' };
    }

    if (record.status === 'offboarded') {
      return { success: false, error: 'Cannot modify an offboarded employee' };
    }

    // Build Azure AD update payload
    const azureUpdate: Record<string, string | null> = {};
    const dbUpdate: Record<string, string | null> = {};

    if (changes.jobTitle !== undefined) {
      azureUpdate.jobTitle = changes.jobTitle || null;
      dbUpdate.job_title = changes.jobTitle || null;
    }
    if (changes.department !== undefined) {
      azureUpdate.department = changes.department || null;
      dbUpdate.department = changes.department || null;
    }

    if (Object.keys(azureUpdate).length === 0) {
      return { success: false, error: 'No changes specified' };
    }

    // Update Azure AD
    const patchResult = await this.callGraphAPI(`/users/${record.azure_object_id}`, {
      method: 'PATCH',
      body: JSON.stringify(azureUpdate),
    });

    if (!patchResult.success) {
      return {
        success: false,
        error: patchResult.error || 'Failed to update Azure AD user',
      };
    }

    // Update onboarding record
    await supabaseAdmin
      .from('it_onboarding_records')
      .update({
        ...dbUpdate,
        last_modified_at: new Date().toISOString(),
        last_modified_by: hrUserId,
      })
      .eq('id', recordId);

    // Also update directory_users
    await supabaseAdmin
      .from('it_directory_users')
      .update(dbUpdate)
      .eq('onboarding_record_id', recordId);

    await logAudit({
      userId: hrUserId,
      action: 'EMPLOYEE_MODIFIED',
      resourceType: 'onboarding',
      resourceId: recordId,
      details: {
        upn: record.user_principal_name,
        changes,
      },
    });

    return { success: true };
  }

  // ===========================================================================
  // RESEND CREDENTIALS
  // ===========================================================================

  async resendCredentials(
    recordId: string,
    hrUserId: string
  ): Promise<ServiceResult> {
    if (!this.isEnabled()) {
      return { success: false, error: 'Service is not enabled' };
    }

    const { data: record, error } = await supabaseAdmin
      .from('it_onboarding_records')
      .select('*')
      .eq('id', recordId)
      .single();

    if (error || !record) {
      return { success: false, error: 'Employee record not found' };
    }

    if (!record.azure_object_id) {
      return { success: false, error: 'No Azure AD account linked to this employee' };
    }

    if (record.status === 'offboarded') {
      return { success: false, error: 'Cannot resend credentials for an offboarded employee' };
    }

    // Generate a new temporary password
    const newPassword = this.generateTemporaryPassword();

    // Reset password in Azure AD
    const resetResult = await this.callGraphAPI(`/users/${record.azure_object_id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        passwordProfile: {
          forceChangePasswordNextSignIn: true,
          password: newPassword,
        },
      }),
    });

    if (!resetResult.success) {
      return {
        success: false,
        error: resetResult.error || 'Failed to reset password in Azure AD',
      };
    }

    // Send email with new credentials
    const emailResult = await this.sendCredentialEmail(
      record.personal_email,
      record.user_principal_name,
      newPassword,
      record.display_name
    );

    if (!emailResult.success) {
      return {
        success: false,
        error: emailResult.error || 'Password was reset but email delivery failed',
      };
    }

    // Update record
    await supabaseAdmin
      .from('it_onboarding_records')
      .update({
        credentials_emailed: true,
        credentials_emailed_at: new Date().toISOString(),
      })
      .eq('id', recordId);

    await logAudit({
      userId: hrUserId,
      action: 'CREDENTIALS_RESENT',
      resourceType: 'onboarding',
      resourceId: recordId,
      details: {
        upn: record.user_principal_name,
        sentTo: record.personal_email,
      },
    });

    return { success: true };
  }

  // ===========================================================================
  // EMPLOYEE QUERIES
  // ===========================================================================

  async getEmployees(
    filters?: { status?: string; search?: string }
  ): Promise<ServiceResult<EmployeeRecord[]>> {
    let query = supabaseAdmin
      .from('it_onboarding_records')
      .select('*')
      .order('created_at', { ascending: false });

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    if (filters?.search) {
      const s = `%${filters.search}%`;
      query = query.or(
        `first_name.ilike.${s},last_name.ilike.${s},user_principal_name.ilike.${s},personal_email.ilike.${s}`
      );
    }

    const { data, error } = await query;

    if (error) {
      return { success: false, error: 'Failed to fetch employees' };
    }

    const employees: EmployeeRecord[] = (data || []).map((r) => ({
      id: r.id,
      firstName: r.first_name,
      lastName: r.last_name,
      personalEmail: r.personal_email,
      jobTitle: r.job_title,
      department: r.department,
      userPrincipalName: r.user_principal_name,
      displayName: r.display_name,
      azureObjectId: r.azure_object_id,
      licenseAssigned: r.license_assigned,
      credentialsEmailed: r.credentials_emailed,
      credentialsEmailedAt: r.credentials_emailed_at,
      status: r.status,
      errorMessage: r.error_message,
      offboardedAt: r.offboarded_at,
      offboardReason: r.offboard_reason,
      lastModifiedAt: r.last_modified_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));

    return { success: true, data: employees };
  }

  async getEmployee(recordId: string): Promise<ServiceResult<EmployeeRecord>> {
    const { data, error } = await supabaseAdmin
      .from('it_onboarding_records')
      .select('*')
      .eq('id', recordId)
      .single();

    if (error || !data) {
      return { success: false, error: 'Employee not found' };
    }

    const employee: EmployeeRecord = {
      id: data.id,
      firstName: data.first_name,
      lastName: data.last_name,
      personalEmail: data.personal_email,
      jobTitle: data.job_title,
      department: data.department,
      userPrincipalName: data.user_principal_name,
      displayName: data.display_name,
      azureObjectId: data.azure_object_id,
      licenseAssigned: data.license_assigned,
      credentialsEmailed: data.credentials_emailed,
      credentialsEmailedAt: data.credentials_emailed_at,
      status: data.status,
      errorMessage: data.error_message,
      offboardedAt: data.offboarded_at,
      offboardReason: data.offboard_reason,
      lastModifiedAt: data.last_modified_at,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };

    return { success: true, data: employee };
  }

  // ===========================================================================
  // DASHBOARD STATS
  // ===========================================================================

  async getDashboardStats(): Promise<ServiceResult<DashboardStats>> {
    const { data: all, error } = await supabaseAdmin
      .from('it_onboarding_records')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return { success: false, error: 'Failed to fetch dashboard stats' };
    }

    const records = all || [];

    const stats: DashboardStats = {
      totalEmployees: records.length,
      activeEmployees: records.filter((r) => r.status === 'completed').length,
      pendingOnboarding: records.filter((r) => r.status === 'pending' || r.status === 'provisioning').length,
      offboardedEmployees: records.filter((r) => r.status === 'offboarded').length,
      failedOnboarding: records.filter((r) => r.status === 'failed').length,
      recentOnboardings: records.slice(0, 5).map((r) => ({
        id: r.id,
        firstName: r.first_name,
        lastName: r.last_name,
        personalEmail: r.personal_email,
        jobTitle: r.job_title,
        department: r.department,
        userPrincipalName: r.user_principal_name,
        displayName: r.display_name,
        azureObjectId: r.azure_object_id,
        licenseAssigned: r.license_assigned,
        credentialsEmailed: r.credentials_emailed,
        credentialsEmailedAt: r.credentials_emailed_at,
        status: r.status,
        errorMessage: r.error_message,
        offboardedAt: r.offboarded_at,
        offboardReason: r.offboard_reason,
        lastModifiedAt: r.last_modified_at,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
    };

    return { success: true, data: stats };
  }
}

// Export singleton instance
export const hrOnboardingService = new HROnboardingService();
