const express = require('express');
const { globalSearch, searchRecipes } = require('../controllers/searchController');
const { 
  validateSearch, 
  validateAdvancedRecipeSearch 
} = require('../middleware/shoppingListValidation');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();

// Search routes (optional authentication for personalized results)
router.get('/', optionalAuth, validateSearch, globalSearch);
router.get('/recipes', optionalAuth, validateAdvancedRecipeSearch, searchRecipes);

module.exports = router;