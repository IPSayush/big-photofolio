/**
 * Express Application Setup.
 * 
 * Configures middleware stack, routes, and error handling.
 * Separated from server startup (index.js) for testability.
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const env = require('./config/env');
const { errorHandler } = require('./middleware/errorHandler');
const { apiLimiter } = require('./middleware/rateLimiter');
const logger = require('./utils/logger');

// Route imports
const authRoutes = require('./routes/auth.routes');
const profileRoutes = require('./routes/profile.routes');
const eventRoutes = require('./routes/event.routes');
const uploadRoutes = require('./routes/upload.routes');
const guestRoutes = require('./routes/guest.routes');

const app = express();

// --- Security middleware ---
app.use(helmet());
app.use(cors({
  origin: env.clientUrl,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// --- Body parsing ---
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// --- Request logging ---
app.use((req, res, next) => {
  logger.debug({ method: req.method, url: req.url }, 'Incoming request');
  next();
});

// --- Global rate limiting ---
app.use('/api/', apiLimiter);

// --- Health check (no auth required) ---
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: env.nodeEnv,
  });
});

// --- API Routes ---
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/events/:eventId/photos', uploadRoutes);
app.use('/api/guest', guestRoutes);

// --- 404 handler ---
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Route ${req.method} ${req.url} not found.`,
  });
});

// --- Centralized error handler (must be last) ---
app.use(errorHandler);

module.exports = app;
