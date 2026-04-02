const { v4: uuidv4 } = require('uuid');

class CompanyService {
    constructor(mysqlPool) {
        this.mysqlPool = mysqlPool;
    }

    async getCompaniesByUserId(userId) {
        const [rows] = await this.mysqlPool.execute(
            'SELECT * FROM companies WHERE user_id = ? ORDER BY created_at DESC',
            [userId]
        );
        return rows;
    }

    async createCompany(userId, name) {
        const companyId = uuidv4();
        await this.mysqlPool.execute(
            'INSERT INTO companies (id, user_id, name) VALUES (?, ?, ?)',
            [companyId, userId, name]
        );

        // If it's the first company, set it as current
        const [user] = await this.mysqlPool.execute(
            'SELECT current_company_id FROM users WHERE id = ?',
            [userId]
        );

        if (user.length > 0 && !user[0].current_company_id) {
            await this.mysqlPool.execute(
                'UPDATE users SET current_company_id = ? WHERE id = ?',
                [companyId, userId]
            );
        }

        return { id: companyId, name };
    }

    async switchCompany(userId, companyId) {
        // Verify company belongs to user
        const [rows] = await this.mysqlPool.execute(
            'SELECT id FROM companies WHERE id = ? AND user_id = ?',
            [companyId, userId]
        );

        if (rows.length === 0) {
            throw new Error('Company not found or unauthorized');
        }

        await this.mysqlPool.execute(
            'UPDATE users SET current_company_id = ? WHERE id = ?',
            [companyId, userId]
        );

        return { success: true, companyId };
    }

    async renameCompany(userId, companyId, newName) {
        // Verify company belongs to user (owner)
        const [rows] = await this.mysqlPool.execute(
            'SELECT id FROM companies WHERE id = ? AND user_id = ?',
            [companyId, userId]
        );

        if (rows.length === 0) {
            throw new Error('Company not found or unauthorized');
        }

        await this.mysqlPool.execute(
            'UPDATE companies SET name = ?, updated_at = NOW() WHERE id = ?',
            [newName, companyId]
        );

        return { success: true, companyId, name: newName };
    }
}

module.exports = CompanyService;
