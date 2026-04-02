/**
 * V1 Common Routes Controller
 * Handles non-role-specific endpoints
 * 
 * Routes:
 * POST /auth/login - User and Admin login
 * POST /auth/register - User registration
 * GET /auth/google - Google OAuth initiation
 * GET /auth/google/callback - Google OAuth callback
 * POST /auth/logout - User logout
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');

// Initialize services through app context
let authService, mysqlPool, walletService, companyService;

/**
 * Initialize controller with required dependencies
 */
function initCommonController(auth, pool, wallet, company) {
  authService = auth;
  mysqlPool = pool;
  walletService = wallet;
  companyService = company;
}

// ==================== LOGIN & REGISTRATION ====================

// POST /api/v1/common/auth/login
router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    const user = await authService.authenticateUser(email, password);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check account status
    if (user.status && user.status !== 'active') {
      const reason = user.status === 'locked' ? 'account is locked' : 'account is inactive';
      return res.status(403).json({
        success: false,
        message: `Access denied: Your ${reason}`
      });
    }

    // Default company check
    if (!user.current_company_id) {
      const [companies] = await mysqlPool.execute(
        'SELECT id FROM companies WHERE user_id = ?',
        [user.id]
      );
      if (companies.length === 0) {
        const companyId = uuidv4();
        await mysqlPool.execute(
          'INSERT INTO companies (id, user_id, name) VALUES (?, ?, ?)',
          [companyId, user.id, 'Default Company']
        );
        await mysqlPool.execute(
          'UPDATE users SET current_company_id = ? WHERE id = ?',
          [companyId, user.id]
        );
        user.current_company_id = companyId;
      } else {
        await mysqlPool.execute(
          'UPDATE users SET current_company_id = ? WHERE id = ?',
          [companies[0].id, user.id]
        );
        user.current_company_id = companies[0].id;
      }
    }

    // Attach plan info
    const [planRows] = await mysqlPool.execute(
      'SELECT plan_type, plan_valid_until, trial_started_at FROM users WHERE id = ?',
      [user.id]
    );
    if (planRows.length > 0) {
      user.plan_type = planRows[0].plan_type;
      user.plan_valid_until = planRows[0].plan_valid_until;
      user.trial_started_at = planRows[0].trial_started_at;
    }

    res.json({
      success: true,
      user,
      apiVersion: 'v1'
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// POST /api/v1/common/auth/register
router.post('/auth/register', async (req, res) => {
  try {
    const { email, username, password } = req.body;
    if (!email || !username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email, username, and password are required'
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format'
      });
    }

    const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
    if (!usernameRegex.test(username)) {
      return res.status(400).json({
        success: false,
        message: 'Username must be 3-20 alphanumeric characters'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long'
      });
    }

    const user = await authService.registerUser(email, username, password);

    // Default company creation
    const companyId = uuidv4();
    await mysqlPool.execute(
      'INSERT INTO companies (id, user_id, name) VALUES (?, ?, ?)',
      [companyId, user.id, 'Default Company']
    );

    // Trial plan + 50 credits on sign-up
    const trialStart = new Date();
    const trialEnd = new Date(trialStart.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await mysqlPool.execute(
      `UPDATE users SET current_company_id = ?, plan_type = 'trial', plan_valid_until = ?, trial_started_at = ? WHERE id = ?`,
      [companyId, trialEnd, trialStart, user.id]
    );

    // Create wallet with trial credits
    await walletService.getOrCreateWallet(user.id);
    await walletService.addCredits(
      user.id,
      50,
      'Trial signup bonus'
    );

    res.json({
      success: true,
      user: {
        ...user,
        current_company_id: companyId,
        plan_type: 'trial',
        plan_valid_until: trialEnd
      },
      message: 'User registered successfully'
    });
  } catch (error) {
    if (error.message === 'User already exists') {
      return res.status(409).json({
        success: false,
        message: 'Email already in use'
      });
    }
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// POST /api/v1/common/auth/logout
router.post('/auth/logout', (req, res) => {
  try {
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = {
  router,
  initCommonController
};
