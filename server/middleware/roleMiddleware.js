/**
 * Role-Based Access Control Middleware
 * Restricts endpoints to specific user roles
 */

const requireRole = (requiredRoles) => {
  return (req, res, next) => {
    try {
      // Normalize to array
      const roles = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];

      // Extract role from request
      const userRole = req.body?.userRole || 
                       req.query?.role || 
                       req.headers?.['x-user-role'];

      if (!userRole) {
        return res.status(403).json({
          success: false,
          message: 'User role not found in request'
        });
      }

      // Check if user role matches required roles
      if (!roles.includes(userRole)) {
        return res.status(403).json({
          success: false,
          message: `Access denied. Required role(s): ${roles.join(', ')}, Your role: ${userRole}`
        });
      }

      // Attach role to request
      req.userRole = userRole;
      next();
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Role middleware error',
        error: error.message
      });
    }
  };
};

/**
 * Middleware to require Super Admin access
 */
const requireSuperAdmin = requireRole('super_admin');

/**
 * Middleware to require Org Admin access (or Super Admin)
 */
const requireOrgAdmin = (req, res, next) => {
  const roles = ['org_admin', 'super_admin'];
  const userRole = req.body?.userRole || 
                   req.query?.role || 
                   req.headers?.['x-user-role'];

  if (!userRole || !roles.includes(userRole)) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Org Admin or Super Admin access required'
    });
  }

  req.userRole = userRole;
  next();
};

/**
 * Middleware to require User access (or higher)
 */
const requireUser = (req, res, next) => {
  const roles = ['user', 'org_admin', 'super_admin'];
  const userRole = req.body?.userRole || 
                   req.query?.role || 
                   req.headers?.['x-user-role'];

  if (!userRole || !roles.includes(userRole)) {
    return res.status(403).json({
      success: false,
      message: 'User access required'
    });
  }

  req.userRole = userRole;
  next();
};

module.exports = {
  requireRole,
  requireSuperAdmin,
  requireOrgAdmin,
  requireUser
};
