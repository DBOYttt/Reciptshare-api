const express = require('express');
const { 
  toggleFollow, 
  getUserFollowers, 
  getUserFollowing, 
  getFollowSuggestions 
} = require('../controllers/followController');
const { validateFollowQuery } = require('../middleware/commentValidation');
const { authenticateToken, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// Follow/unfollow
router.post('/users/:username/follow', authenticateToken, toggleFollow);

// Get followers and following
router.get('/users/:username/followers', optionalAuth, validateFollowQuery, getUserFollowers);
router.get('/users/:username/following', optionalAuth, validateFollowQuery, getUserFollowing);

// Get follow suggestions (requires authentication)
router.get('/suggestions', authenticateToken, getFollowSuggestions);

module.exports = router;