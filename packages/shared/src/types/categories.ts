/**
 * Ticket Categories
 *
 * Fixed set of categories for issue classification.
 * The agent MUST classify each ticket into exactly one category.
 */

/**
 * Valid ticket categories
 */
export type TicketCategory =
  | 'login_password'
  | 'email'
  | 'network_wifi'
  | 'vpn'
  | 'software_installation'
  | 'hardware'
  | 'security';

/**
 * Category metadata for display and handling
 */
export interface CategoryInfo {
  id: TicketCategory;
  label: string;
  description: string;
  /** Categories that must always be escalated */
  alwaysEscalate: boolean;
  /** Keywords that might indicate this category */
  keywords: string[];
}

/**
 * Complete category definitions with metadata
 */
export const TICKET_CATEGORIES: Record<TicketCategory, CategoryInfo> = {
  login_password: {
    id: 'login_password',
    label: 'Login / Password',
    description: 'Issues with logging in, password resets, or authentication',
    alwaysEscalate: false,
    keywords: [
      'login',
      'password',
      'sign in',
      'signin',
      'log in',
      'forgot password',
      'reset password',
      'locked out',
      'account locked',
      'authentication',
      'mfa',
      '2fa',
      'two factor',
    ],
  },
  email: {
    id: 'email',
    label: 'Email (Microsoft 365 / Outlook)',
    description: 'Issues with email, Outlook, or Microsoft 365 mail services',
    alwaysEscalate: false,
    keywords: [
      'email',
      'outlook',
      'mail',
      'inbox',
      'send email',
      'receive email',
      'calendar',
      'meeting invite',
      'office 365',
      'microsoft 365',
      'm365',
      'exchange',
    ],
  },
  network_wifi: {
    id: 'network_wifi',
    label: 'Network / Wi-Fi',
    description: 'Issues with network connectivity, Wi-Fi, or internet access',
    alwaysEscalate: false,
    keywords: [
      'wifi',
      'wi-fi',
      'network',
      'internet',
      'connection',
      'disconnected',
      'slow internet',
      'no internet',
      'ethernet',
      'lan',
      'wireless',
    ],
  },
  vpn: {
    id: 'vpn',
    label: 'VPN',
    description: 'Issues with VPN connection or remote access',
    alwaysEscalate: false,
    keywords: [
      'vpn',
      'remote access',
      'work from home',
      'wfh',
      'connect to office',
      'tunnel',
      'globalprotect',
      'cisco anyconnect',
      'remote desktop',
    ],
  },
  software_installation: {
    id: 'software_installation',
    label: 'Software Installation',
    description: 'Requests for software installation or application issues',
    alwaysEscalate: false,
    keywords: [
      'install',
      'software',
      'application',
      'app',
      'program',
      'download',
      'update',
      'upgrade',
      'license',
      'activation',
    ],
  },
  hardware: {
    id: 'hardware',
    label: 'Hardware',
    description: 'Physical hardware issues - ALWAYS ESCALATE',
    alwaysEscalate: true,
    keywords: [
      'hardware',
      'laptop',
      'computer',
      'monitor',
      'keyboard',
      'mouse',
      'printer',
      'screen',
      'broken',
      'damaged',
      'not working',
      'phone',
      'headset',
    ],
  },
  security: {
    id: 'security',
    label: 'Security',
    description: 'Security concerns or incidents - ALWAYS ESCALATE',
    alwaysEscalate: true,
    keywords: [
      'security',
      'virus',
      'malware',
      'phishing',
      'hack',
      'hacked',
      'suspicious',
      'breach',
      'compromised',
      'ransomware',
      'spam',
      'scam',
      'data leak',
    ],
  },
};

/**
 * Get all category IDs
 */
export function getAllCategories(): TicketCategory[] {
  return Object.keys(TICKET_CATEGORIES) as TicketCategory[];
}

/**
 * Get categories that require immediate escalation
 */
export function getEscalationCategories(): TicketCategory[] {
  return Object.entries(TICKET_CATEGORIES)
    .filter(([, info]) => info.alwaysEscalate)
    .map(([id]) => id as TicketCategory);
}

/**
 * Check if a category requires immediate escalation
 */
export function requiresEscalation(category: TicketCategory): boolean {
  return TICKET_CATEGORIES[category]?.alwaysEscalate ?? false;
}
