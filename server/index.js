require('dotenv').config();

// Prevent process exit on unhandled promise rejections (e.g. in route handlers)
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

const db = require('./config/database');
const { getUploadsRoot } = require('./lib/uploadPaths');
const authRoutes = require('./routes/auth');
const reportRoutes = require('./routes/reports');
const userRoutes = require('./routes/users');
const adminRoutes = require('./routes/admin');
const subscriptionRoutes = require('./routes/subscriptions');
const { router: notificationRoutes } = require('./routes/notifications');

const app = express();

// Create uploads directory if it doesn't exist (Vercel: only /tmp is writable)
let uploadDir = getUploadsRoot();
if (!process.env.UPLOAD_DIR) {
  process.env.UPLOAD_DIR = uploadDir;
}
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Middleware
app.use(helmet());
app.use(
  cors({
    origin: process.env.FRONTEND_URL || (process.env.VERCEL ? true : 'http://localhost:3000'),
    credentials: true,
  })
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
// NOTE: In development, rate limiting breaks UX (polling, uploads, etc.).
// We only enforce strict rate limits in production.
if (process.env.NODE_ENV === 'production') {
  const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 300, // general API traffic
    message: 'Too many requests, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    // Don't double-limit auth endpoints
    skip: (req) => req.path.startsWith('/auth/'),
  });

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 50, // auth endpoints
    message: 'Too many login attempts, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
  });

  // Apply rate limiting - auth routes first, then general
  app.use('/api/auth/', authLimiter);
  app.use('/api/', generalLimiter);
}

// Serve uploaded files
app.use('/uploads', express.static(uploadDir));
// Also serve summaries
const summariesDir = path.join(uploadDir, 'summaries');
if (!fs.existsSync(summariesDir)) {
  fs.mkdirSync(summariesDir, { recursive: true });
}
app.use('/uploads/summaries', express.static(summariesDir));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/notifications', notificationRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

const PORT = process.env.PORT || 5000;

const initPromise = db.init().catch((err) => {
  console.error('Failed to start server:', err);
  console.log('⚠️  Server will retry on next change...');
});

// Vercel serverless: export app only — do not listen on a port
if (!process.env.VERCEL) {
  initPromise.then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📊 Database: ${process.env.DATABASE_URL ? 'Connected' : 'Not configured'}`);
    });
  });
}

module.exports = app;
