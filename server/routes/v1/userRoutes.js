/**
 * V1 User Routes Controller
 * Handles user-level endpoints (agents, campaigns, phone numbers, etc.)
 * 
 * Routes grouped by resource:
 * - Wallet endpoints
 * - Agent endpoints
 * - Campaign endpoints
 * - Phone number endpoints
 * - Document endpoints
 * - Support ticket endpoints (user perspective)
 */

const express = require('express');
const router = express.Router();

let mysqlPool, walletService, campaignService;

function initUserController(pool, wallet, campaign) {
  mysqlPool = pool;
  walletService = wallet;
  campaignService = campaign;
}

// ==================== WALLET ENDPOINTS ====================

// GET /api/v1/user/wallet/balance/:userId
router.get('/wallet/balance/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId || userId === 'null' || userId === 'undefined') {
      return res.json({
        success: true,
        balance: 0,
        currency: 'USD'
      });
    }

    const balance = await walletService.getBalance(userId);

    res.json({
      success: true,
      balance,
      currency: 'USD'
    });
  } catch (error) {
    if (error.message && error.message.includes('User not found')) {
      return res.json({
        success: true,
        balance: 0,
        currency: 'USD'
      });
    }
    console.error('Error fetching wallet balance:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// GET /api/v1/user/wallet/transactions/:userId
router.get('/wallet/transactions/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const transactions = await walletService.getTransactions(userId, limit, offset);

    res.json({
      success: true,
      transactions
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// GET /api/v1/user/wallet/usage-stats/:userId
router.get('/wallet/usage-stats/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { startDate, endDate } = req.query;

    const stats = await walletService.getUsageStats(userId, startDate, endDate);

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Error fetching usage stats:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// GET /api/v1/user/wallet/pricing
router.get('/wallet/pricing', async (req, res) => {
  try {
    const pricing = await walletService.getServicePricing();

    res.json({
      success: true,
      pricing
    });
  } catch (error) {
    console.error('Error fetching pricing:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ==================== SUPPORT TICKETS (USER) ====================

// POST /api/v1/user/support/tickets
router.post('/support/tickets', async (req, res) => {
  try {
    const { subject, category, priority, message, created_by } = req.body;

    if (!subject || !category || !message || !created_by) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }

    const ticketId = require('crypto').randomBytes(8).toString('hex');

    await mysqlPool.execute(
      `INSERT INTO support_tickets 
       (id, subject, category, priority, message, status, created_by, created_by_role) 
       VALUES (?, ?, ?, ?, ?, 'Open', ?, 'user')`,
      [ticketId, subject, category, priority || 'Medium', message, created_by]
    );

    const [rows] = await mysqlPool.execute(
      'SELECT * FROM support_tickets WHERE id = ?',
      [ticketId]
    );

    res.json({
      success: true,
      ticket: rows[0]
    });
  } catch (error) {
    console.error('Error creating support ticket:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// GET /api/v1/user/support/tickets/:userId
router.get('/support/tickets/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    const [tickets] = await mysqlPool.execute(
      `SELECT t.*, 
              COALESCE(u.username, 'Unknown') as created_by_name
       FROM support_tickets t
       LEFT JOIN users u ON t.created_by = u.id
       WHERE t.created_by = ? AND t.created_by_role = 'user'
       ORDER BY t.created_at DESC
       LIMIT ${limit} OFFSET ${offset}`,
      [userId]
    );

    const [[{ total }]] = await mysqlPool.execute(
      'SELECT COUNT(*) as total FROM support_tickets WHERE created_by = ? AND created_by_role = "user"',
      [userId]
    );

    res.json({
      success: true,
      tickets,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching support tickets:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// POST /api/v1/user/support/tickets/:ticketId/reply
router.post('/support/tickets/:ticketId/reply', async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { message, user_id } = req.body;

    if (!message || !user_id) {
      return res.status(400).json({
        success: false,
        message: 'Message and user_id are required'
      });
    }

    const replyId = require('crypto').randomBytes(8).toString('hex');

    await mysqlPool.execute(
      `INSERT INTO support_ticket_replies 
       (id, ticket_id, reply_by, reply_by_role, message) 
       VALUES (?, ?, ?, 'user', ?)`,
      [replyId, ticketId, user_id, message]
    );

    await mysqlPool.execute(
      `UPDATE support_tickets SET status = 'In Progress', updated_at = CURRENT_TIMESTAMP 
       WHERE id = ? AND status = 'Open'`,
      [ticketId]
    );

    res.json({
      success: true,
      message: 'Reply submitted'
    });
  } catch (error) {
    console.error('Error replying to ticket:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = {
  router,
  initUserController
};
