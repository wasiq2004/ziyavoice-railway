/**
 * V1 API Router
 * Central routing hub for API v1
 * Combines all role-based routes
 */
const express = require('express');
const router = express.Router();

// Import route modules
const {
  router: commonRouter,
  initCommonController
} = require('./commonRoutes');

const {
  router: userRouter,
  initUserController
} = require('./userRoutes');

const {
  router: adminRouter,
  initAdminController
} = require('./adminRoutes');

const {
  router: superadminRouter,
  initSuperAdminController
} = require('./superadminRoutes');

function initializeV1Routes(services) {
  const {
    authService,
    mysqlPool,
    walletService,
    campaignService,
    adminService,
    organizationService,
    companyService
  } = services;

  // Initialize each controller with its dependencies
  initCommonController(authService, mysqlPool, walletService, companyService);
  initUserController(mysqlPool, walletService, campaignService);
  initAdminController(mysqlPool, adminService, walletService);
  initSuperAdminController(mysqlPool, adminService, organizationService, walletService);

  // Mount routes
  router.use('/common', commonRouter);
  router.use('/user', userRouter);
  router.use('/admin', adminRouter);
  router.use('/superadmin', superadminRouter);

  console.log('✅ V1 API routes registered');

  return router;
}

module.exports = { router, initializeV1Routes };
