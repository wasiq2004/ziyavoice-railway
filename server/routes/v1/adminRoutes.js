/**
 * V1 Admin Routes Controller
 * Handles org-admin level endpoints
 * 
 * Routes:
 * - User management (org-scoped)
 * - Wallet management (org-scoped)
 * - Reports and analytics
 * - Support ticket management
 * - Organization settings
 */

const express = require('express');
const router = express.Router();

let mysqlPool, adminService, walletService;

function initAdminController(pool, admin, wallet) {
  mysqlPool = pool;
  adminService = admin;
  walletService = wallet;
}

// ==================== USER MANAGEMENT (ORG-SCOPED) ====================

// GET /api/v1/admin/users
router.get('/users', async (req, res) => {
  try {
    const rawPage = Array.isArray(req.query.page) ? req.query.page[0] : req.query.page;
    const rawLimit = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
    const search = Array.isArray(req.query.search) ? req.query.search[0] : (req.query.search || '');
    const rawOrgId = Array.isArray(req.query.orgId) ? req.query.orgId[0] : req.query.orgId;

    const page = parseInt(rawPage) || 1;
    const limit = parseInt(rawLimit) || 50;
    const orgId = rawOrgId && rawOrgId !== 'null' ? parseInt(rawOrgId) : null;

    const result = await adminService.getAllUsers(page, limit, search, orgId);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// GET /api/v1/admin/users/:userId
router.get('/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const data = await adminService.getUserDetails(userId);

    const wallet = await walletService.getOrCreateWallet(userId).catch(() => null);
    if (data.user && wallet) {
      data.user.wallet_balance = parseFloat(wallet.balance || '0');
    }

    const limitsMap = {};
    if (Array.isArray(data.limits)) {
      data.limits.forEach(l => {
        limitsMap[l.service_name] = l;
      });
    }

    res.json({
      success: true,
      user: data.user,
      limits: limitsMap,
      usage: data.usage,
      billing: data.billing
    });
  } catch (error) {
    console.error('Error fetching user details:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// DELETE /api/v1/admin/users/:userId
router.delete('/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { adminId } = req.body;

    const [rows] = await mysqlPool.execute(
      "SELECT id, role FROM users WHERE id = ? AND role = 'user'",
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Cascade delete
    await mysqlPool.execute('DELETE FROM user_wallets WHERE user_id = ?', [userId]).catch(() => {});
    await mysqlPool.execute('DELETE FROM wallet_transactions WHERE user_id = ?', [userId]).catch(() => {});
    await mysqlPool.execute('DELETE FROM user_service_limits WHERE user_id = ?', [userId]).catch(() => {});
    await mysqlPool.execute('DELETE FROM user_service_usage WHERE user_id = ?', [userId]).catch(() => {});
    await mysqlPool.execute('DELETE FROM agents WHERE user_id = ?', [userId]).catch(() => {});
    await mysqlPool.execute('DELETE FROM campaigns WHERE user_id = ?', [userId]).catch(() => {});
    await mysqlPool.execute('DELETE FROM users WHERE id = ?', [userId]);

    if (adminId) {
      adminService.logActivity(adminId, 'delete_user', userId, 'User permanently deleted', null);
    }

    res.json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// PUT /api/v1/admin/users/:userId/status
router.put('/users/:userId/status', async (req, res) => {
  try {
    const { userId } = req.params;
    const { status, adminId } = req.body;

    if (!['active', 'locked', 'inactive'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status value'
      });
    }

    const result = await adminService.updateUserStatus(userId, status, adminId);

    res.json({
      success: true,
      message: result.message
    });
  } catch (error) {
    console.error('Error updating user status:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ==================== WALLET MANAGEMENT (ORG-SCOPED) ====================

// GET /api/v1/admin/wallet/summary
router.get('/wallet/summary', async (req, res) => {
  try {
    const { orgId } = req.query;

    let userFilter = "WHERE u.role = 'user'";
    const params = [];

    if (orgId) {
      userFilter += ' AND u.organization_id = ?';
      params.push(parseInt(orgId));
    }

    const [[totals]] = await mysqlPool.execute(`
      SELECT
        COUNT(DISTINCT u.id) AS totalUsers,
        COALESCE(SUM(uw.balance), 0) AS totalBalance,
        COALESCE((SELECT SUM(wt.amount) FROM wallet_transactions wt 
                  JOIN users u2 ON u2.id = wt.user_id 
                  ${orgId ? "AND u2.organization_id = ?" : ""} 
                  WHERE wt.transaction_type = 'debit'), 0) AS totalDebited,
        COALESCE((SELECT SUM(wt.amount) FROM wallet_transactions wt 
                  JOIN users u2 ON u2.id = wt.user_id 
                  ${orgId ? "AND u2.organization_id = ?" : ""} 
                  WHERE wt.transaction_type = 'credit'), 0) AS totalCredited
      FROM users u
      LEFT JOIN user_wallets uw ON uw.user_id = u.id
      ${userFilter}
    `, orgId ? [...params, parseInt(orgId), parseInt(orgId)] : []);

    res.json({
      success: true,
      summary: totals
    });
  } catch (error) {
    console.error('Error fetching wallet summary:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// POST /api/v1/admin/wallet/add-credits
router.post('/wallet/add-credits', async (req, res) => {
  try {
    const { userId, amount, description, adminId } = req.body;

    if (!userId || !amount) {
      return res.status(400).json({
        success: false,
        message: 'User ID and amount (INR) are required'
      });
    }

    if (amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be greater than 0'
      });
    }

    const result = await walletService.addCredits(
      userId,
      amount,
      description || `Admin added ₹${amount} INR`,
      adminId
    );

    if (adminId) {
      adminService.logActivity(
        adminId,
        'add_wallet_credits',
        userId,
        `Added ₹${amount} INR (≈${result.creditsAdded} Credits) to wallet. Reason: ${description || 'N/A'}`,
        null
      );
    }

    res.json({
      success: true,
      newBalance: result.newBalance,
      creditsAdded: result.creditsAdded,
      inrAmount: parseFloat(amount),
      transaction: result.transaction
    });
  } catch (error) {
    console.error('Error adding credits:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ==================== AUDIT & LOGS ====================

// GET /api/v1/admin/logs
router.get('/logs', async (req, res) => {
  try {
    const { page = 1, limit = 50, orgId } = req.query;
    const result = await adminService.getAuditLogs(
      parseInt(page),
      parseInt(limit),
      orgId || null
    );

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// GET /api/v1/admin/stats
router.get('/stats', async (req, res) => {
  try {
    const { orgId } = req.query;
    const stats = await adminService.getDashboardStats(orgId || null);

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = {
  router,
  initAdminController
};
