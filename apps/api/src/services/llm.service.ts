/**
 * LLM Service
 *
 * Handles all interactions with the private LLM.
 * Implements safety constraints and response validation.
 *
 * SECURITY: The LLM can ONLY produce structured decisions.
 * It NEVER directly executes any actions.
 */

import { env, isAzureADConfigured } from '../config/env.js';
import { redactPII, redactConversationHistory } from '../utils/pii-redactor.js';
import type {
  AgentResponse,
  TicketCategory,
  TroubleshootingStep,
} from '@it-helpdesk/shared';
import { validateAgentResponse, requiresEscalation, TICKET_CATEGORIES } from '@it-helpdesk/shared';

/**
 * Context provided to the LLM for ticket analysis
 */
export interface TicketContext {
  ticketId: string;
  subject: string;
  description: string;
  category?: TicketCategory;
  previousStepsAttempted?: string[];
  userDepartment?: string;
}

/**
 * Conversation message format
 */
export interface ConversationMessage {
  role: 'user' | 'agent' | 'system';
  content: string;
}

/**
 * Extended agent response with generated subject
 */
export interface InitialClassificationResponse extends AgentResponse {
  generated_subject: string;
}

/**
 * LLM Service for AI agent interactions
 */
export class LLMService {
  private endpoint: string;
  private apiKey: string;
  private model: string;
  private maxTokens: number;
  private temperature: number;
  private timeoutMs: number;

  constructor() {
    this.endpoint = env.LLM_ENDPOINT;
    this.apiKey = env.LLM_API_KEY;
    this.model = env.LLM_MODEL;
    this.maxTokens = env.LLM_MAX_TOKENS;
    this.temperature = env.LLM_TEMPERATURE;
    this.timeoutMs = env.LLM_TIMEOUT_MS;
  }

