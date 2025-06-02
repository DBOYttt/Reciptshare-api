const express = require('express');
const { 
  register, 
  login, 
  getProfile, 
  changePassword 
} = require('../controllers/authController');
const { 
  validateRegistration, 
  validateLogin, 
  validateChangePassword 
} = require('../middleware/validation');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Public routes
router.post('/register', validateRegistration, register);
router.post('/login', validateLogin, login);

// Protected routes (require authentication)
router.get('/profile', authenticateToken, getProfile);
router.put('/change-password', authenticateToken, validateChangePassword, changePassword);

// Test route to verify token
router.get('/verify', authenticateToken, (req, res) => {
  res.json({
    message: 'Token is valid',
    user: {
      id: req.user.id,
      username: req.user.username,
      email: req.user.email,
      firstName: req.user.first_name,
      lastName: req.user.last_name,
      isVerified: req.user.is_verified
    },
    timestamp: new Date().toISOString()
  });
});

module.exports = router;