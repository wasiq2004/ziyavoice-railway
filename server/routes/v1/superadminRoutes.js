/**
 * V1 Super Admin Routes Controller
 * Handles system-wide administration
 * 
 * Routes:
 * - Organization management
 * - System-wide user management
 * - Pricing/billing management
 * - Admin account management
 * - System analytics
 */

const express = require('express');
const router = express.Router();

let mysqlPool, adminService, organizationService, walletService;

function initSuperAdminController(pool, admin, org, wallet) {
  mysqlPool = pool;
  adminService = admin;
  organizationService = org;
  walletService = wallet;
}

// ==================== ORGANIZATION MANAGEMENT ====================

// GET /api/v1/superadmin/organizations
router.get('/organizations', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const result = await organizationService.listAllOrganizations(page, limit);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error fetching organizations:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// GET /api/v1/superadmin/organizations/:orgId
router.get('/organizations/:orgId', async (req, res) => {
  try {
    const { orgId } = req.params;
    const orgData = await organizationService.getOrganizationDetails(orgId);

    res.json({
      success: true,
      organization: orgData
    });
  } catch (error) {
    console.error('Error fetching organization:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ==================== ORG ADMIN MANAGEMENT ====================

// GET /api/v1/superadmin/org-admins
router.get('/org-admins', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const orgId = req.query.orgId ? parseInt(req.query.orgId) : null;

    const offset = (page - 1) * limit;

    let query = `
      SELECT u.id, u.email, u.username, u.organization_id, u.status, u.created_at
      FROM users u
      WHERE u.role = 'org_admin'
    `;
    const params = [];

    if (orgId) {
      query += ` AND u.organization_id = ?`;
      params.push(orgId);
    }

    query += ` ORDER BY u.created_at DESC LIMIT ${limit} OFFSET ${offset}`;

    const [orgAdmins] = await mysqlPool.execute(query, params);

    const [[{ total }]] = await mysqlPool.execute(
      `SELECT COUNT(*) as total FROM users WHERE role = 'org_admin' ${orgId ? 'AND organization_id = ?' : ''}`,
      orgId ? [orgId] : []
    );

    res.json({
      success: true,
      orgAdmins,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching org admins:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// DELETE /api/v1/superadmin/org-admins/:adminId
router.delete('/org-admins/:adminId', async (req, res) => {
  try {
    const { adminId } = req.params;

    const [rows] = await mysqlPool.execute(
      "SELECT id, role FROM users WHERE id = ? AND role = 'org_admin'",
      [adminId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Org Admin not found'
      });
    }

    await mysqlPool.execute('DELETE FROM user_wallets WHERE user_id = ?', [adminId]).catch(() => {});
    await mysqlPool.execute('DELETE FROM wallet_transactions WHERE user_id = ?', [adminId]).catch(() => {});
    await mysqlPool.execute('DELETE FROM users WHERE id = ?', [adminId]);

    res.json({
      success: true,
      message: 'Org Admin permanently deleted'
    });
  } catch (error) {
    console.error('Delete org admin error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ==================== SYSTEM-WIDE USER MANAGEMENT ====================

// GET /api/v1/superadmin/users
router.get('/users', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const search = req.query.search || '';
    const orgId = req.query.orgId ? parseInt(req.query.orgId) : null;

    const result = await organizationService.listAllUsers({
      page,
      limit,
      search,
      orgId
    });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Super admin list users error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// PATCH /api/v1/superadmin/users/:userId/status
router.patch('/users/:userId/status', async (req, res) => {
  try {
    const { userId } = req.params;
    const { status } = req.body;

    if (!['active', 'locked', 'inactive'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status'
      });
    }

    await mysqlPool.execute(
      'UPDATE users SET status = ? WHERE id = ?',
      [status, userId]
    );

    res.json({
      success: true,
      message: `User status set to ${status}`
    });
  } catch (error) {
    console.error('Super admin block user error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// DELETE /api/v1/superadmin/users/:userId
router.delete('/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

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

    await mysqlPool.execute('DELETE FROM user_wallets WHERE user_id = ?', [userId]).catch(() => {});
    await mysqlPool.execute('DELETE FROM wallet_transactions WHERE user_id = ?', [userId]).catch(() => {});
    await mysqlPool.execute('DELETE FROM users WHERE id = ?', [userId]);

    res.json({
      success: true,
      message: 'User permanently deleted'
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ==================== PRICING MANAGEMENT ====================

// GET /api/v1/superadmin/pricing
router.get('/pricing', async (req, res) => {
  try {
    const [rows] = await mysqlPool.execute(
      'SELECT service_name, cost_per_unit, updated_at FROM service_pricing'
    );

    res.json({
      success: true,
      pricing: rows
    });
  } catch (error) {
    console.error('Error fetching pricing:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// POST /api/v1/superadmin/pricing/:serviceName
router.post('/pricing/:serviceName', async (req, res) => {
  try {
    const { serviceName } = req.params;
    const { costPerUnit } = req.body;

    if (!costPerUnit) {
      return res.status(400).json({
        success: false,
        message: 'Cost per unit is required'
      });
    }

    await walletService.updatePricing(serviceName, costPerUnit);

    res.json({
      success: true,
      message: 'Pricing updated successfully'
    });
  } catch (error) {
    console.error('Error updating pricing:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ==================== SYSTEM ANALYTICS ====================

// GET /api/v1/superadmin/system-stats
router.get('/system-stats', async (req, res) => {
  try {
    const [[userCount]] = await mysqlPool.execute(
      "SELECT COUNT(*) as total FROM users WHERE role = 'user'"
    );

    const [[orgCount]] = await mysqlPool.execute(
      'SELECT COUNT(*) as total FROM organizations'
    );

    const [[totalBalance]] = await mysqlPool.execute(
      'SELECT COALESCE(SUM(balance), 0) as total FROM user_wallets'
    );

    res.json({
      success: true,
      stats: {
        totalUsers: userCount.total,
        totalOrganizations: orgCount.total,
        totalWalletBalance: totalBalance.total,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error fetching system stats:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = {
  router,
  initSuperAdminController
};
