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
    conversationHistory: ConversationMessage[]
  ): Promise<AgentResponse> {
    // 1. Build system prompt with constraints
    const systemPrompt = this.buildSystemPrompt();

    // 2. Redact PII from context and history
    const redactedContext = this.redactTicketContext(ticketContext);
    const redactedHistory = redactConversationHistory(
      conversationHistory.map((m) => ({ role: m.role, content: m.content }))
    );

    // 3. Build messages for LLM
    const messages = this.buildMessages(systemPrompt, redactedContext, redactedHistory);

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
   * Build the system prompt with all constraints
   */
  private buildSystemPrompt(): string {
    const categories = Object.values(TICKET_CATEGORIES)
      .map((c) => `- ${c.id}${c.alwaysEscalate ? ' (ALWAYS escalate)' : ''}`)
      .join('\n');

    // Check if privileged actions are available
    const privilegedActionsEnabled = this.arePrivilegedActionsAvailable();

    return `You are an IT Helpdesk support agent with ${privilegedActionsEnabled ? 'PASSWORD RESET CAPABILITY' : 'limited capabilities'}. You MUST follow these rules strictly:

## CRITICAL CONSTRAINTS
1. Respond ONLY in valid JSON matching the required schema
2. NEVER request passwords, credentials, or sensitive information from users
3. ALWAYS escalate hardware and security issues immediately
4. Ask no more than 2-4 clarifying questions before making a decision

## CATEGORIES (choose exactly one)
${categories}

## DECISIONS - VERY IMPORTANT
- "guide": Provide troubleshooting steps for the user to try
- "resolve": The issue has been resolved through guidance
- "escalate": ONLY for hardware/security issues OR issues you genuinely cannot help with
- "request_approval": ${privilegedActionsEnabled ? '**USE THIS for password resets!** When user confirms troubleshooting failed, submit password reset request' : 'Not available in this deployment'}

${privilegedActionsEnabled ? `
## ⚠️ PASSWORD RESET - YOU CAN DO THIS! ⚠️
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
` : ''}

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
    "target": "user's email address (REQUIRED for password reset)",
    "justification": "Why this action is needed"
  },
  "escalation_summary": null | {
    "reason": "Why escalation is needed",
    "details": "Context for IT support team"
  }
}

## WORKFLOW FOR LOGIN/PASSWORD ISSUES
1. Ask: "What is the email address for the account you need help with?"
2. Once you have the email, provide quick troubleshooting (caps lock, clear cache, try incognito)
3. If user says it still doesn't work or reset link failed → USE request_approval with their email
4. Tell user: "I'm submitting a password reset request. An IT Admin will approve it shortly."

## BEHAVIOR GUIDELINES
- Be helpful and patient
- Use non-technical language when possible
- For login_password category: Use request_approval, NOT escalate
- For hardware/security: Always escalate
- Always provide clear, actionable instructions`;
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
   */
  private buildMessages(
    systemPrompt: string,
    context: TicketContext,
    history: Array<{ role: string; content: string }>
  ): Array<{ role: string; content: string }> {
    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: systemPrompt },
    ];

    // Add conversation history
    for (const msg of history) {
      messages.push({
        role: msg.role === 'agent' ? 'assistant' : msg.role,
        content: msg.content,
      });
    }

    // Add current context as the latest user message if not already in history
    const contextMessage = `
Issue Subject: ${context.subject}
Issue Description: ${context.description}
${context.category ? `Current Category: ${context.category}` : ''}
${context.previousStepsAttempted?.length ? `Previously Attempted: ${context.previousStepsAttempted.join(', ')}` : ''}
${context.userDepartment ? `User Department: ${context.userDepartment}` : ''}

Please analyze this issue and provide your response in the required JSON format.`;

    messages.push({ role: 'user', content: contextMessage });

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
          response_format: { type: 'json_object' },
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
