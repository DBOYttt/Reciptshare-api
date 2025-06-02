const { validationResult, body } = require('express-validator');
const { pool } = require('../config/database');
const { generateUUID } = require('../config/schema');

// Like/unlike a recipe
const toggleRecipeLike = async (req, res) => {
  try {
    const { id: recipeId } = req.params;
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
          message: 'Cannot like a private recipe',
          timestamp: new Date().toISOString()
        });
      }

      // Check if already liked
      const existingLike = await client.query(
        'SELECT 1 FROM recipe_likes WHERE recipe_id = $1 AND user_id = $2',
        [recipeId, userId]
      );

      let isLiked;
      let message;

      if (existingLike.rows.length > 0) {
        // Unlike the recipe
        await client.query(
          'DELETE FROM recipe_likes WHERE recipe_id = $1 AND user_id = $2',
          [recipeId, userId]
        );
        isLiked = false;
        message = 'Recipe unliked successfully';
      } else {
        // Like the recipe
        await client.query(
          'INSERT INTO recipe_likes (recipe_id, user_id) VALUES ($1, $2)',
          [recipeId, userId]
        );
        isLiked = true;
        message = 'Recipe liked successfully';
      }

      // Get updated like count
      const likeCountResult = await client.query(
        'SELECT COUNT(*) as count FROM recipe_likes WHERE recipe_id = $1',
        [recipeId]
      );

      const likesCount = parseInt(likeCountResult.rows[0].count);

      res.json({
        message,
        recipe: {
          id: recipeId,
          title: recipe.title
        },
        isLiked,
        likesCount,
        timestamp: new Date().toISOString()
      });

    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ Toggle recipe like error:', error);
    res.status(500).json({
      error: 'Failed to toggle recipe like',
      message: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
};

// Rate a recipe
const rateRecipe = async (req, res) => {
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
    const { rating, review } = req.body;
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
          message: 'Cannot rate a private recipe',
          timestamp: new Date().toISOString()
        });
      }

      // Users cannot rate their own recipes
      if (recipe.author_id === userId) {
        return res.status(400).json({
          error: 'Invalid operation',
          message: 'You cannot rate your own recipe',
          timestamp: new Date().toISOString()
        });
      }

      // Check if user has already rated this recipe
      const existingRating = await client.query(
        'SELECT id FROM recipe_ratings WHERE recipe_id = $1 AND user_id = $2',
        [recipeId, userId]
      );

      let ratingData;
      let message;

      if (existingRating.rows.length > 0) {
        // Update existing rating
        const updateResult = await client.query(`
          UPDATE recipe_ratings 
          SET rating = $1, review = $2, updated_at = CURRENT_TIMESTAMP
          WHERE recipe_id = $3 AND user_id = $4
          RETURNING id, rating, review, created_at, updated_at
        `, [rating, review || null, recipeId, userId]);

        ratingData = updateResult.rows[0];
        message = 'Rating updated successfully';
      } else {
        // Create new rating
        const ratingId = generateUUID();
        const insertResult = await client.query(`
          INSERT INTO recipe_ratings (id, recipe_id, user_id, rating, review)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING id, rating, review, created_at, updated_at
        `, [ratingId, recipeId, userId, rating, review || null]);

        ratingData = insertResult.rows[0];
        message = 'Rating created successfully';
      }

      // Get updated rating statistics
      const statsResult = await client.query(`
        SELECT 
          AVG(rating)::DECIMAL(3,2) as average_rating,
          COUNT(*) as ratings_count
        FROM recipe_ratings 
        WHERE recipe_id = $1
      `, [recipeId]);

      const stats = statsResult.rows[0];

      res.json({
        message,
        rating: {
          id: ratingData.id,
          rating: ratingData.rating,
          review: ratingData.review,
          createdAt: ratingData.created_at,
          updatedAt: ratingData.updated_at
        },
        recipe: {
          id: recipeId,
          title: recipe.title,
          averageRating: stats.average_rating ? parseFloat(stats.average_rating) : null,
          ratingsCount: parseInt(stats.ratings_count)
        },
        timestamp: new Date().toISOString()
      });

    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ Rate recipe error:', error);
    res.status(500).json({
      error: 'Failed to rate recipe',
      message: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
};

// Get recipe ratings
const getRecipeRatings = async (req, res) => {
  try {
    const { id: recipeId } = req.params;
    const { page = 1, limit = 10 } = req.query;
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

      // Get ratings with user info
      const ratingsResult = await client.query(`
        SELECT 
          rr.id, rr.rating, rr.review, rr.created_at, rr.updated_at,
          u.id as user_id, u.username, u.first_name, u.last_name, u.profile_image_url
        FROM recipe_ratings rr
        JOIN users u ON rr.user_id = u.id
        WHERE rr.recipe_id = $1
        ORDER BY rr.created_at DESC
        LIMIT $2 OFFSET $3
      `, [recipeId, parseInt(limit), offset]);

      // Get total count
      const countResult = await client.query(
        'SELECT COUNT(*) as total FROM recipe_ratings WHERE recipe_id = $1',
        [recipeId]
      );

      const totalRatings = parseInt(countResult.rows[0].total);
      const totalPages = Math.ceil(totalRatings / parseInt(limit));

      const ratings = ratingsResult.rows.map(rating => ({
        id: rating.id,
        rating: rating.rating,
        review: rating.review,
        createdAt: rating.created_at,
        updatedAt: rating.updated_at,
        user: {
          id: rating.user_id,
          username: rating.username,
          firstName: rating.first_name,
          lastName: rating.last_name,
          fullName: `${rating.first_name} ${rating.last_name}`.trim(),
          profileImageUrl: rating.profile_image_url
        }
      }));

      res.json({
        ratings,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalRatings,
          limit: parseInt(limit),
          hasNextPage: parseInt(page) < totalPages,
          hasPrevPage: parseInt(page) > 1
        },
        timestamp: new Date().toISOString()
      });

    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ Get recipe ratings error:', error);
    res.status(500).json({
      error: 'Failed to get recipe ratings',
      message: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
};

// Delete user's rating
const deleteRating = async (req, res) => {
  try {
    const { id: recipeId } = req.params;
    const userId = req.user.id;

    const client = await pool.connect();
    try {
      // Check if rating exists
      const ratingResult = await client.query(
        'SELECT id FROM recipe_ratings WHERE recipe_id = $1 AND user_id = $2',
        [recipeId, userId]
      );

      if (ratingResult.rows.length === 0) {
        return res.status(404).json({
          error: 'Rating not found',
          message: 'You have not rated this recipe',
          timestamp: new Date().toISOString()
        });
      }

      // Delete the rating
      await client.query(
        'DELETE FROM recipe_ratings WHERE recipe_id = $1 AND user_id = $2',
        [recipeId, userId]
      );

      res.json({
        message: 'Rating deleted successfully',
        timestamp: new Date().toISOString()
      });

    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ Delete rating error:', error);
    res.status(500).json({
      error: 'Failed to delete rating',
      message: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
};

// Validation for rating
const validateRating = [
  body('rating')
    .isInt({ min: 1, max: 5 })
    .withMessage('Rating must be an integer between 1 and 5'),

  body('review')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Review must be less than 1000 characters')
    .trim()
];

module.exports = {
  toggleRecipeLike,
  rateRecipe,
  getRecipeRatings,
  deleteRating,
  validateRating
};