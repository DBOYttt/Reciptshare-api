const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');

// Middleware to verify JWT token
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        error: 'Access denied',
        message: 'No token provided',
        timestamp: new Date().toISOString()
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user from database to ensure user still exists and is active
    const client = await pool.connect();
    try {
      const userResult = await client.query(
        'SELECT id, username, email, first_name, last_name, is_active, is_verified FROM users WHERE id = $1',
        [decoded.userId]
      );

      if (userResult.rows.length === 0) {
        return res.status(401).json({
          error: 'Access denied',
          message: 'User not found',
          timestamp: new Date().toISOString()
        });
      }

      const user = userResult.rows[0];

      if (!user.is_active) {
        return res.status(401).json({
          error: 'Access denied',
          message: 'Account is deactivated',
          timestamp: new Date().toISOString()
        });
      }

      // Add user info to request object
      req.user = user;
      next();
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ Authentication error:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'Access denied',
        message: 'Invalid token',
        timestamp: new Date().toISOString()
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Access denied',
        message: 'Token expired',
        timestamp: new Date().toISOString()
      });
    }

    res.status(500).json({
      error: 'Internal server error',
      message: 'Authentication failed',
      timestamp: new Date().toISOString()
    });
  }
};

// Middleware to check if user is verified (optional)
const requireVerified = (req, res, next) => {
  if (!req.user.is_verified) {
    return res.status(403).json({
      error: 'Access denied',
      message: 'Account verification required',
      timestamp: new Date().toISOString()
    });
  }
  next();
};

// Optional authentication (doesn't fail if no token)
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      req.user = null;
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const client = await pool.connect();
    try {
      const userResult = await client.query(
        'SELECT id, username, email, first_name, last_name, is_active, is_verified FROM users WHERE id = $1',
        [decoded.userId]
      );

      if (userResult.rows.length > 0 && userResult.rows[0].is_active) {
        req.user = userResult.rows[0];
      } else {
        req.user = null;
      }
    } finally {
      client.release();
    }
  } catch (error) {
    req.user = null;
  }
  next();
};

module.exports = {
  authenticateToken,
  requireVerified,
  optionalAuth
};