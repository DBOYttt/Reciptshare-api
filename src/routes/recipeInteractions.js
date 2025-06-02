const express = require('express');
const { 
  toggleRecipeLike, 
  rateRecipe, 
  getRecipeRatings, 
  deleteRating,
  validateRating 
} = require('../controllers/recipeInteractionController');
const { authenticateToken, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// Recipe likes
router.post('/:id/like', authenticateToken, toggleRecipeLike);

// Recipe ratings
router.post('/:id/rate', authenticateToken, validateRating, rateRecipe);
router.get('/:id/ratings', optionalAuth, getRecipeRatings);
router.delete('/:id/rating', authenticateToken, deleteRating);

module.exports = router;