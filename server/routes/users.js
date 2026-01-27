const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { authenticate } = require('../middleware/auth');
const db = require('../config/database');

const router = express.Router();

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
    cb(null, 'logo-' + req.user.id + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 },
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

// Get current user profile
router.get('/profile', authenticate, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, email, company_name, phone, logo_url, brand_color_primary, brand_color_secondary, 
              subscription_tier, subscription_status, created_at, last_login
       FROM users WHERE id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    res.json({
      id: user.id,
      email: user.email,
      companyName: user.company_name,
      phone: user.phone,
      logoUrl: user.logo_url,
      brandColorPrimary: user.brand_color_primary,
      brandColorSecondary: user.brand_color_secondary,
      subscriptionTier: user.subscription_tier,
      subscriptionStatus: user.subscription_status,
      createdAt: user.created_at,
      lastLogin: user.last_login
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Update profile
router.put('/profile', authenticate, upload.single('logo'), async (req, res) => {
  try {
    const { companyName, phone, brandColorPrimary, brandColorSecondary } = req.body;
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (companyName) {
      updates.push(`company_name = $${paramCount++}`);
      values.push(companyName);
    }
    if (phone !== undefined) {
      updates.push(`phone = $${paramCount++}`);
      values.push(phone);
    }
    if (brandColorPrimary) {
      updates.push(`brand_color_primary = $${paramCount++}`);
      values.push(brandColorPrimary);
    }
    if (brandColorSecondary) {
      updates.push(`brand_color_secondary = $${paramCount++}`);
      values.push(brandColorSecondary);
    }
    if (req.file) {
      // Delete old logo if exists
      const oldUser = await db.query('SELECT logo_url FROM users WHERE id = $1', [req.user.id]);
      if (oldUser.rows[0]?.logo_url) {
        const oldPath = path.join(process.cwd(), oldUser.rows[0].logo_url);
        if (fs.existsSync(oldPath)) {
          fs.unlinkSync(oldPath);
        }
      }
      updates.push(`logo_url = $${paramCount++}`);
      values.push(`/uploads/logos/${req.file.filename}`);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    values.push(req.user.id);
    const query = `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`;
    
    const result = await db.query(query, values);
    
    res.json({
      message: 'Profile updated successfully',
      user: {
        id: result.rows[0].id,
        companyName: result.rows[0].company_name,
        phone: result.rows[0].phone,
        logoUrl: result.rows[0].logo_url,
        brandColorPrimary: result.rows[0].brand_color_primary,
        brandColorSecondary: result.rows[0].brand_color_secondary
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Change password
router.put('/password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }

    // Get current password hash
    const result = await db.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    // Update password
    await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newPasswordHash, req.user.id]);

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to update password' });
  }
});

module.exports = router;
