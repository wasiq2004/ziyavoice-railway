const mysql = require('../config/database.js');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

class AdminService {
  constructor(mysqlPool) {
    this.mysqlPool = mysqlPool;
  }

  // Admin Authentication
  async login(email, password) {
    try {
      // First: check the legacy admin_users table (super_admin)
      const [adminRows] = await this.mysqlPool.execute(
        'SELECT * FROM admin_users WHERE email = ?',
        [email]
      );

      if (adminRows.length > 0) {
        const admin = adminRows[0];
        const isValidPassword = await bcrypt.compare(password, admin.password_hash);
        if (!isValidPassword) throw new Error('Invalid credentials');
        delete admin.password_hash;
        return admin;
      }

      // Second: check the users table for org_admin role (e.g. Ziya_Admin)
      const [userRows] = await this.mysqlPool.execute(
        'SELECT * FROM users WHERE email = ? AND role = ?',
        [email, 'org_admin']
      );

      if (userRows.length === 0) {
        throw new Error('Invalid credentials');
      }

      const orgAdmin = userRows[0];
      const isValidPassword = await bcrypt.compare(password, orgAdmin.password_hash);
      if (!isValidPassword) throw new Error('Invalid credentials');

      // Return a normalized admin object
      const result = {
        id: orgAdmin.id,
        email: orgAdmin.email,
        name: orgAdmin.username || orgAdmin.email,
        username: orgAdmin.username,
        role: 'org_admin',
        organization_id: orgAdmin.organization_id,
        status: orgAdmin.status,
      };
      return result;
    } catch (error) {
      console.error('Admin login error:', error);
      throw error;
    }
  }

  // Get all users with their credit usage
  async getAllUsers(page = 1, limit = 50, search = '', orgId = null) {
    try {
      // Ensure page and limit are valid numbers
      const validPage = Number(page) || 1;
      const validLimit = Number(limit) || 50;
      const offset = (validPage - 1) * validLimit;

      let query = `
        SELECT 
          u.id,
          u.email,
          u.username,
          u.created_at,
          u.role,
          u.status,
          u.plan_type,
          u.plan_valid_until,
          COALESCE(uw.balance, 0) as credits_balance,
          COALESCE(SUM(CASE WHEN wt.transaction_type = 'debit' THEN wt.amount ELSE 0 END), 0) as credits_used,
          COUNT(DISTINCT ag.id) as agents_count,
          COUNT(DISTINCT c.id) as companies_count,
          COALESCE(SUM(CASE WHEN sur.service_name = 'elevenlabs' THEN sur.usage_amount ELSE 0 END), 0) as elevenlabs_usage,
          COALESCE(SUM(CASE WHEN sur.service_name = 'gemini' THEN sur.usage_amount ELSE 0 END), 0) as gemini_usage,
          COALESCE(SUM(CASE WHEN sur.service_name = 'deepgram' THEN sur.usage_amount ELSE 0 END), 0) as deepgram_usage
        FROM users u
        LEFT JOIN user_wallets uw ON uw.user_id = u.id
        LEFT JOIN wallet_transactions wt ON wt.user_id = u.id
        LEFT JOIN agents ag ON ag.user_id = u.id
        LEFT JOIN companies c ON c.user_id = u.id
        LEFT JOIN user_service_usage sur ON u.id = sur.user_id
          AND sur.period_start >= DATE_FORMAT(NOW(), '%Y-%m-01')
          AND sur.period_end <= LAST_DAY(NOW())
      `;

      const params = [];
      let whereClauses = [];

      if (orgId) {
        // Org admin context: only show accounts from their org
        whereClauses.push('u.organization_id = ?');
        params.push(orgId);
      }

      // Show all regular user roles (both 'user' and 'individual_user'), never admin roles
      whereClauses.push("u.role IN ('user', 'individual_user')");

      if (search && search.trim() !== '') {
        whereClauses.push('(u.email LIKE ? OR u.username LIKE ?)');
        params.push(`%${search}%`, `%${search}%`);
      }

      if (whereClauses.length > 0) {
        query += ` WHERE ` + whereClauses.join(' AND ');
      }

      // Use string interpolation for LIMIT and OFFSET since MySQL has issues with them as prepared statement params
      query += ` GROUP BY u.id, u.email, u.username, u.created_at, u.role, u.status, u.plan_type, u.plan_valid_until, uw.balance ORDER BY u.created_at DESC LIMIT ${validLimit} OFFSET ${offset}`;

      const [users] = await this.mysqlPool.execute(query, params);

      // Get total count
      let countQuery = 'SELECT COUNT(*) as total FROM users u';
      if (whereClauses.length > 0) {
        countQuery += ` WHERE ` + whereClauses.join(' AND ');
      }

      const [countResult] = await this.mysqlPool.execute(countQuery, params);
      const total = countResult[0].total;

      return {
        users,
        pagination: {
          page: validPage,
          limit: validLimit,
          total,
          totalPages: Math.ceil(total / validLimit)
        }
      };
    } catch (error) {
      console.error('Error fetching users:', error);
      throw error;
    }
  }

