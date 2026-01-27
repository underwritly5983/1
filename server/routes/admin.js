const express = require('express');
const { authenticate, requireAdmin } = require('../middleware/auth');
const db = require('../config/database');

const router = express.Router();

// All admin routes require authentication and admin role
router.use(authenticate);
router.use(requireAdmin);

// Get dashboard stats
router.get('/dashboard', async (req, res) => {
  try {
    // Total users
    const usersResult = await db.query('SELECT COUNT(*) as count FROM users');
    const totalUsers = parseInt(usersResult.rows[0].count);

    // Active subscriptions
    const premiumResult = await db.query(
      "SELECT COUNT(*) as count FROM users WHERE subscription_tier = 'premium' AND subscription_status = 'active'"
    );
    const premiumUsers = parseInt(premiumResult.rows[0].count);

    // Total reports
    const reportsResult = await db.query('SELECT COUNT(*) as count FROM ifta_reports');
    const totalReports = parseInt(reportsResult.rows[0].count);

    // Reports this month
    const monthlyReportsResult = await db.query(
      `SELECT COUNT(*) as count FROM ifta_reports 
       WHERE created_at >= date_trunc('month', CURRENT_DATE)`
    );
    const monthlyReports = parseInt(monthlyReportsResult.rows[0].count);

    // Recent signups (last 30 days)
    const signupsResult = await db.query(
      `SELECT COUNT(*) as count FROM users 
       WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'`
    );
    const recentSignups = parseInt(signupsResult.rows[0].count);

    // Usage analytics
    const analyticsResult = await db.query(
      `SELECT event_type, COUNT(*) as count
       FROM usage_analytics
       WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
       GROUP BY event_type
       ORDER BY count DESC`
    );

    res.json({
      stats: {
        totalUsers,
        premiumUsers,
        freeUsers: totalUsers - premiumUsers,
        totalReports,
        monthlyReports,
        recentSignups
      },
      analytics: analyticsResult.rows
    });
  } catch (error) {
    console.error('Admin dashboard error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

// Get all users
router.get('/users', async (req, res) => {
  try {
    const { page = 1, limit = 50, search } = req.query;
    const offset = (page - 1) * limit;

    let query = `SELECT id, email, company_name, subscription_tier, subscription_status, 
                        created_at, last_login
                 FROM users`;
    const params = [];
    
    if (search) {
      query += ` WHERE email ILIKE $1 OR company_name ILIKE $1`;
      params.push(`%${search}%`);
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await db.query(query, params);

    res.json({
      users: result.rows.map(u => ({
        id: u.id,
        email: u.email,
        companyName: u.company_name,
        subscriptionTier: u.subscription_tier,
        subscriptionStatus: u.subscription_status,
        createdAt: u.created_at,
        lastLogin: u.last_login
      }))
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Get user details
router.get('/users/:id', async (req, res) => {
  try {
    const userResult = await db.query(
      `SELECT id, email, company_name, phone, subscription_tier, subscription_status, 
              created_at, last_login
       FROM users WHERE id = $1`,
      [req.params.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const reportsResult = await db.query(
      'SELECT COUNT(*) as count FROM ifta_reports WHERE user_id = $1',
      [req.params.id]
    );

    const analyticsResult = await db.query(
      `SELECT event_type, COUNT(*) as count, MAX(created_at) as last_occurrence
       FROM usage_analytics
       WHERE user_id = $1
       GROUP BY event_type
       ORDER BY last_occurrence DESC`,
      [req.params.id]
    );

    res.json({
      user: userResult.rows[0],
      reportCount: parseInt(reportsResult.rows[0].count),
      activity: analyticsResult.rows
    });
  } catch (error) {
    console.error('Get user details error:', error);
    res.status(500).json({ error: 'Failed to fetch user details' });
  }
});

// Update user subscription
router.put('/users/:id/subscription', async (req, res) => {
  try {
    const { tier, status } = req.body;

    if (!tier || !status) {
      return res.status(400).json({ error: 'Tier and status required' });
    }

    await db.query(
      'UPDATE users SET subscription_tier = $1, subscription_status = $2 WHERE id = $3',
      [tier, status, req.params.id]
    );

    res.json({ message: 'User subscription updated successfully' });
  } catch (error) {
    console.error('Update subscription error:', error);
    res.status(500).json({ error: 'Failed to update subscription' });
  }
});

// Get usage analytics
router.get('/analytics', async (req, res) => {
  try {
    const { days = 30 } = req.query;

    const result = await db.query(
      `SELECT 
         DATE(created_at) as date,
         event_type,
         COUNT(*) as count
       FROM usage_analytics
       WHERE created_at >= CURRENT_DATE - INTERVAL '${days} days'
       GROUP BY DATE(created_at), event_type
       ORDER BY date DESC, count DESC`
    );

    res.json({ analytics: result.rows });
  } catch (error) {
    console.error('Get analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

module.exports = router;
