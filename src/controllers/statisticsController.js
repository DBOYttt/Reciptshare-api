const { pool } = require('../config/database');

// Get platform statistics
const getPlatformStatistics = async (req, res) => {
  try {
    const client = await pool.connect();
    try {
      // Get overall platform stats
      const statsResult = await client.query(`
        SELECT 
          (SELECT COUNT(*) FROM users WHERE is_active = true) as total_users,
          (SELECT COUNT(*) FROM recipes WHERE is_public = true) as total_recipes,
          (SELECT COUNT(*) FROM categories WHERE is_active = true) as total_categories,
          (SELECT COUNT(*) FROM recipe_likes) as total_likes,
          (SELECT COUNT(*) FROM recipe_comments) as total_comments,
          (SELECT COUNT(*) FROM recipe_ratings) as total_ratings,
          (SELECT COUNT(*) FROM user_followers) as total_follows,
          (SELECT AVG(rating)::DECIMAL(3,2) FROM recipe_ratings) as average_rating
      `);

      const stats = statsResult.rows[0];

      // Get most popular categories
      const categoriesResult = await client.query(`
        SELECT 
          c.id, c.name, c.color, c.icon,
          COUNT(rc.recipe_id) as recipe_count
        FROM categories c
        LEFT JOIN recipe_categories rc ON c.id = rc.category_id
        LEFT JOIN recipes r ON rc.recipe_id = r.id AND r.is_public = true
        WHERE c.is_active = true
        GROUP BY c.id, c.name, c.color, c.icon
        ORDER BY recipe_count DESC
        LIMIT 10
      `);

      // Get recent activity (last 7 days)
      const activityResult = await client.query(`
        SELECT 
          (SELECT COUNT(*) FROM users WHERE created_at >= CURRENT_DATE - INTERVAL '7 days') as new_users_week,
          (SELECT COUNT(*) FROM recipes WHERE created_at >= CURRENT_DATE - INTERVAL '7 days' AND is_public = true) as new_recipes_week,
          (SELECT COUNT(*) FROM recipe_likes WHERE created_at >= CURRENT_DATE - INTERVAL '7 days') as new_likes_week,
          (SELECT COUNT(*) FROM recipe_comments WHERE created_at >= CURRENT_DATE - INTERVAL '7 days') as new_comments_week
      `);

      const activity = activityResult.rows[0];

      res.json({
        platformStats: {
          totalUsers: parseInt(stats.total_users),
          totalRecipes: parseInt(stats.total_recipes),
          totalCategories: parseInt(stats.total_categories),
          totalLikes: parseInt(stats.total_likes),
          totalComments: parseInt(stats.total_comments),
          totalRatings: parseInt(stats.total_ratings),
          totalFollows: parseInt(stats.total_follows),
          averageRating: stats.average_rating ? parseFloat(stats.average_rating) : null
        },
        recentActivity: {
          newUsersThisWeek: parseInt(activity.new_users_week),
          newRecipesThisWeek: parseInt(activity.new_recipes_week),
          newLikesThisWeek: parseInt(activity.new_likes_week),
          newCommentsThisWeek: parseInt(activity.new_comments_week)
        },
        popularCategories: categoriesResult.rows.map(cat => ({
          id: cat.id,
          name: cat.name,
          color: cat.color,
          icon: cat.icon,
          recipeCount: parseInt(cat.recipe_count)
        })),
        timestamp: new Date().toISOString()
      });

    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ Get platform statistics error:', error);
    res.status(500).json({
      error: 'Failed to get platform statistics',
      message: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
};

// Get user's personal statistics
const getUserStatistics = async (req, res) => {
  try {
    const userId = req.user.id;

    const client = await pool.connect();
    try {
      // Get user's recipe stats
      const recipeStatsResult = await client.query(`
        SELECT 
          COUNT(*) as total_recipes,
          COUNT(CASE WHEN is_public = true THEN 1 END) as public_recipes,
          COUNT(CASE WHEN is_public = false THEN 1 END) as private_recipes,
          COUNT(CASE WHEN is_featured = true THEN 1 END) as featured_recipes,
          AVG(prep_time_minutes + cook_time_minutes) as avg_total_time
        FROM recipes
        WHERE author_id = $1
      `, [userId]);

      const recipeStats = recipeStatsResult.rows[0];

      // Get engagement stats
      const engagementResult = await client.query(`
        SELECT 
          (SELECT COUNT(*) FROM recipe_likes rl 
           JOIN recipes r ON rl.recipe_id = r.id 
           WHERE r.author_id = $1) as total_likes_received,
          (SELECT COUNT(*) FROM recipe_comments rc 
           JOIN recipes r ON rc.recipe_id = r.id 
           WHERE r.author_id = $1 AND rc.user_id != $1) as total_comments_received,
          (SELECT COUNT(*) FROM recipe_ratings rr 
           JOIN recipes r ON rr.recipe_id = r.id 
           WHERE r.author_id = $1) as total_ratings_received,
          (SELECT AVG(rating)::DECIMAL(3,2) FROM recipe_ratings rr 
           JOIN recipes r ON rr.recipe_id = r.id 
           WHERE r.author_id = $1) as avg_rating_received,
          (SELECT COUNT(*) FROM user_followers WHERE following_id = $1) as followers_count,
          (SELECT COUNT(*) FROM user_followers WHERE follower_id = $1) as following_count
      `, [userId]);

      const engagement = engagementResult.rows[0];

      // Get user's activity stats
      const activityResult = await client.query(`
        SELECT 
          (SELECT COUNT(*) FROM recipe_likes WHERE user_id = $1) as likes_given,
          (SELECT COUNT(*) FROM recipe_comments WHERE user_id = $1) as comments_made,
          (SELECT COUNT(*) FROM recipe_ratings WHERE user_id = $1) as ratings_given,
          (SELECT COUNT(*) FROM shopping_list_items WHERE user_id = $1) as shopping_list_items
      `, [userId]);

      const activity = activityResult.rows[0];

      // Get most liked recipe
      const topRecipeResult = await client.query(`
        SELECT 
          r.id, r.title, r.image_url,
          COUNT(rl.recipe_id) as likes_count
        FROM recipes r
        LEFT JOIN recipe_likes rl ON r.id = rl.recipe_id
        WHERE r.author_id = $1 AND r.is_public = true
        GROUP BY r.id, r.title, r.image_url
        ORDER BY likes_count DESC
        LIMIT 1
      `, [userId]);

      const topRecipe = topRecipeResult.rows[0] || null;

      // Get category breakdown
      const categoryBreakdownResult = await client.query(`
        SELECT 
          c.id, c.name, c.color, c.icon,
          COUNT(rc.recipe_id) as recipe_count
        FROM categories c
        JOIN recipe_categories rc ON c.id = rc.category_id
        JOIN recipes r ON rc.recipe_id = r.id
        WHERE r.author_id = $1
        GROUP BY c.id, c.name, c.color, c.icon
        ORDER BY recipe_count DESC
        LIMIT 5
      `, [userId]);

      res.json({
        recipeStats: {
          totalRecipes: parseInt(recipeStats.total_recipes),
          publicRecipes: parseInt(recipeStats.public_recipes),
          privateRecipes: parseInt(recipeStats.private_recipes),
          featuredRecipes: parseInt(recipeStats.featured_recipes),
          averageTotalTime: recipeStats.avg_total_time ? Math.round(parseFloat(recipeStats.avg_total_time)) : null
        },
        engagementStats: {
          likesReceived: parseInt(engagement.total_likes_received),
          commentsReceived: parseInt(engagement.total_comments_received),
          ratingsReceived: parseInt(engagement.total_ratings_received),
          averageRating: engagement.avg_rating_received ? parseFloat(engagement.avg_rating_received) : null,
          followersCount: parseInt(engagement.followers_count),
          followingCount: parseInt(engagement.following_count)
        },
        activityStats: {
          likesGiven: parseInt(activity.likes_given),
          commentsMade: parseInt(activity.comments_made),
          ratingsGiven: parseInt(activity.ratings_given),
          shoppingListItems: parseInt(activity.shopping_list_items)
        },
        topRecipe: topRecipe ? {
          id: topRecipe.id,
          title: topRecipe.title,
          imageUrl: topRecipe.image_url,
          likesCount: parseInt(topRecipe.likes_count)
        } : null,
        categoryBreakdown: categoryBreakdownResult.rows.map(cat => ({
          id: cat.id,
          name: cat.name,
          color: cat.color,
          icon: cat.icon,
          recipeCount: parseInt(cat.recipe_count)
        })),
        timestamp: new Date().toISOString()
      });

    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ Get user statistics error:', error);
    res.status(500).json({
      error: 'Failed to get user statistics',
      message: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
};

module.exports = {
  getPlatformStatistics,
  getUserStatistics
};