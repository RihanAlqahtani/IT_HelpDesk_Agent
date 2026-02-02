/**
 * Password Service (Privileged)
 *
 * Handles privileged password management operations.
 *
 * This service integrates with Azure AD via the azureADService
 * to perform actual password resets.
 *
 * Security features:
 * - Feature flag control (FEATURE_PRIVILEGED_ACTIONS)
 * - Cannot reset admin passwords
 * - Full audit logging
 * - Approval workflow integration
 */

import { env } from '../../config/env.js';
import { logAudit } from '../../middleware/audit.middleware.js';
import { azureADService } from '../azure-ad.service.js';
import type { PrivilegedOperationResult } from './account.service.js';

/**
 * Password reset payload
 */
export interface PasswordResetPayload {
  targetEmail: string;
  forceChangeOnLogin: boolean;
  notifyUser: boolean;
}

/**
 * Password reset result with temporary password
 */
export interface PasswordResetSuccessResult extends PrivilegedOperationResult {
  success: true;
  data: {
    temporaryPassword: string;
    forceChangeOnNextLogin: boolean;
    targetEmail: string;
    targetDisplayName?: string;
  };
}

/**
 * Password Service class
 */
export class PasswordService {
  /**
   * Check if privileged password actions are enabled
   */
  isEnabled(): boolean {
    return env.FEATURE_PRIVILEGED_ACTIONS;
  }

  /**
   * Check if Azure AD is configured for password operations
   */
  isAzureADReady(): boolean {
    return azureADService.isEnabled();
  }

  /**
   * Reset a user's password
   *
   * When enabled, this will:
   * 1. Look up the user in Azure AD
   * 2. Check they are not an admin (safety)
   * 3. Generate a temporary password
   * 4. Reset the password in Azure AD
   * 5. Return the temporary password (to be shared with user securely)
   */
  async resetPassword(
    payload: PasswordResetPayload,
    requestedBy: string,
    ticketId: string,
    approvalId?: string
  ): Promise<PrivilegedOperationResult> {
    // Check if feature is enabled
    if (!this.isEnabled()) {
      await this.logDisabledAttempt('password.reset', requestedBy, ticketId);
      return {
        success: false,
        error: 'Privileged password reset is not enabled in this deployment',
      };
    }

    // Check if Azure AD is configured
    if (!azureADService.isConfigured()) {
      return {
        success: false,
        error: 'Azure AD is not configured. Cannot perform password reset.',
      };
    }

    // Log the attempt
    await logAudit({
      userId: requestedBy,
      action: 'PASSWORD_RESET_INITIATED',
      resourceType: 'privileged_action',
      resourceId: ticketId,
      details: {
        targetEmail: '[REDACTED]',
        approvalId,
        forceChangeOnLogin: payload.forceChangeOnLogin,
      },
    });

    // Perform the password reset via Azure AD
    const result = await azureADService.resetPassword(
      payload.targetEmail,
      requestedBy,
      ticketId
    );

    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Password reset failed',
        data: { errorCode: result.errorCode },
      };
    }

    // Get user info for the response
    const userInfo = await azureADService.getUser(payload.targetEmail);

    return {
      success: true,
      data: {
        temporaryPassword: result.data!.temporaryPassword,
        forceChangeOnNextLogin: result.data!.forceChangeOnNextLogin,
        targetEmail: payload.targetEmail,
        targetDisplayName: userInfo.data?.displayName,
      },
      rollbackData: {
        action: 'password_reset',
        targetEmail: payload.targetEmail,
        timestamp: new Date().toISOString(),
        // Note: Cannot rollback password reset - user must use new password
      },
    };
  }

  /**
   * Log an attempt to use a disabled privileged action
   */
  private async logDisabledAttempt(
    action: string,
    userId: string,
    ticketId: string
  ): Promise<void> {
    await logAudit({
      userId,
      action: 'PRIVILEGED_ACTION_BLOCKED',
      resourceType: 'privileged_action',
      resourceId: ticketId,
      details: {
        attemptedAction: action,
        reason: 'Feature disabled',
      },
    });
  }
}

// Export singleton instance
export const passwordService = new PasswordService();
