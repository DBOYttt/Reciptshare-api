const { body } = require('express-validator');

// User registration validation
const validateRegistration = [
  body('username')
    .isLength({ min: 3, max: 50 })
    .withMessage('Username must be between 3 and 50 characters')
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('Username can only contain letters, numbers, underscores, and hyphens')
    .toLowerCase(),
    
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail()
    .isLength({ max: 255 })
    .withMessage('Email must be less than 255 characters'),
    
  body('password')
    .isLength({ min: 8, max: 128 })
    .withMessage('Password must be between 8 and 128 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain at least one lowercase letter, one uppercase letter, one number, and one special character'),
    
  body('firstName')
    .isLength({ min: 1, max: 100 })
    .withMessage('First name is required and must be less than 100 characters')
    .trim()
    .escape(),
    
  body('lastName')
    .optional()
    .isLength({ max: 100 })
    .withMessage('Last name must be less than 100 characters')
    .trim()
    .escape(),
    
  body('bio')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Bio must be less than 500 characters')
    .trim(),
    
  body('profileImageUrl')
    .optional()
    .isURL()
    .withMessage('Profile image must be a valid URL')
];

// User login validation
const validateLogin = [
  body('emailOrUsername')
    .isLength({ min: 1 })
    .withMessage('Email or username is required')
    .trim(),
    
  body('password')
    .isLength({ min: 1 })
    .withMessage('Password is required')
];

// Change password validation
const validateChangePassword = [
  body('currentPassword')
    .isLength({ min: 1 })
    .withMessage('Current password is required'),
    
  body('newPassword')
    .isLength({ min: 8, max: 128 })
    .withMessage('New password must be between 8 and 128 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('New password must contain at least one lowercase letter, one uppercase letter, one number, and one special character'),
    
  body('confirmPassword')
    .custom((value, { req }) => {
      if (value !== req.body.newPassword) {
        throw new Error('Password confirmation does not match new password');
      }
      return true;
    })
];

// Update profile validation
const validateUpdateProfile = [
  body('firstName')
    .optional()
    .isLength({ min: 1, max: 100 })
    .withMessage('First name must be between 1 and 100 characters')
    .trim()
    .escape(),
    
  body('lastName')
    .optional()
    .isLength({ max: 100 })
    .withMessage('Last name must be less than 100 characters')
    .trim()
    .escape(),
    
  body('bio')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Bio must be less than 500 characters')
    .trim(),
    
  body('location')
    .optional()
    .isLength({ max: 255 })
    .withMessage('Location must be less than 255 characters')
    .trim()
    .escape(),
    
  body('website')
    .optional()
    .isURL()
    .withMessage('Website must be a valid URL'),
    
  body('profileImageUrl')
    .optional()
    .isURL()
    .withMessage('Profile image must be a valid URL'),
    
  body('isPublicProfile')
    .optional()
    .isBoolean()
    .withMessage('isPublicProfile must be a boolean'),
    
  body('allowRecipeNotifications')
    .optional()
    .isBoolean()
    .withMessage('allowRecipeNotifications must be a boolean'),
    
  body('allowFollowerNotifications')
    .optional()
    .isBoolean()
    .withMessage('allowFollowerNotifications must be a boolean'),
    
  body('allowCommentNotifications')
    .optional()
    .isBoolean()
    .withMessage('allowCommentNotifications must be a boolean')
];

module.exports = {
  validateRegistration,
  validateLogin,
  validateChangePassword,
  validateUpdateProfile
};