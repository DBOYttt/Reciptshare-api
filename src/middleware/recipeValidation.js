const { body, query } = require('express-validator');

// Recipe creation/update validation
const validateRecipe = [
  body('title')
    .isLength({ min: 1, max: 255 })
    .withMessage('Title is required and must be less than 255 characters')
    .trim(),

  body('description')
    .isLength({ min: 10, max: 2000 })
    .withMessage('Description must be between 10 and 2000 characters')
    .trim(),

  body('prepTimeMinutes')
    .isInt({ min: 1, max: 1440 })
    .withMessage('Prep time must be between 1 and 1440 minutes (24 hours)'),

  body('cookTimeMinutes')
    .isInt({ min: 1, max: 1440 })
    .withMessage('Cook time must be between 1 and 1440 minutes (24 hours)'),

  body('servings')
    .isInt({ min: 1, max: 100 })
    .withMessage('Servings must be between 1 and 100'),

  body('difficulty')
    .isIn(['Easy', 'Medium', 'Hard', 'Expert'])
    .withMessage('Difficulty must be one of: Easy, Medium, Hard, Expert'),

  body('imageUrl')
    .optional()
    .isURL()
    .withMessage('Image URL must be a valid URL'),

  body('instructions')
    .isArray({ min: 1 })
    .withMessage('Instructions must be an array with at least one step'),

  body('instructions.*')
    .isLength({ min: 1, max: 1000 })
    .withMessage('Each instruction step must be between 1 and 1000 characters')
    .trim(),

  body('ingredients')
    .isArray({ min: 1 })
    .withMessage('Ingredients must be an array with at least one ingredient'),

  body('ingredients.*.name')
    .isLength({ min: 1, max: 255 })
    .withMessage('Ingredient name is required and must be less than 255 characters')
    .trim(),

  body('ingredients.*.quantity')
    .isFloat({ min: 0.01 })
    .withMessage('Ingredient quantity must be a positive number'),

  body('ingredients.*.unit')
    .isLength({ min: 1, max: 50 })
    .withMessage('Ingredient unit is required and must be less than 50 characters')
    .trim(),

  body('ingredients.*.notes')
    .optional()
    .isLength({ max: 255 })
    .withMessage('Ingredient notes must be less than 255 characters')
    .trim(),

  body('categoryIds')
    .optional()
    .isArray()
    .withMessage('Category IDs must be an array'),

  body('categoryIds.*')
    .isInt({ min: 1 })
    .withMessage('Each category ID must be a positive integer'),

  body('isPublic')
    .optional()
    .isBoolean()
    .withMessage('isPublic must be a boolean')
];

// Recipe search/filter validation
const validateRecipeQuery = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),

  query('search')
    .optional()
    .isLength({ max: 255 })
    .withMessage('Search term must be less than 255 characters')
    .trim(),

  query('category')
    .optional()
    .isLength({ max: 100 })
    .withMessage('Category must be less than 100 characters')
    .trim(),

  query('difficulty')
    .optional()
    .isIn(['Easy', 'Medium', 'Hard', 'Expert'])
    .withMessage('Difficulty must be one of: Easy, Medium, Hard, Expert'),

  query('authorId')
    .optional()
    .isLength({ min: 1 })
    .withMessage('Author ID must be a valid string'),

  query('featured')
    .optional()
    .isIn(['true', 'false'])
    .withMessage('Featured must be true or false'),

  query('sort')
    .optional()
    .isIn(['created_at', 'title', 'prep_time_minutes', 'cook_time_minutes', 'difficulty'])
    .withMessage('Sort must be one of: created_at, title, prep_time_minutes, cook_time_minutes, difficulty'),

  query('order')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Order must be asc or desc')
];

module.exports = {
  validateRecipe,
  validateRecipeQuery
};