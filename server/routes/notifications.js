const express = require('express');
const { authenticate } = require('../middleware/auth');
const db = require('../config/database');

const router = express.Router();

// Get all notifications for user
router.get('/', authenticate, async (req, res) => {
  try {
    const { unreadOnly } = req.query;
    
    let query = `SELECT id, type, title, message, read, action_url, created_at
                 FROM notifications
                 WHERE user_id = $1`;
    const params = [req.user.id];

    if (unreadOnly === 'true') {
      query += ' AND read = false';
    }

    query += ' ORDER BY created_at DESC LIMIT 50';

    const result = await db.query(query, params);

    res.json({
      notifications: result.rows.map(n => ({
        id: n.id,
        type: n.type,
        title: n.title,
        message: n.message,
        read: n.read,
        actionUrl: n.action_url,
        createdAt: n.created_at
      }))
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// Mark notification as read
router.put('/:id/read', authenticate, async (req, res) => {
  try {
    await db.query(
      'UPDATE notifications SET read = true WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );

    res.json({ message: 'Notification marked as read' });
  } catch (error) {
    console.error('Mark read error:', error);
    res.status(500).json({ error: 'Failed to update notification' });
  }
});

// Mark all as read
router.put('/read-all', authenticate, async (req, res) => {
  try {
    await db.query(
      'UPDATE notifications SET read = true WHERE user_id = $1 AND read = false',
      [req.user.id]
    );

    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Mark all read error:', error);
    res.status(500).json({ error: 'Failed to update notifications' });
  }
});

// Delete notification
router.delete('/:id', authenticate, async (req, res) => {
  try {
    await db.query(
      'DELETE FROM notifications WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );

    res.json({ message: 'Notification deleted' });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

// Helper function to create notification (used by other services)
const createNotification = async (userId, type, title, message, actionUrl = null) => {
  try {
    await db.query(
      `INSERT INTO notifications (user_id, type, title, message, action_url)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, type, title, message, actionUrl]
    );
  } catch (error) {
    console.error('Create notification error:', error);
  }
};

module.exports = { router, createNotification };