  // Get detailed user information
  async getUserDetails(userId) {
    try {
      const [users] = await this.mysqlPool.execute(
        'SELECT id, email, username, created_at, role, status FROM users WHERE id = ?',
        [userId]
      );

      if (users.length === 0) {
        throw new Error('User not found');
      }

      const user = users[0];

      // Get service limits
      const [limits] = await this.mysqlPool.execute(
        'SELECT * FROM user_service_limits WHERE user_id = ?',
        [userId]
      );

      // Get current month usage
      const [usage] = await this.mysqlPool.execute(`
        SELECT 
          service_name,
          SUM(usage_amount) as total_usage
        FROM user_service_usage
        WHERE user_id = ?
          AND period_start >= DATE_FORMAT(NOW(), '%Y-%m-01')
          AND period_end <= LAST_DAY(NOW())
        GROUP BY service_name
      `, [userId]);

      // Get billing history
      const [billing] = await this.mysqlPool.execute(
        'SELECT * FROM platform_billing WHERE user_id = ? ORDER BY billing_period_start DESC LIMIT 12',
        [userId]
      );

      return {
        user,
        limits,
        usage,
        billing
      };
    } catch (error) {
      console.error('Error fetching user details:', error);
      throw error;
    }
  }

  // Get user-specific resources (Agents, Campaigns)
  async getUserResources(userId) {
    try {
      const [agents] = await this.mysqlPool.execute(
        'SELECT id, name, status, created_at FROM agents WHERE user_id = ? ORDER BY created_at DESC',
        [userId]
      );

      const [campaigns] = await this.mysqlPool.execute(
        'SELECT id, name, status, created_at FROM campaigns WHERE user_id = ? ORDER BY created_at DESC',
        [userId]
      );

      return {
        agents,
        campaigns
      };
    } catch (error) {
      console.error('Error fetching user resources:', error);
      throw error;
    }
  }

  // Update user status (Active/Inactive/Locked)
  async updateUserStatus(userId, status, adminId) {
    try {
      await this.mysqlPool.execute(
        'UPDATE users SET status = ? WHERE id = ?',
        [status, userId]
      );

      await this.logActivity(
        adminId,
        'update_user_status',
        userId,
        `Updated user status to ${status}`,
        null
      );

      return { success: true, message: `User status updated to ${status}` };
    } catch (error) {
      console.error('Error updating user status:', error);
      throw error;
    }
  }

