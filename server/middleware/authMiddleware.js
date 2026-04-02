/**
 * Authentication Middleware
 * Verifies user identity and attaches user info to request
 */

const authMiddleware = (req, res, next) => {
  try {
    // Extract user from query params, body, or session
    const userId = req.body?.userId || 
                   req.query?.userId || 
                   req.user?.id || 
                   req.body?.agent?.userId;

    if (!userId || userId === 'null' || userId === 'undefined') {
      return res.status(401).json({
        success: false,
        message: 'User authentication required'
      });
    }

    // Attach user info to request
    req.userId = userId;
    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Authentication middleware error',
      error: error.message
    });
  }
};

module.exports = authMiddleware;
