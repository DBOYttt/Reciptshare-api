const { validationResult } = require('express-validator');
const { pool } = require('../config/database');
const { generateUUID } = require('../config/schema');

// Get user's favorite recipes (liked recipes)
const getFavoriteRecipes = async (req, res) => {
  try {
    const { page = 1, limit = 10, sort = 'liked_at' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const userId = req.user.id;

    const client = await pool.connect();
    try {
      // Validate sort parameter
      const allowedSorts = ['liked_at', 'recipe_created', 'title', 'rating'];
      const sortColumn = allowedSorts.includes(sort) ? sort : 'liked_at';

      let orderBy;
      switch (sortColumn) {
        case 'liked_at':
          orderBy = 'rl.created_at DESC';
          break;
        case 'recipe_created':
          orderBy = 'r.created_at DESC';
          break;
        case 'title':
          orderBy = 'r.title ASC';
          break;
        case 'rating':
          orderBy = '(SELECT AVG(rating) FROM recipe_ratings WHERE recipe_id = r.id) DESC NULLS LAST';
          break;
      }

      // Get liked recipes
      const favoritesResult = await client.query(`
        SELECT 
          r.id, r.title, r.description, r.prep_time_minutes, r.cook_time_minutes,
          r.servings, r.difficulty, r.image_url, r.is_public, r.is_featured,
          r.created_at, r.updated_at,
          u.id as author_id, u.username as author_username, 
          u.first_name as author_first_name, u.last_name as author_last_name,
          u.profile_image_url as author_profile_image,
          rl.created_at as liked_at,
          (SELECT COUNT(*) FROM recipe_likes WHERE recipe_id = r.id) as likes_count,
          (SELECT COUNT(*) FROM recipe_comments WHERE recipe_id = r.id) as comments_count,
          (SELECT AVG(rating)::DECIMAL(3,2) FROM recipe_ratings WHERE recipe_id = r.id) as average_rating,
          (SELECT COUNT(*) FROM recipe_ratings WHERE recipe_id = r.id) as ratings_count
        FROM recipe_likes rl
        JOIN recipes r ON rl.recipe_id = r.id
        JOIN users u ON r.author_id = u.id
        WHERE rl.user_id = $1 AND (r.is_public = true OR r.author_id = $1)
        ORDER BY ${orderBy}
        LIMIT $2 OFFSET $3
      `, [userId, parseInt(limit), offset]);

      // Get total count
      const countResult = await client.query(`
        SELECT COUNT(*) as total
        FROM recipe_likes rl
        JOIN recipes r ON rl.recipe_id = r.id
        WHERE rl.user_id = $1 AND (r.is_public = true OR r.author_id = $1)
      `, [userId]);

      const totalFavorites = parseInt(countResult.rows[0].total);

      // Get categories for each recipe
      const favorites = await Promise.all(favoritesResult.rows.map(async (recipe) => {
        const categoriesResult = await client.query(`
          SELECT c.id, c.name, c.color, c.icon
          FROM categories c
          JOIN recipe_categories rc ON c.id = rc.category_id
          WHERE rc.recipe_id = $1
        `, [recipe.id]);

        return {
          id: recipe.id,
          title: recipe.title,
          description: recipe.description,
          prepTimeMinutes: recipe.prep_time_minutes,
          cookTimeMinutes: recipe.cook_time_minutes,
          totalTimeMinutes: recipe.prep_time_minutes + recipe.cook_time_minutes,
          servings: recipe.servings,
          difficulty: recipe.difficulty,
          imageUrl: recipe.image_url,
          isPublic: recipe.is_public,
          isFeatured: recipe.is_featured,
          createdAt: recipe.created_at,
          updatedAt: recipe.updated_at,
          likedAt: recipe.liked_at,
          author: {
            id: recipe.author_id,
            username: recipe.author_username,
            firstName: recipe.author_first_name,
            lastName: recipe.author_last_name,
            fullName: `${recipe.author_first_name} ${recipe.author_last_name}`.trim(),
            profileImageUrl: recipe.author_profile_image
          },
          categories: categoriesResult.rows,
          stats: {
            likesCount: parseInt(recipe.likes_count),
            commentsCount: parseInt(recipe.comments_count),
            averageRating: recipe.average_rating ? parseFloat(recipe.average_rating) : null,
            ratingsCount: parseInt(recipe.ratings_count)
          },
          isLikedByUser: true
        };
      }));

      const totalPages = Math.ceil(totalFavorites / parseInt(limit));

      res.json({
        favoriteRecipes: favorites,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalFavorites,
          limit: parseInt(limit),
          hasNextPage: parseInt(page) < totalPages,
          hasPrevPage: parseInt(page) > 1
        },
        sort: sortColumn,
        timestamp: new Date().toISOString()
      });

    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ Get favorite recipes error:', error);
    res.status(500).json({
      error: 'Failed to get favorite recipes',
      message: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
};

// Get user's recipe history (recipes they've rated or commented on)
const getRecipeHistory = async (req, res) => {
  try {
    const { page = 1, limit = 10, type = 'all' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const userId = req.user.id;

    const client = await pool.connect();
    try {
      let historyQuery;
      let queryParams;

      if (type === 'rated') {
        historyQuery = `
          SELECT DISTINCT
            r.id, r.title, r.description, r.prep_time_minutes, r.cook_time_minutes,
            r.servings, r.difficulty, r.image_url, r.is_public, r.is_featured,
            r.created_at, r.updated_at,
            u.id as author_id, u.username as author_username, 
            u.first_name as author_first_name, u.last_name as author_last_name,
            u.profile_image_url as author_profile_image,
            rr.rating as user_rating, rr.created_at as interaction_date,
            'rated' as interaction_type,
            (SELECT COUNT(*) FROM recipe_likes WHERE recipe_id = r.id) as likes_count,
            (SELECT COUNT(*) FROM recipe_comments WHERE recipe_id = r.id) as comments_count,
            (SELECT AVG(rating)::DECIMAL(3,2) FROM recipe_ratings WHERE recipe_id = r.id) as average_rating,
            (SELECT COUNT(*) FROM recipe_ratings WHERE recipe_id = r.id) as ratings_count,
            EXISTS(SELECT 1 FROM recipe_likes WHERE recipe_id = r.id AND user_id = $1) as is_liked_by_user
          FROM recipe_ratings rr
          JOIN recipes r ON rr.recipe_id = r.id
          JOIN users u ON r.author_id = u.id
          WHERE rr.user_id = $1 AND (r.is_public = true OR r.author_id = $1)
          ORDER BY rr.created_at DESC
          LIMIT $2 OFFSET $3
        `;
        queryParams = [userId, parseInt(limit), offset];
      } else if (type === 'commented') {
        historyQuery = `
          SELECT DISTINCT
            r.id, r.title, r.description, r.prep_time_minutes, r.cook_time_minutes,
            r.servings, r.difficulty, r.image_url, r.is_public, r.is_featured,
            r.created_at, r.updated_at,
            u.id as author_id, u.username as author_username, 
            u.first_name as author_first_name, u.last_name as author_last_name,
            u.profile_image_url as author_profile_image,
            null as user_rating, MAX(rc.created_at) as interaction_date,
            'commented' as interaction_type,
            (SELECT COUNT(*) FROM recipe_likes WHERE recipe_id = r.id) as likes_count,
            (SELECT COUNT(*) FROM recipe_comments WHERE recipe_id = r.id) as comments_count,
            (SELECT AVG(rating)::DECIMAL(3,2) FROM recipe_ratings WHERE recipe_id = r.id) as average_rating,
            (SELECT COUNT(*) FROM recipe_ratings WHERE recipe_id = r.id) as ratings_count,
            EXISTS(SELECT 1 FROM recipe_likes WHERE recipe_id = r.id AND user_id = $1) as is_liked_by_user
          FROM recipe_comments rc
          JOIN recipes r ON rc.recipe_id = r.id
          JOIN users u ON r.author_id = u.id
          WHERE rc.user_id = $1 AND (r.is_public = true OR r.author_id = $1)
          GROUP BY r.id, u.id
          ORDER BY interaction_date DESC
          LIMIT $2 OFFSET $3
        `;
        queryParams = [userId, parseInt(limit), offset];
      } else {
        // All interactions (rated OR commented)
        historyQuery = `
          (SELECT DISTINCT
            r.id, r.title, r.description, r.prep_time_minutes, r.cook_time_minutes,
            r.servings, r.difficulty, r.image_url, r.is_public, r.is_featured,
            r.created_at, r.updated_at,
            u.id as author_id, u.username as author_username, 
            u.first_name as author_first_name, u.last_name as author_last_name,
            u.profile_image_url as author_profile_image,
            rr.rating as user_rating, rr.created_at as interaction_date,
            'rated' as interaction_type,
            (SELECT COUNT(*) FROM recipe_likes WHERE recipe_id = r.id) as likes_count,
            (SELECT COUNT(*) FROM recipe_comments WHERE recipe_id = r.id) as comments_count,
            (SELECT AVG(rating)::DECIMAL(3,2) FROM recipe_ratings WHERE recipe_id = r.id) as average_rating,
            (SELECT COUNT(*) FROM recipe_ratings WHERE recipe_id = r.id) as ratings_count,
            EXISTS(SELECT 1 FROM recipe_likes WHERE recipe_id = r.id AND user_id = $1) as is_liked_by_user
          FROM recipe_ratings rr
          JOIN recipes r ON rr.recipe_id = r.id
          JOIN users u ON r.author_id = u.id
          WHERE rr.user_id = $1 AND (r.is_public = true OR r.author_id = $1))
          UNION
          (SELECT DISTINCT
            r.id, r.title, r.description, r.prep_time_minutes, r.cook_time_minutes,
            r.servings, r.difficulty, r.image_url, r.is_public, r.is_featured,
            r.created_at, r.updated_at,
            u.id as author_id, u.username as author_username, 
            u.first_name as author_first_name, u.last_name as author_last_name,
            u.profile_image_url as author_profile_image,
            (SELECT rating FROM recipe_ratings WHERE recipe_id = r.id AND user_id = $1) as user_rating,
            MAX(rc.created_at) as interaction_date,
            'commented' as interaction_type,
            (SELECT COUNT(*) FROM recipe_likes WHERE recipe_id = r.id) as likes_count,
            (SELECT COUNT(*) FROM recipe_comments WHERE recipe_id = r.id) as comments_count,
            (SELECT AVG(rating)::DECIMAL(3,2) FROM recipe_ratings WHERE recipe_id = r.id) as average_rating,
            (SELECT COUNT(*) FROM recipe_ratings WHERE recipe_id = r.id) as ratings_count,
            EXISTS(SELECT 1 FROM recipe_likes WHERE recipe_id = r.id AND user_id = $1) as is_liked_by_user
          FROM recipe_comments rc
          JOIN recipes r ON rc.recipe_id = r.id
          JOIN users u ON r.author_id = u.id
          WHERE rc.user_id = $1 AND (r.is_public = true OR r.author_id = $1)
          GROUP BY r.id, u.id)
          ORDER BY interaction_date DESC
          LIMIT $2 OFFSET $3
        `;
        queryParams = [userId, parseInt(limit), offset];
      }

      const historyResult = await client.query(historyQuery, queryParams);

      // Get categories for each recipe
      const history = await Promise.all(historyResult.rows.map(async (recipe) => {
        const categoriesResult = await client.query(`
          SELECT c.id, c.name, c.color, c.icon
          FROM categories c
          JOIN recipe_categories rc ON c.id = rc.category_id
          WHERE rc.recipe_id = $1
        `, [recipe.id]);

        return {
          id: recipe.id,
          title: recipe.title,
          description: recipe.description,
          prepTimeMinutes: recipe.prep_time_minutes,
          cookTimeMinutes: recipe.cook_time_minutes,
          totalTimeMinutes: recipe.prep_time_minutes + recipe.cook_time_minutes,
          servings: recipe.servings,
          difficulty: recipe.difficulty,
          imageUrl: recipe.image_url,
          isPublic: recipe.is_public,
          isFeatured: recipe.is_featured,
          createdAt: recipe.created_at,
          updatedAt: recipe.updated_at,
          interactionDate: recipe.interaction_date,
          interactionType: recipe.interaction_type,
          userRating: recipe.user_rating,
          author: {
            id: recipe.author_id,
            username: recipe.author_username,
            firstName: recipe.author_first_name,
            lastName: recipe.author_last_name,
            fullName: `${recipe.author_first_name} ${recipe.author_last_name}`.trim(),
            profileImageUrl: recipe.author_profile_image
          },
          categories: categoriesResult.rows,
          stats: {
            likesCount: parseInt(recipe.likes_count),
            commentsCount: parseInt(recipe.comments_count),
            averageRating: recipe.average_rating ? parseFloat(recipe.average_rating) : null,
            ratingsCount: parseInt(recipe.ratings_count)
          },
          isLikedByUser: recipe.is_liked_by_user
        };
      }));

      res.json({
        recipeHistory: history,
        pagination: {
          currentPage: parseInt(page),
          limit: parseInt(limit),
          hasNextPage: history.length === parseInt(limit)
        },
        filterType: type,
        timestamp: new Date().toISOString()
      });

    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ Get recipe history error:', error);
    res.status(500).json({
      error: 'Failed to get recipe history',
      message: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
};

module.exports = {
  getFavoriteRecipes,
  getRecipeHistory
};