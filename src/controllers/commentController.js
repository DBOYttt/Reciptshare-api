const { validationResult } = require('express-validator');
const { pool } = require('../config/database');
const { generateUUID } = require('../config/schema');

// Create a comment on a recipe
const createComment = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array(),
        timestamp: new Date().toISOString()
      });
    }

    const { id: recipeId } = req.params;
    const { comment, parentCommentId } = req.body;
    const userId = req.user.id;

    const client = await pool.connect();
    try {
      // Check if recipe exists and is accessible
      const recipeResult = await client.query(`
        SELECT id, title, author_id, is_public 
        FROM recipes 
        WHERE id = $1
      `, [recipeId]);

      if (recipeResult.rows.length === 0) {
        return res.status(404).json({
          error: 'Recipe not found',
          timestamp: new Date().toISOString()
        });
      }

      const recipe = recipeResult.rows[0];

      // Check if user can access this recipe
      if (!recipe.is_public && recipe.author_id !== userId) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'Cannot comment on a private recipe',
          timestamp: new Date().toISOString()
        });
      }

      // If it's a reply, check if parent comment exists
      if (parentCommentId) {
        const parentResult = await client.query(
          'SELECT id, recipe_id FROM recipe_comments WHERE id = $1',
          [parentCommentId]
        );

        if (parentResult.rows.length === 0) {
          return res.status(404).json({
            error: 'Parent comment not found',
            timestamp: new Date().toISOString()
          });
        }

        if (parentResult.rows[0].recipe_id !== recipeId) {
          return res.status(400).json({
            error: 'Parent comment does not belong to this recipe',
            timestamp: new Date().toISOString()
          });
        }
      }

      // Create comment
      const commentId = generateUUID();
      const insertResult = await client.query(`
        INSERT INTO recipe_comments (id, recipe_id, user_id, comment, parent_comment_id)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, comment, parent_comment_id, is_edited, created_at, updated_at
      `, [commentId, recipeId, userId, comment, parentCommentId || null]);

      const newComment = insertResult.rows[0];

      // Get user info for the response
      const userResult = await client.query(
        'SELECT username, first_name, last_name, profile_image_url FROM users WHERE id = $1',
        [userId]
      );

      const user = userResult.rows[0];

      res.status(201).json({
        message: 'Comment created successfully',
        comment: {
          id: newComment.id,
          comment: newComment.comment,
          parentCommentId: newComment.parent_comment_id,
          isEdited: newComment.is_edited,
          createdAt: newComment.created_at,
          updatedAt: newComment.updated_at,
          user: {
            id: userId,
            username: user.username,
            firstName: user.first_name,
            lastName: user.last_name,
            fullName: `${user.first_name} ${user.last_name}`.trim(),
            profileImageUrl: user.profile_image_url
          },
          recipe: {
            id: recipeId,
            title: recipe.title
          },
          replies: []
        },
        timestamp: new Date().toISOString()
      });

    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ Create comment error:', error);
    res.status(500).json({
      error: 'Failed to create comment',
      message: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
};

// Get comments for a recipe
const getRecipeComments = async (req, res) => {
  try {
    const { id: recipeId } = req.params;
    const { page = 1, limit = 20, sort = 'created_at', order = 'desc' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const client = await pool.connect();
    try {
      // Check if recipe exists
      const recipeResult = await client.query(
        'SELECT id, title, is_public FROM recipes WHERE id = $1',
        [recipeId]
      );

      if (recipeResult.rows.length === 0) {
        return res.status(404).json({
          error: 'Recipe not found',
          timestamp: new Date().toISOString()
        });
      }

      // Validate sort parameters
      const allowedSortColumns = ['created_at', 'updated_at'];
      const sortColumn = allowedSortColumns.includes(sort) ? sort : 'created_at';
      const sortOrder = order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

      // Get top-level comments (not replies)
      const commentsResult = await client.query(`
        SELECT 
          c.id, c.comment, c.parent_comment_id, c.is_edited, c.created_at, c.updated_at,
          u.id as user_id, u.username, u.first_name, u.last_name, u.profile_image_url
        FROM recipe_comments c
        JOIN users u ON c.user_id = u.id
        WHERE c.recipe_id = $1 AND c.parent_comment_id IS NULL
        ORDER BY c.${sortColumn} ${sortOrder}
        LIMIT $2 OFFSET $3
      `, [recipeId, parseInt(limit), offset]);

      // Get total count of top-level comments
      const countResult = await client.query(
        'SELECT COUNT(*) as total FROM recipe_comments WHERE recipe_id = $1 AND parent_comment_id IS NULL',
        [recipeId]
      );

      const totalComments = parseInt(countResult.rows[0].total);

      // Get replies for each comment
      const comments = await Promise.all(commentsResult.rows.map(async (comment) => {
        const repliesResult = await client.query(`
          SELECT 
            c.id, c.comment, c.parent_comment_id, c.is_edited, c.created_at, c.updated_at,
            u.id as user_id, u.username, u.first_name, u.last_name, u.profile_image_url
          FROM recipe_comments c
          JOIN users u ON c.user_id = u.id
          WHERE c.parent_comment_id = $1
          ORDER BY c.created_at ASC
        `, [comment.id]);

        return {
          id: comment.id,
          comment: comment.comment,
          parentCommentId: comment.parent_comment_id,
          isEdited: comment.is_edited,
          createdAt: comment.created_at,
          updatedAt: comment.updated_at,
          user: {
            id: comment.user_id,
            username: comment.username,
            firstName: comment.first_name,
            lastName: comment.last_name,
            fullName: `${comment.first_name} ${comment.last_name}`.trim(),
            profileImageUrl: comment.profile_image_url
          },
          replies: repliesResult.rows.map(reply => ({
            id: reply.id,
            comment: reply.comment,
            parentCommentId: reply.parent_comment_id,
            isEdited: reply.is_edited,
            createdAt: reply.created_at,
            updatedAt: reply.updated_at,
            user: {
              id: reply.user_id,
              username: reply.username,
              firstName: reply.first_name,
              lastName: reply.last_name,
              fullName: `${reply.first_name} ${reply.last_name}`.trim(),
              profileImageUrl: reply.profile_image_url
            }
          }))
        };
      }));

      const totalPages = Math.ceil(totalComments / parseInt(limit));

      res.json({
        comments,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalComments,
          limit: parseInt(limit),
          hasNextPage: parseInt(page) < totalPages,
          hasPrevPage: parseInt(page) > 1
        },
        sort: {
          column: sortColumn,
          order: sortOrder.toLowerCase()
        },
        timestamp: new Date().toISOString()
      });

    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ Get recipe comments error:', error);
    res.status(500).json({
      error: 'Failed to get comments',
      message: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
};

// Update a comment
const updateComment = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array(),
        timestamp: new Date().toISOString()
      });
    }

    const { commentId } = req.params;
    const { comment } = req.body;
    const userId = req.user.id;

    const client = await pool.connect();
    try {
      // Check if comment exists and user owns it
      const existingComment = await client.query(`
        SELECT c.id, c.user_id, c.recipe_id, c.comment, r.title as recipe_title
        FROM recipe_comments c
        JOIN recipes r ON c.recipe_id = r.id
        WHERE c.id = $1
      `, [commentId]);

      if (existingComment.rows.length === 0) {
        return res.status(404).json({
          error: 'Comment not found',
          timestamp: new Date().toISOString()
        });
      }

      const commentData = existingComment.rows[0];

      if (commentData.user_id !== userId) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'You can only update your own comments',
          timestamp: new Date().toISOString()
        });
      }

      // Update comment
      const updateResult = await client.query(`
        UPDATE recipe_comments 
        SET comment = $1, is_edited = true, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING id, comment, parent_comment_id, is_edited, created_at, updated_at
      `, [comment, commentId]);

      const updatedComment = updateResult.rows[0];

      // Get user info for the response
      const userResult = await client.query(
        'SELECT username, first_name, last_name, profile_image_url FROM users WHERE id = $1',
        [userId]
      );

      const user = userResult.rows[0];

      res.json({
        message: 'Comment updated successfully',
        comment: {
          id: updatedComment.id,
          comment: updatedComment.comment,
          parentCommentId: updatedComment.parent_comment_id,
          isEdited: updatedComment.is_edited,
          createdAt: updatedComment.created_at,
          updatedAt: updatedComment.updated_at,
          user: {
            id: userId,
            username: user.username,
            firstName: user.first_name,
            lastName: user.last_name,
            fullName: `${user.first_name} ${user.last_name}`.trim(),
            profileImageUrl: user.profile_image_url
          },
          recipe: {
            id: commentData.recipe_id,
            title: commentData.recipe_title
          }
        },
        timestamp: new Date().toISOString()
      });

    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ Update comment error:', error);
    res.status(500).json({
      error: 'Failed to update comment',
      message: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
};

// Delete a comment
const deleteComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.user.id;

    const client = await pool.connect();
    try {
      // Check if comment exists and user owns it (or owns the recipe)
      const commentResult = await client.query(`
        SELECT c.id, c.user_id, c.comment, c.recipe_id, r.author_id as recipe_author_id, r.title as recipe_title
        FROM recipe_comments c
        JOIN recipes r ON c.recipe_id = r.id
        WHERE c.id = $1
      `, [commentId]);

      if (commentResult.rows.length === 0) {
        return res.status(404).json({
          error: 'Comment not found',
          timestamp: new Date().toISOString()
        });
      }

      const commentData = commentResult.rows[0];

      // User can delete their own comment OR recipe author can delete any comment on their recipe
      if (commentData.user_id !== userId && commentData.recipe_author_id !== userId) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'You can only delete your own comments or comments on your recipes',
          timestamp: new Date().toISOString()
        });
      }

      // Delete comment (CASCADE will handle replies)
      await client.query('DELETE FROM recipe_comments WHERE id = $1', [commentId]);

      res.json({
        message: 'Comment deleted successfully',
        deletedComment: {
          id: commentId,
          preview: commentData.comment.substring(0, 50) + (commentData.comment.length > 50 ? '...' : ''),
          recipe: {
            id: commentData.recipe_id,
            title: commentData.recipe_title
          }
        },
        timestamp: new Date().toISOString()
      });

    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ Delete comment error:', error);
    res.status(500).json({
      error: 'Failed to delete comment',
      message: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
};

module.exports = {
  createComment,
  getRecipeComments,
  updateComment,
  deleteComment
};