  // Admin-led Password Reset
  async resetUserPassword(userId, newPassword, adminId) {
    try {
      const saltRounds = 10;
      const passwordHash = await bcrypt.hash(newPassword, saltRounds);

      await this.mysqlPool.execute(
        'UPDATE users SET password_hash = ? WHERE id = ?',
        [passwordHash, userId]
      );

      await this.logActivity(
        adminId,
        'reset_user_password',
        userId,
        `Administratively reset user password`,
        null
      );

      return { success: true, message: 'Password reset successfully' };
    } catch (error) {
      console.error('Error resetting user password:', error);
      throw error;
    }
  }

  // Get user profile for impersonation
  async getImpersonateUser(userId, adminId) {
    try {
      const [rows] = await this.mysqlPool.execute(
        `SELECT u.id, u.email, u.username, u.full_name, u.profile_image,
                DATE_FORMAT(u.dob, "%Y-%m-%d") as dob, u.gender,
                u.current_company_id, u.role, u.status, u.organization_id,
                o.name as organization_name, o.logo_url as organization_logo_url
         FROM users u
         LEFT JOIN organizations o ON u.organization_id = o.id
         WHERE u.id = ?`,
        [userId]
      );

      if (rows.length === 0) {
        throw new Error('User not found');
      }

      const user = rows[0];

      await this.logActivity(
        adminId,
        'user_impersonation_start',
        userId,
        `Started impersonation of user ${user.email}`,
        null
      );

      return user;
    } catch (error) {
      console.error('Error fetching impersonation data:', error);
      throw error;
    }
  }

  // Set or update service limit for a user
  async setServiceLimit(userId, serviceName, monthlyLimit, dailyLimit, isEnabled = true) {
    try {
      const limitId = uuidv4();

      await this.mysqlPool.execute(`
        INSERT INTO user_service_limits (id, user_id, service_name, monthly_limit, daily_limit, is_enabled)
        VALUES (?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          monthly_limit = VALUES(monthly_limit),
          daily_limit = VALUES(daily_limit),
          is_enabled = VALUES(is_enabled),
          updated_at = CURRENT_TIMESTAMP
      `, [limitId, userId, serviceName, monthlyLimit, dailyLimit, isEnabled]);

      return { success: true, message: 'Service limit updated successfully' };
    } catch (error) {
      console.error('Error setting service limit:', error);
      throw error;
    }
  }

  // Get service limits for a user
  async getUserServiceLimits(userId) {
    try {
      const [limits] = await this.mysqlPool.execute(
        'SELECT * FROM user_service_limits WHERE user_id = ?',
        [userId]
      );

      // Create default structure if no limits exist
      const services = ['elevenlabs', 'gemini', 'deepgram'];
      const limitsMap = {};

      services.forEach(service => {
        const limit = limits.find(l => l.service_name === service);
        limitsMap[service] = limit || {
          service_name: service,
          monthly_limit: null,
          daily_limit: null,
          is_enabled: true
        };
      });

      return limitsMap;
    } catch (error) {
      console.error('Error fetching service limits:', error);
      throw error;
    }
  }

