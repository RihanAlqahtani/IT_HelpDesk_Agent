/**
 * Rate Limiting Middleware
 *
 * Prevents abuse by limiting request rates per IP and user.
 */

import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { env } from '../config/env.js';
import { isAuthenticated } from './auth.middleware.js';

/**
 * Key generator that uses user ID if authenticated, otherwise IP
 */
function keyGenerator(req: Request): string {
  if (isAuthenticated(req)) {
    return `user:${req.user.id}`;
  }
  return `ip:${req.ip}`;
}

/**
 * Standard rate limiter for most API endpoints
 */
export const standardRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  keyGenerator,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too Many Requests',
    message: 'Rate limit exceeded. Please try again later.',
    retryAfter: Math.ceil(env.RATE_LIMIT_WINDOW_MS / 1000),
  },
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please try again later.',
      retryAfter: Math.ceil(env.RATE_LIMIT_WINDOW_MS / 1000),
    });
  },
});

/**
 * Stricter rate limiter for agent chat endpoints
 * Prevents LLM abuse
 */
export const agentRateLimiter = rateLimit({
  windowMs: 60000, // 1 minute
  max: 20, // 20 requests per minute per user
  keyGenerator,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too Many Requests',
    message: 'Agent chat rate limit exceeded. Please wait before sending more messages.',
  },
});

/**
 * Very strict rate limiter for auth endpoints
 * Prevents brute force attacks
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per 15 minutes
  keyGenerator: (req: Request) => `auth:${req.ip}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too Many Requests',
    message: 'Too many authentication attempts. Please try again later.',
  },
});

/**
 * Rate limiter for privileged action endpoints (future use)
 */
export const privilegedRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50, // 50 privileged actions per hour
  keyGenerator,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too Many Requests',
    message: 'Privileged action rate limit exceeded.',
  },
});
