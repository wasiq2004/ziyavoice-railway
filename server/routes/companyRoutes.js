const express = require('express');

module.exports = (companyService) => {
    const router = express.Router();

    // Create a new company (must be before /:userId)
    router.post('/create', async (req, res) => {
        try {
            const { userId, name } = req.body;
            if (!userId || !name) {
                return res.status(400).json({ success: false, message: 'User ID and company name are required' });
            }
            const company = await companyService.createCompany(userId, name);
            res.json({ success: true, company });
        } catch (error) {
            console.error('Error creating company:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    });

    // Switch current company (must be before /:userId)
    router.post('/switch', async (req, res) => {
        try {
            const { userId, companyId } = req.body;
            if (!userId || !companyId) {
                return res.status(400).json({ success: false, message: 'User ID and Company ID are required' });
            }
            const result = await companyService.switchCompany(userId, companyId);
            res.json(result);
        } catch (error) {
            console.error('Error switching company:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    });

    // Get all companies for a user (catch-all param route must be last)
    router.get('/:userId', async (req, res) => {
        try {
            const { userId } = req.params;
            const companies = await companyService.getCompaniesByUserId(userId);
            res.json({ success: true, companies });
        } catch (error) {
            console.error('Error fetching companies:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    });

    // Rename company
    router.put('/:companyId', async (req, res) => {
        try {
            const { companyId } = req.params;
            const { userId, company_name } = req.body;

            if (!userId || !company_name) {
                return res.status(400).json({ success: false, message: 'User ID and company_name are required' });
            }

            const result = await companyService.renameCompany(userId, companyId, company_name);
            res.json(result);
        } catch (error) {
            console.error('Error renaming company:', error);
            if (error.message === 'Company not found or unauthorized') {
                return res.status(403).json({ success: false, message: error.message });
            }
            res.status(500).json({ success: false, message: error.message });
        }
    });

    return router;
};