  // Check if user has exceeded their service limit
  async checkServiceLimit(userId, serviceName, requestedAmount) {
    try {
      // Get service limit
      const [limits] = await this.mysqlPool.execute(
        'SELECT * FROM user_service_limits WHERE user_id = ? AND service_name = ?',
        [userId, serviceName]
      );

      // If no limit is set or service is disabled, allow
      if (limits.length === 0 || !limits[0].is_enabled) {
        return { allowed: true };
      }

      const limit = limits[0];

      // Check monthly limit
      if (limit.monthly_limit !== null) {
        const [monthlyUsage] = await this.mysqlPool.execute(`
          SELECT COALESCE(SUM(usage_amount), 0) as total
          FROM user_service_usage
          WHERE user_id = ? AND service_name = ?
            AND period_start >= DATE_FORMAT(NOW(), '%Y-%m-01')
            AND period_end <= LAST_DAY(NOW())
        `, [userId, serviceName]);

        const currentUsage = monthlyUsage[0].total;
        if (currentUsage + requestedAmount > limit.monthly_limit) {
          return {
            allowed: false,
            reason: 'monthly_limit_exceeded',
            limit: limit.monthly_limit,
            current: currentUsage
          };
        }
      }

      // Check daily limit
      if (limit.daily_limit !== null) {
        const [dailyUsage] = await this.mysqlPool.execute(`
          SELECT COALESCE(SUM(usage_amount), 0) as total
          FROM user_service_usage
          WHERE user_id = ? AND service_name = ?
            AND period_start = CURDATE()
            AND period_end = CURDATE()
        `, [userId, serviceName]);

        const currentUsage = dailyUsage[0].total;
        if (currentUsage + requestedAmount > limit.daily_limit) {
          return {
            allowed: false,
            reason: 'daily_limit_exceeded',
            limit: limit.daily_limit,
            current: currentUsage
          };
        }
      }

      return { allowed: true };
    } catch (error) {
      console.error('Error checking service limit:', error);
      // In case of error, allow the request to proceed
      return { allowed: true };
    }
  }

  // Track service usage
  async trackServiceUsage(userId, serviceName, usageAmount, usageType = 'characters') {
    try {
      const usageId = uuidv4();
      const today = new Date().toISOString().split('T')[0];

      await this.mysqlPool.execute(`
        INSERT INTO user_service_usage (id, user_id, service_name, usage_amount, usage_type, period_start, period_end)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          usage_amount = usage_amount + VALUES(usage_amount),
          updated_at = CURRENT_TIMESTAMP
      `, [usageId, userId, serviceName, usageAmount, usageType, today, today]);

      return { success: true };
    } catch (error) {
      console.error('Error tracking service usage:', error);
      throw error;
    }
  }

  // Create or update billing record
  async createBillingRecord(userId, periodStart, periodEnd, usageData, platformFee) {
    try {
      const billingId = uuidv4();
      const totalAmount = (usageData.elevenlabs || 0) + (usageData.gemini || 0) +
        (usageData.deepgram || 0) + (platformFee || 0);

      await this.mysqlPool.execute(`
        INSERT INTO platform_billing 
        (id, user_id, billing_period_start, billing_period_end, 
         elevenlabs_usage, gemini_usage, deepgram_usage, platform_fee, total_amount, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
        ON DUPLICATE KEY UPDATE
          elevenlabs_usage = VALUES(elevenlabs_usage),
          gemini_usage = VALUES(gemini_usage),
          deepgram_usage = VALUES(deepgram_usage),
          platform_fee = VALUES(platform_fee),
          total_amount = VALUES(total_amount),
          updated_at = CURRENT_TIMESTAMP
      `, [
        billingId, userId, periodStart, periodEnd,
        usageData.elevenlabs || 0,
        usageData.gemini || 0,
        usageData.deepgram || 0,
        platformFee || 0,
        totalAmount
      ]);

      return { success: true, billingId };
    } catch (error) {
      console.error('Error creating billing record:', error);
      throw error;
    }
  }

  // Update billing status
  async updateBillingStatus(billingId, status, notes = '') {
    try {
      await this.mysqlPool.execute(
        'UPDATE platform_billing SET status = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [status, notes, billingId]
      );

      return { success: true };
    } catch (error) {
      console.error('Error updating billing status:', error);
      throw error;
    }
  }

  // Log admin activity
  async logActivity(adminId, actionType, targetUserId = null, details = '', ipAddress = null) {
    try {
      const logId = uuidv4();

      await this.mysqlPool.execute(
        'INSERT INTO admin_activity_log (id, admin_id, action_type, target_user_id, details, ip_address) VALUES (?, ?, ?, ?, ?, ?)',
        [logId, adminId, actionType, targetUserId, details, ipAddress]
      );

      return { success: true };
    } catch (error) {
      console.error('Error logging admin activity:', error);
      // Don't throw error for logging failures
      return { success: false };
    }
  }

