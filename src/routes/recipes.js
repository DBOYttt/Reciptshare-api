const express = require('express');
const { 
  createRecipe, 
  getRecipes, 
  getRecipeById, 
  updateRecipe, 
  deleteRecipe 
} = require('../controllers/recipeController');
const { validateRecipe, validateRecipeQuery } = require('../middleware/recipeValidation');
const { authenticateToken, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// Public routes (with optional authentication)
router.get('/', optionalAuth, validateRecipeQuery, getRecipes);
router.get('/:id', optionalAuth, getRecipeById);

// Protected routes (require authentication)
router.post('/', authenticateToken, validateRecipe, createRecipe);
router.put('/:id', authenticateToken, validateRecipe, updateRecipe);
router.delete('/:id', authenticateToken, deleteRecipe);

module.exports = router;