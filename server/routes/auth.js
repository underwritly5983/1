const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../config/database');

const router = express.Router();

// Configure multer for logo uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = process.env.UPLOAD_DIR || './uploads/logos';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'logo-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|svg/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Register
router.post('/register', 
  upload.single('logo'),
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }),
    body('companyName').trim().notEmpty(),
    body('phone').optional().trim(),
    body('brandColorPrimary').optional().matches(/^#[0-9A-F]{6}$/i),
    body('brandColorSecondary').optional().matches(/^#[0-9A-F]{6}$/i)
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, password, companyName, phone, brandColorPrimary, brandColorSecondary } = req.body;

      // Check if user exists
      const existingUser = await db.query('SELECT id FROM users WHERE email = $1', [email]);
      if (existingUser.rows.length > 0) {
        return res.status(400).json({ error: 'Email already registered' });
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 10);

      // Handle logo upload
      let logoUrl = null;
      if (req.file) {
        logoUrl = `/uploads/logos/${req.file.filename}`;
      }

      // Create user
      const result = await db.query(
        `INSERT INTO users (email, password_hash, company_name, phone, logo_url, brand_color_primary, brand_color_secondary)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, email, company_name, phone, logo_url, brand_color_primary, brand_color_secondary, subscription_tier, created_at`,
        [email, passwordHash, companyName, phone || null, logoUrl, brandColorPrimary || '#2563eb', brandColorSecondary || '#1e40af']
      );

      const user = result.rows[0];

      // Create default subscription
      await db.query(
        'INSERT INTO subscriptions (user_id, tier, status) VALUES ($1, $2, $3)',
        [user.id, 'free', 'active']
      );

      // Track analytics
      await db.query(
        'INSERT INTO usage_analytics (user_id, event_type, event_data) VALUES ($1, $2, $3)',
        [user.id, 'user_registered', JSON.stringify({ email, companyName })]
      );

      // Generate token
      const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });

      res.status(201).json({
        message: 'User created successfully',
        token,
        user: {
          id: user.id,
          email: user.email,
          companyName: user.company_name,
          phone: user.phone,
          logoUrl: user.logo_url,
          brandColorPrimary: user.brand_color_primary,
          brandColorSecondary: user.brand_color_secondary,
          subscriptionTier: user.subscription_tier
        }
      });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({ error: 'Registration failed' });
    }
  }
);

// Login
router.post('/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        console.log('Login validation errors:', errors.array());
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, password } = req.body;
      console.log('Login attempt for:', email);

      // Find user
      const result = await db.query(
        'SELECT id, email, password_hash, company_name, subscription_tier, subscription_status, is_admin FROM users WHERE email = $1',
        [email]
      );

      if (result.rows.length === 0) {
        console.log('User not found:', email);
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const user = result.rows[0];

      // Verify password
      const isValid = await bcrypt.compare(password, user.password_hash);
      if (!isValid) {
        console.log('Invalid password for:', email);
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      
      console.log('Login successful for:', email);

      // Update last login
      await db.query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);

      // Track analytics
      await db.query(
        'INSERT INTO usage_analytics (user_id, event_type) VALUES ($1, $2)',
        [user.id, 'user_login']
      );

      // Generate token
      const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });

      res.json({
        token,
        user: {
          id: user.id,
          email: user.email,
          companyName: user.company_name,
          subscriptionTier: user.subscription_tier,
          subscriptionStatus: user.subscription_status,
          isAdmin: user.is_admin
        }
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Login failed' });
    }
  }
);

module.exports = router;
