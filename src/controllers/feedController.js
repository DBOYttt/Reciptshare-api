const { pool } = require('../config/database');

// Get user's personalized feed
const getUserFeed = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const userId = req.user.id;

    const client = await pool.connect();
    try {
      // Get recipes from followed users + user's own recipes
      const feedResult = await client.query(`
        SELECT 
          r.id, r.title, r.description, r.prep_time_minutes, r.cook_time_minutes,
          r.servings, r.difficulty, r.image_url, r.is_public, r.is_featured,
          r.created_at, r.updated_at,
          u.id as author_id, u.username as author_username, 
          u.first_name as author_first_name, u.last_name as author_last_name,
          u.profile_image_url as author_profile_image,
          (SELECT COUNT(*) FROM recipe_likes WHERE recipe_id = r.id) as likes_count,
          (SELECT COUNT(*) FROM recipe_comments WHERE recipe_id = r.id) as comments_count,
          (SELECT AVG(rating)::DECIMAL(3,2) FROM recipe_ratings WHERE recipe_id = r.id) as average_rating,
          (SELECT COUNT(*) FROM recipe_ratings WHERE recipe_id = r.id) as ratings_count,
          EXISTS(SELECT 1 FROM recipe_likes WHERE recipe_id = r.id AND user_id = $1) as is_liked_by_user
        FROM recipes r
        JOIN users u ON r.author_id = u.id
        WHERE r.is_public = true 
          AND (
            r.author_id = $1 
            OR EXISTS (
              SELECT 1 FROM user_followers 
              WHERE follower_id = $1 AND following_id = r.author_id
            )
          )
        ORDER BY r.created_at DESC
        LIMIT $2 OFFSET $3
      `, [userId, parseInt(limit), offset]);

      // Get total count for pagination
      const countResult = await client.query(`
        SELECT COUNT(*) as total
        FROM recipes r
        WHERE r.is_public = true 
          AND (
            r.author_id = $1 
            OR EXISTS (
              SELECT 1 FROM user_followers 
              WHERE follower_id = $1 AND following_id = r.author_id
            )
          )
      `, [userId]);

      const totalRecipes = parseInt(countResult.rows[0].total);

      // Get categories for each recipe
      const recipes = await Promise.all(feedResult.rows.map(async (recipe) => {
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

      const totalPages = Math.ceil(totalRecipes / parseInt(limit));

      res.json({
        feed: recipes,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalRecipes,
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
    console.error('❌ Get user feed error:', error);
    res.status(500).json({
      error: 'Failed to get feed',
      message: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
};

// Get trending recipes (most liked in last 7 days)
const getTrendingRecipes = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const requestingUserId = req.user ? req.user.id : null;

    const client = await pool.connect();
    try {
      let trendingQuery;
      let queryParams;

      if (requestingUserId) {
        trendingQuery = `
          SELECT 
            r.id, r.title, r.description, r.prep_time_minutes, r.cook_time_minutes,
            r.servings, r.difficulty, r.image_url, r.is_public, r.is_featured,
            r.created_at, r.updated_at,
            u.id as author_id, u.username as author_username, 
            u.first_name as author_first_name, u.last_name as author_last_name,
            u.profile_image_url as author_profile_image,
            COUNT(rl.recipe_id) as recent_likes_count,
            (SELECT COUNT(*) FROM recipe_likes WHERE recipe_id = r.id) as total_likes_count,
            (SELECT COUNT(*) FROM recipe_comments WHERE recipe_id = r.id) as comments_count,
            (SELECT AVG(rating)::DECIMAL(3,2) FROM recipe_ratings WHERE recipe_id = r.id) as average_rating,
            (SELECT COUNT(*) FROM recipe_ratings WHERE recipe_id = r.id) as ratings_count,
            EXISTS(SELECT 1 FROM recipe_likes WHERE recipe_id = r.id AND user_id = $3) as is_liked_by_user
          FROM recipes r
          JOIN users u ON r.author_id = u.id
          LEFT JOIN recipe_likes rl ON r.id = rl.recipe_id 
            AND rl.created_at >= CURRENT_DATE - INTERVAL '7 days'
          WHERE r.is_public = true
          GROUP BY r.id, u.id
          HAVING COUNT(rl.recipe_id) > 0
          ORDER BY recent_likes_count DESC, r.created_at DESC
          LIMIT $1 OFFSET $2
        `;
        queryParams = [parseInt(limit), offset, requestingUserId];
      } else {
        trendingQuery = `
          SELECT 
            r.id, r.title, r.description, r.prep_time_minutes, r.cook_time_minutes,
            r.servings, r.difficulty, r.image_url, r.is_public, r.is_featured,
            r.created_at, r.updated_at,
            u.id as author_id, u.username as author_username, 
            u.first_name as author_first_name, u.last_name as author_last_name,
            u.profile_image_url as author_profile_image,
            COUNT(rl.recipe_id) as recent_likes_count,
            (SELECT COUNT(*) FROM recipe_likes WHERE recipe_id = r.id) as total_likes_count,
            (SELECT COUNT(*) FROM recipe_comments WHERE recipe_id = r.id) as comments_count,
            (SELECT AVG(rating)::DECIMAL(3,2) FROM recipe_ratings WHERE recipe_id = r.id) as average_rating,
            (SELECT COUNT(*) FROM recipe_ratings WHERE recipe_id = r.id) as ratings_count,
            false as is_liked_by_user
          FROM recipes r
          JOIN users u ON r.author_id = u.id
          LEFT JOIN recipe_likes rl ON r.id = rl.recipe_id 
            AND rl.created_at >= CURRENT_DATE - INTERVAL '7 days'
          WHERE r.is_public = true
          GROUP BY r.id, u.id
          HAVING COUNT(rl.recipe_id) > 0
          ORDER BY recent_likes_count DESC, r.created_at DESC
          LIMIT $1 OFFSET $2
        `;
        queryParams = [parseInt(limit), offset];
      }

      const trendingResult = await client.query(trendingQuery, queryParams);

      // Get categories for each recipe
      const recipes = await Promise.all(trendingResult.rows.map(async (recipe) => {
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
            likesCount: parseInt(recipe.total_likes_count),
            commentsCount: parseInt(recipe.comments_count),
            averageRating: recipe.average_rating ? parseFloat(recipe.average_rating) : null,
            ratingsCount: parseInt(recipe.ratings_count),
            recentLikesCount: parseInt(recipe.recent_likes_count)
          },
          isLikedByUser: recipe.is_liked_by_user
        };
      }));

      res.json({
        trendingRecipes: recipes,
        totalRecipes: recipes.length,
        period: 'Last 7 days',
        pagination: {
          currentPage: parseInt(page),
          limit: parseInt(limit),
          hasNextPage: recipes.length === parseInt(limit)
        },
        timestamp: new Date().toISOString()
      });

    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ Get trending recipes error:', error);
    res.status(500).json({
      error: 'Failed to get trending recipes',
      message: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
};

// Get user activity feed (likes, comments, follows)
const getUserActivity = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const userId = req.user.id;

    const client = await pool.connect();
    try {
      // Get recent activities (likes, comments, follows)
      const activitiesQuery = `
        (
          SELECT 
            'like' as activity_type,
            rl.created_at,
            r.id as recipe_id,
            r.title as recipe_title,
            r.image_url as recipe_image,
            u.id as user_id,
            u.username,
            u.first_name,
            u.last_name,
            u.profile_image_url,
            null as comment_text
          FROM recipe_likes rl
          JOIN recipes r ON rl.recipe_id = r.id
          JOIN users u ON rl.user_id = u.id
          WHERE r.author_id = $1 AND rl.user_id != $1 AND r.is_public = true
        )
        UNION ALL
        (
          SELECT 
            'comment' as activity_type,
            rc.created_at,
            r.id as recipe_id,
            r.title as recipe_title,
            r.image_url as recipe_image,
            u.id as user_id,
            u.username,
            u.first_name,
            u.last_name,
            u.profile_image_url,
            rc.comment as comment_text
          FROM recipe_comments rc
          JOIN recipes r ON rc.recipe_id = r.id
          JOIN users u ON rc.user_id = u.id
          WHERE r.author_id = $1 AND rc.user_id != $1 AND r.is_public = true
        )
        UNION ALL
        (
          SELECT 
            'follow' as activity_type,
            uf.created_at,
            null as recipe_id,
            null as recipe_title,
            null as recipe_image,
            u.id as user_id,
            u.username,
            u.first_name,
            u.last_name,
            u.profile_image_url,
            null as comment_text
          FROM user_followers uf
          JOIN users u ON uf.follower_id = u.id
          WHERE uf.following_id = $1
        )
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3
      `;

      const activitiesResult = await client.query(activitiesQuery, [userId, parseInt(limit), offset]);

      const activities = activitiesResult.rows.map(activity => {
        const baseActivity = {
          type: activity.activity_type,
          createdAt: activity.created_at,
          user: {
            id: activity.user_id,
            username: activity.username,
            firstName: activity.first_name,
            lastName: activity.last_name,
            fullName: `${activity.first_name} ${activity.last_name}`.trim(),
            profileImageUrl: activity.profile_image_url
          }
        };

        if (activity.activity_type === 'follow') {
          return {
            ...baseActivity,
            message: `${baseActivity.user.fullName} started following you`
          };
        } else {
          return {
            ...baseActivity,
            recipe: {
              id: activity.recipe_id,
              title: activity.recipe_title,
              imageUrl: activity.recipe_image
            },
            message: activity.activity_type === 'like' 
              ? `${baseActivity.user.fullName} liked your recipe "${activity.recipe_title}"`
              : `${baseActivity.user.fullName} commented on your recipe "${activity.recipe_title}"`,
            ...(activity.activity_type === 'comment' && {
              commentText: activity.comment_text
            })
          };
        }
      });

      res.json({
        activities,
        pagination: {
          currentPage: parseInt(page),
          limit: parseInt(limit),
          hasNextPage: activities.length === parseInt(limit)
        },
        timestamp: new Date().toISOString()
      });

    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ Get user activity error:', error);
    res.status(500).json({
      error: 'Failed to get user activity',
      message: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
};

module.exports = {
  getUserFeed,
  getTrendingRecipes,
  getUserActivity
};