  /**
   * Get initial classification for a new conversation
   * This is called on the first message to classify the issue and generate a subject
   */
  async getInitialClassification(
    userMessage: string
  ): Promise<InitialClassificationResponse> {
    const systemPrompt = this.buildInitialClassificationPrompt();

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: redactPII(userMessage) },
    ];

    const rawResponse = await this.callLLM(messages);
    const parsedResponse = this.parseResponse(rawResponse) as Record<string, unknown>;

    // Validate and extract the response
    const validation = validateAgentResponse(parsedResponse);
    if (!validation.valid) {
      console.error('Invalid initial classification response:', validation.errors);
      return this.createFallbackInitialResponse(userMessage);
    }

    // Enforce security constraints
    const safeResponse = this.enforceSecurityConstraints(validation.sanitized!);

    // Extract generated subject
    const generatedSubject = (parsedResponse.generated_subject as string) ||
      this.generateSubjectFromMessage(userMessage);

    return {
      ...safeResponse,
      generated_subject: generatedSubject,
    };
  }

  /**
   * Build system prompt for initial classification
   */
  private buildInitialClassificationPrompt(): string {
    const categories = Object.values(TICKET_CATEGORIES)
      .map((c) => `- ${c.id}${c.alwaysEscalate ? ' (ALWAYS escalate immediately)' : ''}`)
      .join('\n');

    return `You are an IT Helpdesk AI assistant. Analyze the user's issue and provide classification and initial response.

## YOUR TASKS
1. Classify the issue into exactly ONE category
2. Determine the severity (low/medium/high)
3. Generate a concise ticket subject (max 100 chars)
4. Decide the best initial response:
   - For hardware/security issues: IMMEDIATELY escalate
   - For other issues: Ask 1-2 clarifying questions OR provide initial troubleshooting steps

## CATEGORIES (choose exactly one)
${categories}

## CRITICAL RULES
- Hardware and security issues MUST be escalated immediately - no troubleshooting
- For other categories: Start with clarifying questions to understand the issue better
- Don't provide too many steps at once - have a conversation
- NEVER request passwords or sensitive credentials
- Be helpful and patient

## RESPONSE SCHEMA (strict JSON)
{
  "generated_subject": "Brief, clear subject for the ticket (max 100 chars)",
  "decision": "guide | escalate",
  "category": "<category_id>",
  "severity": "low | medium | high",
  "clarifying_questions": ["Question about the issue..."],
  "troubleshooting_steps": [
    {
      "step_number": 1,
      "instruction": "Clear instruction",
      "expected_outcome": "What should happen"
    }
  ],
  "proposed_privileged_action": null,
  "escalation_summary": null | {
    "reason": "Why this needs human IT support",
    "details": "Additional context"
  }
}

## BEHAVIOR FOR FIRST MESSAGE
- If hardware/security: Set decision="escalate" and provide escalation_summary
- If other: Prefer clarifying_questions (1-2 questions) to understand the issue better
- Only provide troubleshooting_steps if the issue is very clear from the first message`;
  }

  /**
   * Generate a subject from user message
   */
  private generateSubjectFromMessage(message: string): string {
    const cleaned = message.replace(/\s+/g, ' ').trim();
    if (cleaned.length <= 100) return cleaned;
    return cleaned.substring(0, 97) + '...';
  }

  /**
   * Create fallback response for initial classification
   */
  private createFallbackInitialResponse(message: string): InitialClassificationResponse {
    return {
      decision: 'guide',
      category: 'login_password',
      severity: 'medium',
      clarifying_questions: [
        'Could you provide more details about the issue you are experiencing?',
        'When did this issue start occurring?',
      ],
      troubleshooting_steps: [],
      proposed_privileged_action: null,
      escalation_summary: null,
      generated_subject: this.generateSubjectFromMessage(message),
    };
  }

  /**
   * Get agent response for a ticket
   */
  async getAgentResponse(
    ticketContext: TicketContext,
    conversationHistory: ConversationMessage[],
    turnCount: number = 1
  ): Promise<AgentResponse> {
    // 1. Redact PII from context and history FIRST
    const redactedContext = this.redactTicketContext(ticketContext);
    const redactedHistory = redactConversationHistory(
      conversationHistory.map((m) => ({ role: m.role, content: m.content }))
    );

    // 2. Build system prompt with redacted context and turn count
    const systemPrompt = this.buildSystemPrompt(redactedContext, turnCount);

    // 3. Build messages — just system prompt + history, no duplicate context
    const messages = this.buildMessages(systemPrompt, redactedHistory);

    // 4. Call LLM
    const rawResponse = await this.callLLM(messages);

    // 5. Parse and validate response
    const parsedResponse = this.parseResponse(rawResponse);

    // 6. Validate response structure
    const validation = validateAgentResponse(parsedResponse);
    if (!validation.valid) {
      console.error('Invalid LLM response:', validation.errors);
      // Return a safe fallback response
      return this.createFallbackResponse(ticketContext);
    }

    // 7. Enforce security constraints
    const safeResponse = this.enforceSecurityConstraints(validation.sanitized!);

    return safeResponse;
  }

  /**
   * Build the system prompt with ticket context, turn awareness, and category guides.
   */
  private buildSystemPrompt(context: TicketContext, turnCount: number): string {
    const categories = Object.values(TICKET_CATEGORIES)
      .map((c) => `- ${c.id}${c.alwaysEscalate ? ' (ALWAYS escalate)' : ''}`)
      .join('\n');

    const privilegedActionsEnabled = this.arePrivilegedActionsAvailable();

    // Inject category-specific troubleshooting guide
    const categoryGuide = context.category
      ? this.getCategoryTroubleshootingGuide(context.category)
      : '';

    // Inject password reset instructions only when relevant and available
    const passwordResetInstructions = privilegedActionsEnabled
      ? this.getPasswordResetInstructions()
      : '';

    return `You are an IT Helpdesk support agent${privilegedActionsEnabled ? ' with PASSWORD RESET CAPABILITY' : ''}. You are continuing an ongoing conversation with a user who needs IT help. Read the FULL conversation history before responding.

## TICKET CONTEXT
- Ticket ID: ${context.ticketId}
- Subject: ${context.subject}
- Description: ${context.description}
${context.category ? `- Category: ${context.category}` : ''}
${context.previousStepsAttempted?.length ? `- Previously Attempted: ${context.previousStepsAttempted.join(', ')}` : ''}
${context.userDepartment ? `- User Department: ${context.userDepartment}` : ''}

## CONVERSATION STATE
- This is user turn #${turnCount} in the conversation.
- You must read ALL previous messages to understand what has already been discussed.
- NEVER repeat a question the user already answered.
- NEVER suggest a troubleshooting step that was already tried.

## CONVERSATION PACING
${turnCount <= 2 ? `You are in the EARLY stage (turn ${turnCount}). Focus on understanding the issue:
- Ask 1-2 focused clarifying questions to understand what exactly is happening.
- Gather specifics: error messages, when it started, what changed, which device/app.
- Do NOT rush to provide solutions yet unless the issue is very straightforward.
- Do NOT escalate — you are just getting started.` : ''}
${turnCount >= 3 && turnCount <= 5 ? `You are in the TROUBLESHOOTING stage (turn ${turnCount}). Provide specific steps:
- You should have enough context now to give targeted troubleshooting steps.
- Provide 1-2 concrete steps at a time — not a huge list.
- Wait for the user to try each step and report back.
- If one approach fails, have alternatives ready.` : ''}
${turnCount >= 6 && turnCount <= 8 ? `You are in the ADVANCED TROUBLESHOOTING stage (turn ${turnCount}). Try different approaches:
- Previous steps likely didn't fully resolve the issue.
- Try a different angle or more advanced troubleshooting.
- Consider less common causes.
- Escalation is acceptable if you've genuinely exhausted your troubleshooting options.` : ''}
${turnCount >= 9 ? `You are in the LATE stage (turn ${turnCount}). Wrap up:
- You've been troubleshooting for a while.
- If the issue persists, it's reasonable to escalate to human IT support.
- Summarize what was tried when escalating.` : ''}

## DECISIONS
- "guide": Provide troubleshooting steps or ask clarifying questions (use this most of the time)
- "resolve": The issue has been confirmed resolved BY THE USER
- "escalate": ONLY for hardware/security issues, OR after extensive troubleshooting has failed (turn 6+)
- "request_approval": ${privilegedActionsEnabled ? 'For password resets — see PASSWORD RESET section below' : 'Not available in this deployment'}

## ESCALATION RULES — IMPORTANT
- **hardware** and **security** categories: Escalate IMMEDIATELY. Do not troubleshoot.
- **All other categories**: Do NOT escalate until you have tried multiple troubleshooting approaches across several turns.
- Before escalating a non-hardware/non-security issue, you MUST have:
  1. Asked clarifying questions to understand the problem fully
  2. Provided at least 2-3 different troubleshooting approaches
  3. Confirmed that the user tried the steps and they didn't work
- A vague "it doesn't work" from the user is NOT reason to escalate — ask what specifically happened.

${categoryGuide}

${passwordResetInstructions}

## CATEGORIES (choose exactly one)
${categories}

## RESOLVING TICKETS
Use decision="resolve" when:
- User confirms their issue is fixed ("it works now", "I can log in", "thanks, all good")
- User says the password reset worked and they successfully logged in
- User explicitly says the problem is solved

**DO NOT auto-resolve** — always wait for user confirmation!

## RESPONSE SCHEMA (strict JSON)
{
  "decision": "guide | resolve | escalate | request_approval",
  "category": "<category_id>",
  "severity": "low | medium | high",
  "clarifying_questions": ["question1", "question2"],
  "troubleshooting_steps": [
    {
      "step_number": 1,
      "instruction": "Clear instruction for the user",
      "expected_outcome": "What should happen if successful"
    }
  ],
  "proposed_privileged_action": null | {
    "action": "password_reset",
    "target": "user's actual email address",
    "justification": "Why this action is needed"
  },
  "escalation_summary": null | {
    "reason": "Why escalation is needed",
    "details": "Context for IT support team"
  }
}

## REMINDERS
- Be helpful and patient. Use non-technical language when possible.
- Respond ONLY in valid JSON matching the schema above.
- NEVER request passwords, credentials, or sensitive information from users.
- Do NOT repeat questions the user already answered in the conversation history.
- Do NOT suggest steps the user already tried.
- Provide clear, actionable instructions.`;
  }

  /**
   * Get category-specific troubleshooting guide
   */
  private getCategoryTroubleshootingGuide(category: TicketCategory): string {
    const guides: Partial<Record<TicketCategory, string>> = {
      login_password: `## TROUBLESHOOTING GUIDE: Login / Password
1. Identify: Which account/system are they trying to log into? Get their email address.
2. Basic checks: Is Caps Lock on? Are they using the correct username format (email vs username)?
3. Browser issues: Try clearing browser cache, try incognito/private window, try a different browser.
4. Self-service: Have they tried the "Forgot Password" link? Did they check spam folder for reset email?
5. If self-service reset failed → Use request_approval to initiate a password reset (if available).
6. After reset: Ask user to confirm they can log in.

WHEN TO ESCALATE: Only if the account appears to be disabled/deleted at the directory level, or if MFA device is lost (not just password). For password issues, prefer request_approval over escalation.`,

      email: `## TROUBLESHOOTING GUIDE: Email (Outlook / Microsoft 365)
1. Identify the problem type: Cannot send? Cannot receive? App crashes? Calendar issue? Sync issue?
2. Check scope: Is it just one recipient, or all email? Just this device, or web too?
3. Web vs Desktop: Can they access email via Outlook Web (outlook.office.com)?
   - If web works but desktop doesn't → the issue is with the Outlook desktop app.
   - If web also fails → possible account or server issue.
4. Desktop Outlook fixes:
   - Restart Outlook completely (close + reopen)
   - Clear Outlook cache: File > Account Settings > Offline Settings
   - Start in safe mode: Hold Ctrl while launching Outlook → disables add-ins
   - Check for updates: File > Office Account > Update Options
   - Remove and re-add email account in Outlook settings
5. Send/receive issues:
   - Check outbox for stuck emails
   - Verify recipient address is correct
   - Check if attachments are too large (typically 25MB limit)
6. Calendar/meeting issues:
   - Check time zone settings
   - Try removing and re-adding the meeting

WHEN TO ESCALATE: Only if it's a server-side issue (all users affected), mailbox quota needs admin increase, or account permissions need changing.`,

      network_wifi: `## TROUBLESHOOTING GUIDE: Network / Wi-Fi
1. Location: Are they in the office or working from home?
2. Scope: Is it just their device, or are other people/devices affected too?
3. Basic connectivity checks:
   - Is Wi-Fi turned on? Is airplane mode off?
   - Can they see the network name in the list?
   - Try toggling Wi-Fi off, wait 10 seconds, turn back on.
4. Forget and reconnect:
   - Forget the Wi-Fi network → reconnect with password.
   - On Windows: Settings > Network & Internet > Wi-Fi > Manage Known Networks
   - On Mac: System Settings > Wi-Fi > click (i) next to network > Forget
5. Device restart: Restart the computer/laptop entirely.
6. DNS and IP:
   - Try flushing DNS: Open terminal/cmd → type "ipconfig /flushdns" (Windows) or "sudo dscacheutil -flushcache" (Mac)
   - Try switching to Google DNS (8.8.8.8) temporarily
7. Wired connection: If Wi-Fi won't work, try plugging in with an ethernet cable to rule out Wi-Fi vs internet issue.

WHEN TO ESCALATE: Only if multiple users are affected (infrastructure issue), or if the device connects to other networks fine but not the office network (may need network team).`,

      vpn: `## TROUBLESHOOTING GUIDE: VPN
1. Which VPN client: GlobalProtect, Cisco AnyConnect, or other? What version?
2. Error message: Ask for the exact error message or screenshot.
3. Internet first: Can they access regular websites? VPN requires working internet.
4. Basic fixes:
   - Disconnect and reconnect the VPN.
   - Completely quit the VPN client and relaunch it.
   - Restart the computer.
5. Network interference:
   - If on home Wi-Fi, try a different network or mobile hotspot to rule out ISP blocking.
   - Disable any personal firewall or antivirus temporarily to test.
6. VPN client reset:
   - Uninstall and reinstall the VPN client.
   - Check if VPN client needs an update.
7. Credentials: Make sure VPN credentials match their corporate login. If MFA is required, ensure they're approving the MFA prompt.

WHEN TO ESCALATE: Only if the VPN server itself appears to be down (multiple users affected), or if their account specifically needs VPN access enabled by IT.`,

      software_installation: `## TROUBLESHOOTING GUIDE: Software Installation
1. What software: Name, version, is it new install or existing app broken?
2. For existing app issues:
   - Restart the application fully (quit and reopen).
   - Restart the computer.
   - Check for updates to the application.
   - Try running as administrator (right-click > Run as Administrator on Windows).
3. For new installations:
   - Check if the software is available in the company's self-service portal.
   - Check if they have enough disk space.
   - Check system requirements.
4. Common install errors:
   - "Access denied" / "Administrator required" → they may need admin rights
   - "Already installed" → check Programs & Features / Applications folder
   - Download/installer corruption → re-download the installer
5. License/activation issues:
   - Check if the company has licenses available.
   - Try deactivating and reactivating the license.

WHEN TO ESCALATE: Only if installation requires admin privileges they don't have, the software needs a license purchase, or the app requires IT-managed deployment.`,

      hardware: `## HARDWARE — ESCALATE IMMEDIATELY
Hardware issues require physical inspection or replacement by the IT support team.
Do NOT attempt to troubleshoot hardware issues. Set decision="escalate" immediately.
Provide a clear escalation_summary describing the hardware problem.`,

      security: `## SECURITY — ESCALATE IMMEDIATELY
Security incidents require immediate attention from the security team.
Do NOT attempt to troubleshoot security issues. Set decision="escalate" immediately.
Provide a clear escalation_summary describing the security concern.
Advise the user not to click any suspicious links or open any suspicious attachments in the meantime.`,
    };

    return guides[category] || '';
  }

  /**
   * Get password reset instructions — preserved verbatim from original prompt.
   * Only included when privileged actions are available.
   */
  private getPasswordResetInstructions(): string {
    return `## ⚠️ PASSWORD RESET - YOU CAN DO THIS! ⚠️
**This system CAN reset passwords.** When a user has login/password problems:

1. First message: Ask which email/account they need help with
2. If they give email: Provide 1-2 quick troubleshooting steps (caps lock, browser cache)
3. **When user says troubleshooting didn't work**: USE decision="request_approval"
   - DO NOT escalate password issues - use request_approval instead!
   - Set proposed_privileged_action with their email address
   - An IT Admin will approve and the password will be reset automatically

**EXAMPLE - If user "john.doe@company.com" says "the reset link didn't work":**
{
  "decision": "request_approval",
  "category": "login_password",
  "severity": "medium",
  "clarifying_questions": [],
  "troubleshooting_steps": [],
  "proposed_privileged_action": {
    "action": "password_reset",
    "target": "john.doe@company.com",
    "justification": "User tried self-service reset but link did not work"
  },
  "escalation_summary": null
}

**CRITICAL: The "target" field MUST be the ACTUAL email address the user mentioned in the conversation - NOT a placeholder!**
**NEVER use "user@example.com" - always extract the real email from the conversation!**
**NEVER escalate password/login issues - always use request_approval!**

## WORKFLOW FOR LOGIN/PASSWORD ISSUES
1. Ask: "What is the email address for the account you need help with?"
2. Once you have the email, provide quick troubleshooting (caps lock, clear cache, try incognito)
3. If user says it still doesn't work or reset link failed → USE request_approval with their email
4. After password is reset: Wait for user to confirm it's working
5. **When user confirms** (says "it works", "I'm in", "password working", "logged in successfully", "thanks it's fixed", etc.) → USE decision="resolve"`;
  }

  /**
   * Redact PII from ticket context
   */
  private redactTicketContext(context: TicketContext): TicketContext {
    return {
      ...context,
      subject: redactPII(context.subject),
      description: redactPII(context.description),
    };
  }

  /**
   * Build messages array for LLM API
   * Context is already embedded in the system prompt — no duplicate context block.
   */
  private buildMessages(
    systemPrompt: string,
    history: Array<{ role: string; content: string }>
  ): Array<{ role: string; content: string }> {
    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: systemPrompt },
    ];

    // Add conversation history — user messages are already there, no duplication
    for (const msg of history) {
      messages.push({
        role: msg.role === 'agent' ? 'assistant' : msg.role,
        content: msg.content,
      });
    }

    return messages;
  }

  /**
   * Call the LLM API
   */
  private async callLLM(
    messages: Array<{ role: string; content: string }>
  ): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
          'X-API-Key': this.apiKey,
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          max_tokens: this.maxTokens,
          temperature: this.temperature,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`LLM API error: ${response.status} - ${error}`);
      }

      const data = await response.json() as Record<string, unknown>;

      // Handle different response formats from various LLM providers
      const choices = data.choices as Array<{ message?: { content?: string } }> | undefined;
      const content =
        choices?.[0]?.message?.content ||
        (data.response as string) ||
        (data.content as string) ||
        (data.text as string);

      if (!content) {
        throw new Error('No content in LLM response');
      }

      return content;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Parse LLM response string to object
   */
  private parseResponse(responseText: string): unknown {
    try {
      // Try to extract JSON from the response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return JSON.parse(responseText);
    } catch (error) {
      console.error('Failed to parse LLM response:', error);
      return null;
    }
  }

  /**
   * Check if privileged actions (like password reset) are available
   */
  private arePrivilegedActionsAvailable(): boolean {
    return env.FEATURE_PRIVILEGED_ACTIONS && isAzureADConfigured();
  }

  /**
   * Enforce security constraints on the response
   */
  private enforceSecurityConstraints(response: AgentResponse): AgentResponse {
    const safe = { ...response };

    // Force escalation for hardware/security categories
    if (requiresEscalation(safe.category)) {
      safe.decision = 'escalate';
      if (!safe.escalation_summary) {
        safe.escalation_summary = {
          reason: `${safe.category} issues require human IT support`,
          details: 'This category always requires escalation per policy',
        };
      }
    }

    // Handle request_approval based on feature flag
    if (safe.decision === 'request_approval') {
      if (this.arePrivilegedActionsAvailable()) {
        // Allow request_approval if privileged actions are enabled
        // Validate the proposed action
        if (!safe.proposed_privileged_action) {
          // If no action proposed, convert to escalate
          safe.decision = 'escalate';
          safe.escalation_summary = {
            reason: 'Privileged action details missing',
            details: 'The system needs more information to process this request.',
          };
        }
      } else {
        // Block request_approval if privileged actions are disabled
        safe.decision = 'escalate';
        safe.proposed_privileged_action = null;
        safe.escalation_summary = {
          reason: 'Privileged action required',
          details:
            'This action requires manual IT support intervention. Please contact IT directly.',
        };
      }
    }

    // Clear privileged actions if not in request_approval mode
    if (safe.decision !== 'request_approval') {
      safe.proposed_privileged_action = null;
    }

    // Limit clarifying questions
    if (safe.clarifying_questions.length > 4) {
      safe.clarifying_questions = safe.clarifying_questions.slice(0, 4);
    }

    return safe;
  }

  /**
   * Create a safe fallback response when LLM fails
   */
  private createFallbackResponse(context: TicketContext): AgentResponse {
    return {
      decision: 'escalate',
      category: context.category || 'login_password',
      severity: 'medium',
      clarifying_questions: [],
      troubleshooting_steps: [],
      proposed_privileged_action: null,
      escalation_summary: {
        reason: 'Unable to process request automatically',
        details:
          'The AI assistant was unable to process this request. A human IT support agent will assist you.',
      },
    };
  }
}

// Export singleton instance
export const llmService = new LLMService();
