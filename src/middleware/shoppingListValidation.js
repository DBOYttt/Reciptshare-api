const { body, query } = require('express-validator');

// Shopping list item validation
const validateShoppingListItem = [
  body('ingredientName')
    .isLength({ min: 1, max: 255 })
    .withMessage('Ingredient name is required and must be less than 255 characters')
    .trim(),

  body('quantity')
    .optional()
    .isFloat({ min: 0.01 })
    .withMessage('Quantity must be a positive number'),

  body('unit')
    .optional()
    .isLength({ max: 50 })
    .withMessage('Unit must be less than 50 characters')
    .trim(),

  body('notes')
    .optional()
    .isLength({ max: 255 })
    .withMessage('Notes must be less than 255 characters')
    .trim(),

  body('recipeId')
    .optional()
    .isLength({ min: 1 })
    .withMessage('Recipe ID must be a valid string'),

  body('isCompleted')
    .optional()
    .isBoolean()
    .withMessage('isCompleted must be a boolean')
];

// Add recipe to shopping list validation
const validateAddRecipeToShoppingList = [
  body('servingMultiplier')
    .optional()
    .isFloat({ min: 0.1, max: 10 })
    .withMessage('Serving multiplier must be between 0.1 and 10')
];

// Shopping list query validation
const validateShoppingListQuery = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),

  query('completed')
    .optional()
    .isIn(['true', 'false', 'all'])
    .withMessage('Completed filter must be true, false, or all')
];

// Search validation
const validateSearch = [
  query('q')
    .isLength({ min: 2, max: 255 })
    .withMessage('Search query must be between 2 and 255 characters')
    .trim(),

  query('type')
    .optional()
    .isIn(['all', 'recipes', 'users', 'ingredients'])
    .withMessage('Search type must be one of: all, recipes, users, ingredients'),

  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1 and 50')
];

// Advanced recipe search validation
const validateAdvancedRecipeSearch = [
  query('q')
    .optional()
    .isLength({ max: 255 })
    .withMessage('Search query must be less than 255 characters')
    .trim(),

  query('ingredients')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Ingredients list must be less than 500 characters')
    .trim(),

  query('categories')
    .optional()
    .isLength({ max: 200 })
    .withMessage('Categories list must be less than 200 characters')
    .trim(),

  query('difficulty')
    .optional()
    .isIn(['Easy', 'Medium', 'Hard', 'Expert'])
    .withMessage('Difficulty must be one of: Easy, Medium, Hard, Expert'),

  query('maxPrepTime')
    .optional()
    .isInt({ min: 1, max: 1440 })
    .withMessage('Max prep time must be between 1 and 1440 minutes'),

  query('maxCookTime')
    .optional()
    .isInt({ min: 1, max: 1440 })
    .withMessage('Max cook time must be between 1 and 1440 minutes'),

  query('minRating')
    .optional()
    .isFloat({ min: 1, max: 5 })
    .withMessage('Min rating must be between 1 and 5'),

  query('sort')
    .optional()
    .isIn(['relevance', 'newest', 'oldest', 'popular', 'rating', 'prep_time', 'cook_time', 'total_time'])
    .withMessage('Sort must be one of: relevance, newest, oldest, popular, rating, prep_time, cook_time, total_time'),

  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1 and 50')
];

module.exports = {
  validateShoppingListItem,
  validateAddRecipeToShoppingList,
  validateShoppingListQuery,
  validateSearch,
  validateAdvancedRecipeSearch
};