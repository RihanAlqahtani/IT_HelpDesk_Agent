/**
 * PII Redactor Utility
 *
 * Redacts Personally Identifiable Information from text before logging or LLM processing.
 * This is a critical security component.
 */

import { env } from '../config/env.js';

/**
 * Patterns for common PII types
 */
const PII_PATTERNS: Array<{ name: string; pattern: RegExp; replacement: string }> = [
  // Email addresses
  {
    name: 'email',
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    replacement: '[EMAIL_REDACTED]',
  },
  // Phone numbers (various formats)
  {
    name: 'phone',
    pattern: /\b(\+?1?[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    replacement: '[PHONE_REDACTED]',
  },
  // Social Security Numbers
  {
    name: 'ssn',
    pattern: /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g,
    replacement: '[SSN_REDACTED]',
  },
  // Credit card numbers (basic pattern)
  {
    name: 'credit_card',
    pattern: /\b(?:\d{4}[-.\s]?){3}\d{4}\b/g,
    replacement: '[CARD_REDACTED]',
  },
  // IP addresses (IPv4)
  {
    name: 'ipv4',
    pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    replacement: '[IP_REDACTED]',
  },
  // Passwords mentioned in text
  {
    name: 'password_mention',
    pattern: /password\s*[:=]\s*["']?[^\s"']+["']?/gi,
    replacement: '[PASSWORD_REDACTED]',
  },
  // API keys (common formats)
  {
    name: 'api_key',
    pattern: /\b(api[_-]?key|apikey|api[_-]?secret|secret[_-]?key)\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}["']?/gi,
    replacement: '[API_KEY_REDACTED]',
  },
  // Bearer tokens
  {
    name: 'bearer_token',
    pattern: /Bearer\s+[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/gi,
    replacement: 'Bearer [TOKEN_REDACTED]',
  },
  // Employee IDs (common format: EMP followed by digits)
  {
    name: 'employee_id',
    pattern: /\b(EMP|emp|Emp)[-_]?\d{4,}\b/g,
    replacement: '[EMPLOYEE_ID_REDACTED]',
  },
];

/**
 * Sensitive field names that should have their values redacted
 */
const SENSITIVE_FIELDS = [
  'password',
  'pass',
  'pwd',
  'secret',
  'token',
  'api_key',
  'apikey',
  'access_token',
  'refresh_token',
  'private_key',
  'ssn',
  'social_security',
  'credit_card',
  'card_number',
  'cvv',
  'pin',
];

/**
 * Redact PII from a string
 * @param text The text to redact
 * @param options Redaction options
 * @returns Redacted text
 */
export function redactPII(
  text: string,
  options: { preserveFormat?: boolean } = {}
): string {
  // Skip if redaction is disabled
  if (!env.PII_REDACTION_ENABLED) {
    return text;
  }

  let redacted = text;

  // Apply all PII patterns
  for (const { pattern, replacement } of PII_PATTERNS) {
    redacted = redacted.replace(pattern, replacement);
  }

  return redacted;
}

/**
 * Redact PII from an object (recursively)
 * @param obj The object to redact
 * @returns Redacted object copy
 */
export function redactPIIFromObject<T extends Record<string, unknown>>(obj: T): T {
  if (!env.PII_REDACTION_ENABLED) {
    return obj;
  }

  const redacted = { ...obj };

  for (const [key, value] of Object.entries(redacted)) {
    const lowerKey = key.toLowerCase();

    // Check if this is a sensitive field
    if (SENSITIVE_FIELDS.some((f) => lowerKey.includes(f))) {
      (redacted as Record<string, unknown>)[key] = '[REDACTED]';
      continue;
    }

    // Recursively process nested objects
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      (redacted as Record<string, unknown>)[key] = redactPIIFromObject(
        value as Record<string, unknown>
      );
    } else if (typeof value === 'string') {
      (redacted as Record<string, unknown>)[key] = redactPII(value);
    } else if (Array.isArray(value)) {
      (redacted as Record<string, unknown>)[key] = value.map((item) => {
        if (typeof item === 'string') {
          return redactPII(item);
        } else if (item && typeof item === 'object') {
          return redactPIIFromObject(item as Record<string, unknown>);
        }
        return item;
      });
    }
  }

  return redacted;
}

/**
 * Redact conversation history for LLM processing
 * Preserves message structure but redacts PII from content
 */
export function redactConversationHistory(
  messages: Array<{ role: string; content: string }>
): Array<{ role: string; content: string }> {
  return messages.map((msg) => ({
    role: msg.role,
    content: redactPII(msg.content),
  }));
}

/**
 * Check if a string contains potential PII
 * @param text The text to check
 * @returns true if potential PII is detected
 */
export function containsPII(text: string): boolean {
  for (const { pattern } of PII_PATTERNS) {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      return true;
    }
  }
  return false;
}

/**
 * Get a summary of PII types found in text
 * @param text The text to analyze
 * @returns Array of PII type names found
 */
export function detectPIITypes(text: string): string[] {
  const found: string[] = [];

  for (const { name, pattern } of PII_PATTERNS) {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      found.push(name);
    }
  }

  return found;
}
