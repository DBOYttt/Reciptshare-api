const express = require('express');
const { getPlatformStatistics, getUserStatistics } = require('../controllers/statisticsController');
const { authenticateToken, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// Platform statistics (public)
router.get('/platform', getPlatformStatistics);

// User statistics (requires authentication)
router.get('/user', authenticateToken, getUserStatistics);

module.exports = router;