  // Get administrative audit logs
  async getAuditLogs(page = 1, limit = 50, orgId = null) {
    try {
      const offset = (page - 1) * limit;

      let whereClause = '';
      let params = [];

      if (orgId) {
        // Must show logs if the admin is in the org, OR if the target user is in the org.
        whereClause = `
          WHERE l.admin_id IN (SELECT id FROM users WHERE organization_id = ?) 
             OR l.target_user_id IN (SELECT id FROM users WHERE organization_id = ?)
        `;
        params.push(orgId, orgId);
      }

      const [logs] = await this.mysqlPool.execute(`
        SELECT 
          l.*,
          COALESCE(a.name, org_a.username) as admin_name,
          COALESCE(a.email, org_a.email) as admin_email,
          u.username as target_user_name,
          u.email as target_user_email
        FROM admin_activity_log l
        LEFT JOIN admin_users a ON l.admin_id = a.id
        LEFT JOIN users org_a ON l.admin_id = org_a.id
        LEFT JOIN users u ON l.target_user_id = u.id
        ${whereClause}
        ORDER BY l.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `, params);

      const countQuery = orgId
        ? `SELECT COUNT(*) as total FROM admin_activity_log l ${whereClause}`
        : 'SELECT COUNT(*) as total FROM admin_activity_log';
      const countParams = orgId ? [orgId, orgId] : [];
      const [countResult] = await this.mysqlPool.execute(countQuery, countParams);
      const total = countResult[0].total;

      return {
        logs,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      throw error;
    }
  }

  // Get dashboard statistics
  async getDashboardStats(orgId = null) {
    try {
      const orgParam = orgId ? [orgId] : [];

      // Total users
      const userWhere = orgId ? 'WHERE organization_id = ?' : '';
      const [userCount] = await this.mysqlPool.execute(`SELECT COUNT(*) as total FROM users ${userWhere}`, orgParam);

      // Active users this month (users with usage)
      const userJoin = orgId ? 'JOIN users u ON u.id = usu.user_id AND u.organization_id = ?' : '';
      const [activeUsers] = await this.mysqlPool.execute(`
        SELECT COUNT(DISTINCT usu.user_id) as total
        FROM user_service_usage usu
        ${userJoin}
        WHERE usu.period_start >= DATE_FORMAT(NOW(), '%Y-%m-01')
      `, orgParam);

      // Total revenue this month
      const pbJoin = orgId ? 'JOIN users u ON u.id = pb.user_id AND u.organization_id = ?' : '';
      const [revenue] = await this.mysqlPool.execute(`
        SELECT COALESCE(SUM(pb.total_amount), 0) as total
        FROM platform_billing pb
        ${pbJoin}
        WHERE pb.billing_period_start >= DATE_FORMAT(NOW(), '%Y-%m-01')
      `, orgParam);

      // Pending billing
      const [pending] = await this.mysqlPool.execute(`
        SELECT COALESCE(SUM(pb.total_amount), 0) as total
        FROM platform_billing pb
        ${pbJoin}
        WHERE pb.status = 'pending'
      `, orgParam);

      // Service usage breakdown for current month
      const [serviceUsage] = await this.mysqlPool.execute(`
        SELECT 
          usu.service_name,
          COUNT(DISTINCT usu.user_id) as user_count,
          SUM(usu.usage_amount) as total_usage
        FROM user_service_usage usu
        ${userJoin}
        WHERE usu.period_start >= DATE_FORMAT(NOW(), '%Y-%m-01')
        GROUP BY usu.service_name
      `, orgParam);

      return {
        totalUsers: userCount[0].total,
        activeUsers: activeUsers[0].total,
        monthlyRevenue: revenue[0].total,
        pendingBilling: pending[0].total,
        serviceUsage
      };
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
      throw error;
    }
  }
}

module.exports = AdminService;
