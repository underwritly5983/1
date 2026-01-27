const express = require('express');
const { authenticate } = require('../middleware/auth');
const db = require('../config/database');

const router = express.Router();

// Get current subscription
router.get('/current', authenticate, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT s.tier, s.status, s.current_period_start, s.current_period_end, s.cancel_at_period_end,
              u.subscription_tier, u.subscription_status
       FROM subscriptions s
       JOIN users u ON u.id = s.user_id
       WHERE s.user_id = $1
       ORDER BY s.created_at DESC
       LIMIT 1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.json({
        tier: 'free',
        status: 'active',
        currentPeriodStart: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false
      });
    }

    const sub = result.rows[0];
    res.json({
      tier: sub.tier,
      status: sub.status,
      currentPeriodStart: sub.current_period_start,
      currentPeriodEnd: sub.current_period_end,
      cancelAtPeriodEnd: sub.cancel_at_period_end
    });
  } catch (error) {
    console.error('Get subscription error:', error);
    res.status(500).json({ error: 'Failed to fetch subscription' });
  }
});

// Get pricing tiers
router.get('/pricing', (req, res) => {
  res.json({
    tiers: [
      {
        id: 'free',
        name: 'Free',
        price: 0,
        features: [
          'Up to 5 IFTA reports per month',
          'Basic summarization',
          'Standard report templates',
          'Email support'
        ],
        limits: {
          reportsPerMonth: 5,
          aiSummaries: true,
          customBranding: false
        }
      },
      {
        id: 'premium',
        name: 'Premium',
        price: 49,
        pricePeriod: 'month',
        features: [
          'Unlimited IFTA reports',
          'Advanced AI summarization',
          'Custom branding (logo & colors)',
          'Priority support',
          'Advanced analytics',
          'Export to Excel/PDF',
          'API access'
        ],
        limits: {
          reportsPerMonth: -1, // unlimited
          aiSummaries: true,
          customBranding: true
        }
      }
    ]
  });
});

// Create checkout session (Stripe integration placeholder)
router.post('/checkout', authenticate, async (req, res) => {
  try {
    const { tier } = req.body;

    if (tier !== 'premium') {
      return res.status(400).json({ error: 'Invalid tier' });
    }

    // In production, integrate with Stripe
    // For now, return a mock checkout URL
    res.json({
      checkoutUrl: '/upgrade?tier=premium',
      message: 'Redirect to payment page'
    });
  } catch (error) {
    console.error('Checkout error:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// Upgrade to premium (mock - integrate with Stripe webhook in production)
router.post('/upgrade', authenticate, async (req, res) => {
  try {
    const { tier } = req.body;

    if (tier !== 'premium') {
      return res.status(400).json({ error: 'Invalid tier' });
    }

    // Update user subscription
    await db.query(
      `UPDATE users SET subscription_tier = $1, subscription_status = $2 WHERE id = $3`,
      ['premium', 'active', req.user.id]
    );

    // Create subscription record
    const periodStart = new Date();
    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    await db.query(
      `INSERT INTO subscriptions (user_id, tier, status, current_period_start, current_period_end)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT DO NOTHING`,
      [req.user.id, 'premium', 'active', periodStart, periodEnd]
    );

    // Track analytics
    await db.query(
      'INSERT INTO usage_analytics (user_id, event_type, event_data) VALUES ($1, $2, $3)',
      [req.user.id, 'subscription_upgraded', JSON.stringify({ tier: 'premium' })]
    );

    res.json({
      message: 'Successfully upgraded to Premium',
      tier: 'premium',
      status: 'active'
    });
  } catch (error) {
    console.error('Upgrade error:', error);
    res.status(500).json({ error: 'Failed to upgrade subscription' });
  }
});

// Cancel subscription
router.post('/cancel', authenticate, async (req, res) => {
  try {
    await db.query(
      `UPDATE subscriptions 
       SET cancel_at_period_end = true, status = 'canceled'
       WHERE user_id = $1 AND status = 'active'`,
      [req.user.id]
    );

    res.json({ message: 'Subscription will be canceled at the end of the billing period' });
  } catch (error) {
    console.error('Cancel subscription error:', error);
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

module.exports = router;
