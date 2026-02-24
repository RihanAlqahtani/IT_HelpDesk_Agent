/**
 * IT Helpdesk Agent API Server
 *
 * Main entry point for the Express backend.
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env, isDevelopment } from './config/env.js';
import { standardRateLimiter } from './middleware/ratelimit.middleware.js';
import { auditMiddleware } from './middleware/audit.middleware.js';

// Import routes
import authRoutes from './routes/auth.routes.js';
import ticketRoutes from './routes/ticket.routes.js';
import agentRoutes from './routes/agent.routes.js';
import privilegedRoutes from './routes/privileged.routes.js';
import hrRoutes from './routes/hr.routes.js';

const app = express();

// =============================================================================
// SECURITY MIDDLEWARE
// =============================================================================

// Helmet for security headers
app.use(
  helmet({
    contentSecurityPolicy: isDevelopment() ? false : undefined,
  })
);

// CORS configuration
app.use(
  cors({
    origin: env.CORS_ORIGINS.split(',').map((o) => o.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// =============================================================================
// REQUEST PARSING
// =============================================================================

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// =============================================================================
// RATE LIMITING & AUDIT
// =============================================================================

app.use(standardRateLimiter);
app.use(auditMiddleware);

// =============================================================================
// HEALTH CHECK ENDPOINTS
// =============================================================================

app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

app.get('/ready', (req: Request, res: Response) => {
  // Add more sophisticated readiness checks here
  res.json({
    status: 'ready',
    timestamp: new Date().toISOString(),
  });
});

// =============================================================================
// API ROUTES
// =============================================================================

app.use('/api/auth', authRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api/privileged', privilegedRoutes);
app.use('/api/hr', hrRoutes);

// =============================================================================
// ERROR HANDLING
// =============================================================================

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.path}`,
  });
});

// Global error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled error:', err);

  // Don't expose internal errors in production
  const message = isDevelopment() ? err.message : 'Internal server error';

  res.status(500).json({
    error: 'Internal Server Error',
    message,
  });
});

// =============================================================================
// SERVER STARTUP
// =============================================================================

const PORT = env.API_PORT;

const server = app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                  IT Helpdesk Agent API                       ║
╠══════════════════════════════════════════════════════════════╣
║  Server running on port ${PORT}                                 ║
║  Environment: ${env.NODE_ENV.padEnd(44)}║
║                                                              ║
║  Endpoints:                                                  ║
║    Health:   GET  /health                                    ║
║    Auth:     POST /api/auth/signin                           ║
║    Tickets:  GET  /api/tickets                               ║
║    Agent:    POST /api/agent/chat                            ║
║                                                              ║
║  Security Features:                                          ║
║    • Helmet security headers                                 ║
║    • CORS protection                                         ║
║    • Rate limiting                                           ║
║    • Request auditing                                        ║
║    • PII redaction                                           ║
║                                                              ║
║  MVP Status:                                                 ║
║    • Privileged actions: DISABLED                            ║
║    • Approval workflows: DISABLED                            ║
╚══════════════════════════════════════════════════════════════╝
  `);
});

// Graceful shutdown handling
const shutdown = () => {
  console.log('\nShutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
  // Force exit after 3 seconds if connections don't close
  setTimeout(() => {
    console.log('Forcing shutdown');
    process.exit(0);
  }, 3000);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export default app;
