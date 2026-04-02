/**
 * OrganizationService — manages organizations and org-admin user accounts
 */
const bcrypt = require('bcryptjs');

class OrganizationService {
    constructor(mysqlPool) {
        this.mysqlPool = mysqlPool;
    }

    // ─── Organizations ────────────────────────────────────────────────────────

    async listOrganizations() {
        const [rows] = await this.mysqlPool.execute(`
      SELECT
        o.*,
        COUNT(DISTINCT CASE WHEN u.role = 'org_admin' THEN u.id END) AS admin_count,
        COUNT(DISTINCT CASE WHEN u.role IN ('user', 'individual_user') THEN u.id END) AS user_count,
        COALESCE(SUM(CASE WHEN u.role = 'org_admin' THEN w.balance ELSE 0 END), 0) AS credit_balance
      FROM organizations o
      LEFT JOIN users u ON u.organization_id = o.id
      LEFT JOIN user_wallets w ON w.user_id = u.id
      GROUP BY o.id
      ORDER BY o.created_at DESC
    `);
        return rows;
    }

    async getOrganization(orgId) {
        const [rows] = await this.mysqlPool.execute(
            'SELECT * FROM organizations WHERE id = ?',
            [orgId]
        );
        if (rows.length === 0) throw new Error('Organization not found');
        return rows[0];
    }

    async createOrganization(name, createdBy, logo_url = null) {
        const [result] = await this.mysqlPool.execute(
            'INSERT INTO organizations (name, created_by, status, logo_url) VALUES (?, ?, ?, ?)',
            [name, createdBy || null, 'active', logo_url]
        );
        const [org] = await this.mysqlPool.execute(
            'SELECT * FROM organizations WHERE id = ?',
            [result.insertId]
        );
        return org[0];
    }

    async updateOrganization(orgId, { name, status, logo_url }) {
        const fields = [];
        const values = [];
        if (name !== undefined) { fields.push('name = ?'); values.push(name); }
        if (status !== undefined) { fields.push('status = ?'); values.push(status); }
        if (logo_url !== undefined) { fields.push('logo_url = ?'); values.push(logo_url); }
        if (fields.length === 0) throw new Error('Nothing to update');
        values.push(orgId);
        await this.mysqlPool.execute(
            `UPDATE organizations SET ${fields.join(', ')} WHERE id = ?`,
            values
        );
        return this.getOrganization(orgId);
    }

    async disableOrganization(orgId) {
        await this.mysqlPool.execute(
            "UPDATE organizations SET status = 'inactive' WHERE id = ?",
            [orgId]
        );
    }

    // ─── Org Admins ───────────────────────────────────────────────────────────

    async listOrgAdmins() {
        const [rows] = await this.mysqlPool.execute(`
      SELECT u.id, u.email, u.username, u.organization_id, u.status, u.created_at,
             o.name AS organization_name
      FROM users u
      LEFT JOIN organizations o ON o.id = u.organization_id
      WHERE u.role = 'org_admin'
      ORDER BY u.created_at DESC
    `);
        return rows;
    }

    async createOrgAdmin({ email, username, password, organization_id }) {
        // Check email uniqueness
        const [existing] = await this.mysqlPool.execute(
            'SELECT id FROM users WHERE email = ?', [email]
        );
        if (existing.length > 0) throw new Error('Email already in use');

        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);
        const userId = require('crypto').randomBytes(8).toString('hex');

        await this.mysqlPool.execute(
            `INSERT INTO users (id, email, username, password_hash, role, organization_id, status)
       VALUES (?, ?, ?, ?, 'org_admin', ?, 'active')`,
            [userId, email, username, passwordHash, organization_id]
        );

        const [rows] = await this.mysqlPool.execute(
            `SELECT u.id, u.email, u.username, u.organization_id, u.status, u.created_at,
              o.name AS organization_name
       FROM users u
       LEFT JOIN organizations o ON o.id = u.organization_id
       WHERE u.id = ?`,
            [userId]
        );
        return rows[0];
    }

    // ─── Super Admin Stats ────────────────────────────────────────────────────

    async getSuperAdminStats() {
        const [[orgCount]] = await this.mysqlPool.execute(
            "SELECT COUNT(*) AS total FROM organizations"
        );
        const [[orgAdminCount]] = await this.mysqlPool.execute(
            "SELECT COUNT(*) AS total FROM users WHERE role = 'org_admin'"
        );
        const [[userCount]] = await this.mysqlPool.execute(
            "SELECT COUNT(*) AS total FROM users WHERE role = 'user'"
        );
        const [[activeUsers]] = await this.mysqlPool.execute(`
      SELECT COUNT(DISTINCT user_id) AS total
      FROM user_service_usage
      WHERE period_start >= DATE_FORMAT(NOW(), '%Y-%m-01')
    `);
        const [[creditsUsed]] = await this.mysqlPool.execute(`
      SELECT COALESCE(SUM(amount), 0) AS total
      FROM wallet_transactions
      WHERE transaction_type = 'debit'
    `);

        // Org breakdown
        const [orgBreakdown] = await this.mysqlPool.execute(`
      SELECT
        o.id, o.name, o.status,
        COUNT(DISTINCT CASE WHEN u.role = 'org_admin' THEN u.id END) AS admin_count,
        COUNT(DISTINCT CASE WHEN u.role = 'user' THEN u.id END) AS user_count
      FROM organizations o
      LEFT JOIN users u ON u.organization_id = o.id
      GROUP BY o.id
      ORDER BY user_count DESC
      LIMIT 20
    `);

        // Service usage
        const [serviceUsage] = await this.mysqlPool.execute(`
      SELECT 
        service_name,
        COUNT(DISTINCT user_id) AS user_count,
        SUM(usage_amount) AS total_usage
      FROM user_service_usage
      WHERE period_start >= DATE_FORMAT(NOW(), '%Y-%m-01')
      GROUP BY service_name
    `);

        return {
            totalOrganizations: orgCount.total,
            totalOrgAdmins: orgAdminCount.total,
            totalUsers: userCount.total,
            activeUsers: activeUsers.total,
            totalCreditsUsed: parseFloat(creditsUsed.total) || 0,
            orgBreakdown,
            serviceUsage,
        };
    }

    // ─── All Users (for Super Admin) ─────────────────────────────────────────

    async listAllUsers({ page = 1, limit = 50, search = '', orgId = null } = {}) {
        const offset = (page - 1) * limit;
        const params = [];
        let where = "WHERE u.role = 'user'";

        if (search) {
            where += " AND (u.email LIKE ? OR u.username LIKE ?)";
            params.push(`%${search}%`, `%${search}%`);
        }
        if (orgId) {
            where += " AND u.organization_id = ?";
            params.push(orgId);
        }

        const [users] = await this.mysqlPool.execute(
            `SELECT u.id, u.email, u.username, u.organization_id, u.role, u.status, u.created_at,
              o.name AS organization_name
       FROM users u
       LEFT JOIN organizations o ON o.id = u.organization_id
       ${where}
       ORDER BY u.created_at DESC
       LIMIT ${limit} OFFSET ${offset}`,
            params
        );

        const countParams = [...params];
        const [[{ total }]] = await this.mysqlPool.execute(
            `SELECT COUNT(*) AS total FROM users u ${where}`,
            countParams
        );

        return {
            users,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }
}

module.exports = OrganizationService;
