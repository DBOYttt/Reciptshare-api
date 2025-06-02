const express = require('express');
const { 
  getUserFeed, 
  getTrendingRecipes, 
  getUserActivity 
} = require('../controllers/feedController');
const { validateFollowQuery } = require('../middleware/commentValidation');
const { authenticateToken, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// User personalized feed (requires authentication)
router.get('/feed', authenticateToken, validateFollowQuery, getUserFeed);

// Trending recipes (optional authentication)
router.get('/trending', optionalAuth, validateFollowQuery, getTrendingRecipes);

// User activity notifications (requires authentication)
router.get('/activity', authenticateToken, validateFollowQuery, getUserActivity);

module.exports = router;