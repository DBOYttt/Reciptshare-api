const express = require('express');
const { 
  createComment, 
  getRecipeComments, 
  updateComment, 
  deleteComment 
} = require('../controllers/commentController');
const { validateComment, validateCommentQuery } = require('../middleware/commentValidation');
const { authenticateToken, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// Recipe comments
router.post('/recipes/:id/comments', authenticateToken, validateComment, createComment);
router.get('/recipes/:id/comments', optionalAuth, validateCommentQuery, getRecipeComments);
router.put('/comments/:commentId', authenticateToken, validateComment, updateComment);
router.delete('/comments/:commentId', authenticateToken, deleteComment);

module.exports = router;