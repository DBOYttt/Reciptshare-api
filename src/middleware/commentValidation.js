const { body, query } = require('express-validator');

// Comment creation/update validation
const validateComment = [
  body('comment')
    .isLength({ min: 1, max: 1000 })
    .withMessage('Comment must be between 1 and 1000 characters')
    .trim(),

  body('parentCommentId')
    .optional()
    .isLength({ min: 1 })
    .withMessage('Parent comment ID must be a valid string')
];

// Comment query validation
const validateCommentQuery = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),

  query('sort')
    .optional()
    .isIn(['created_at', 'updated_at'])
    .withMessage('Sort must be one of: created_at, updated_at'),

  query('order')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Order must be asc or desc')
];

// Follow query validation (FIXED - this was missing)
const validateFollowQuery = [
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
  validateComment,
  validateCommentQuery,
  validateFollowQuery
};