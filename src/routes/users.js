const express = require('express');
const { updateProfile, getPublicProfile } = require('../controllers/userController');
const { validateUpdateProfile } = require('../middleware/validation');
const { authenticateToken, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// Update user profile (protected)
router.put('/profile', authenticateToken, validateUpdateProfile, updateProfile);

// Get public user profile by username (optional auth)
router.get('/:username', optionalAuth, getPublicProfile);

module.exports = router;