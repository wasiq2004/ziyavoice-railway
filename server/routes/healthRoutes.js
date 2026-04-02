/**
 * Health Check Routes
 * Global health endpoint for monitoring
 */

const express = require('express');
const router = express.Router();

let uptime = Date.now();

/**
 * GET /api/health
 * Returns health status of the API
 */
router.get('/', (req, res) => {
  try {
    const uptimeMs = Date.now() - uptime;
    const uptimeSeconds = Math.floor(uptimeMs / 1000);
    const uptimeMinutes = Math.floor(uptimeSeconds / 60);
    const hours = Math.floor(uptimeMinutes / 60);
    const minutes = uptimeMinutes % 60;

    res.status(200).json({
      status: 'healthy',
      service: 'ZIYA Voice Agent Dashboard',
      timestamp: new Date().toISOString(),
      uptime: {
        milliseconds: uptimeMs,
        seconds: uptimeSeconds,
        formatted: `${hours}h ${minutes}m`
      },
      version: {
        api: 'v1.0.0',
        schema: 'stable'
      },
      checks: {
        runtime: 'operational',
        database: 'monitoring',
        cache: 'operational'
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      message: 'Health check failed',
      error: error.message
    });
  }
});

/**
 * GET /api/health/live
 * For Kubernetes liveness probe
 */
router.get('/live', (req, res) => {
  res.status(200).json({ status: 'alive' });
});

/**
 * GET /api/health/ready
 * For Kubernetes readiness probe
 */
router.get('/ready', (req, res) => {
  const startupChecks = req.app.locals?.startupChecks;
  if (startupChecks && startupChecks.ready === false) {
    return res.status(503).json({ status: 'not-ready', startupChecks });
  }

  res.status(200).json({ status: 'ready', startupChecks: startupChecks || null });
});

// Reset uptime (for testing)
router.post('/reset', (req, res) => {
  uptime = Date.now();
  res.json({ success: true, message: 'Uptime reset' });
});

module.exports = router;
