const express = require('express');
const { getFavoriteRecipes, getRecipeHistory } = require('../controllers/collectionController');
const { authenticateToken } = require('../middleware/auth');
const { validateFollowQuery } = require('../middleware/commentValidation');

const router = express.Router();

// All collection routes require authentication
router.get('/favorites', authenticateToken, validateFollowQuery, getFavoriteRecipes);
router.get('/history', authenticateToken, validateFollowQuery, getRecipeHistory);

module.exports = router;