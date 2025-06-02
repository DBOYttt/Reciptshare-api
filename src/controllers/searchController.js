const { pool } = require('../config/database');

// Global search across recipes and users - FIXED
const globalSearch = async (req, res) => {
  try {
    const { q: query, type = 'all', page = 1, limit = 10 } = req.query;
    
    if (!query || query.trim().length < 2) {
      return res.status(400).json({
        error: 'Search query must be at least 2 characters long',
        timestamp: new Date().toISOString()
      });
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const searchTerm = `%${query.trim()}%`;
    const requestingUserId = req.user ? req.user.id : null;

    const client = await pool.connect();
    try {
      const results = {
        query: query.trim(),
        type,
        results: {},
        pagination: {
          currentPage: parseInt(page),
          limit: parseInt(limit)
        },
        timestamp: new Date().toISOString()
      };

      // Search recipes
      if (type === 'all' || type === 'recipes') {
        let recipeQuery;
        let recipeParams;

        if (requestingUserId) {
          recipeQuery = `
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
              EXISTS(SELECT 1 FROM recipe_likes WHERE recipe_id = r.id AND user_id = $3) as is_liked_by_user
            FROM recipes r
            JOIN users u ON r.author_id = u.id
            WHERE (r.is_public = true OR r.author_id = $3)
              AND (r.title ILIKE $1 OR r.description ILIKE $1)
            ORDER BY 
              CASE WHEN r.title ILIKE $1 THEN 1 ELSE 2 END,
              r.created_at DESC
            LIMIT $2 OFFSET $4
          `;
          recipeParams = [searchTerm, parseInt(limit), requestingUserId, offset];
        } else {
          recipeQuery = `
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
              false as is_liked_by_user
            FROM recipes r
            JOIN users u ON r.author_id = u.id
            WHERE r.is_public = true
              AND (r.title ILIKE $1 OR r.description ILIKE $1)
            ORDER BY 
              CASE WHEN r.title ILIKE $1 THEN 1 ELSE 2 END,
              r.created_at DESC
            LIMIT $2 OFFSET $3
          `;
          recipeParams = [searchTerm, parseInt(limit), offset];
        }

        const recipesResult = await client.query(recipeQuery, recipeParams);

        const recipes = await Promise.all(recipesResult.rows.map(async (recipe) => {
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

        results.results.recipes = recipes;
      }

      // Search users
      if (type === 'all' || type === 'users') {
        let usersQuery;
        let usersParams;

        if (requestingUserId) {
          usersQuery = `
            SELECT 
              u.id, u.username, u.first_name, u.last_name, u.bio, 
              u.profile_image_url, u.is_verified, u.created_at,
              (SELECT COUNT(*) FROM recipes WHERE author_id = u.id AND is_public = true) as recipe_count,
              (SELECT COUNT(*) FROM user_followers WHERE following_id = u.id) as followers_count,
              EXISTS(SELECT 1 FROM user_followers WHERE follower_id = $3 AND following_id = u.id) as is_following
            FROM users u
            WHERE u.is_active = true 
              AND u.is_public_profile = true
              AND (u.username ILIKE $1 OR u.first_name ILIKE $1 OR u.last_name ILIKE $1)
            ORDER BY 
              CASE WHEN u.username ILIKE $1 THEN 1 ELSE 2 END,
              (SELECT COUNT(*) FROM user_followers WHERE following_id = u.id) DESC
            LIMIT $2 OFFSET $4
          `;
          usersParams = [searchTerm, parseInt(limit), requestingUserId, offset];
        } else {
          usersQuery = `
            SELECT 
              u.id, u.username, u.first_name, u.last_name, u.bio, 
              u.profile_image_url, u.is_verified, u.created_at,
              (SELECT COUNT(*) FROM recipes WHERE author_id = u.id AND is_public = true) as recipe_count,
              (SELECT COUNT(*) FROM user_followers WHERE following_id = u.id) as followers_count,
              false as is_following
            FROM users u
            WHERE u.is_active = true 
              AND u.is_public_profile = true
              AND (u.username ILIKE $1 OR u.first_name ILIKE $1 OR u.last_name ILIKE $1)
            ORDER BY 
              CASE WHEN u.username ILIKE $1 THEN 1 ELSE 2 END,
              (SELECT COUNT(*) FROM user_followers WHERE following_id = u.id) DESC
            LIMIT $2 OFFSET $3
          `;
          usersParams = [searchTerm, parseInt(limit), offset];
        }

        const usersResult = await client.query(usersQuery, usersParams);

        const users = usersResult.rows.map(user => ({
          id: user.id,
          username: user.username,
          firstName: user.first_name,
          lastName: user.last_name,
          fullName: `${user.first_name} ${user.last_name}`.trim(),
          bio: user.bio,
          profileImageUrl: user.profile_image_url,
          isVerified: user.is_verified,
          createdAt: user.created_at,
          stats: {
            recipeCount: parseInt(user.recipe_count),
            followersCount: parseInt(user.followers_count)
          },
          isFollowing: user.is_following
        }));

        results.results.users = users;
      }

      // Search ingredients (for recipe suggestions)
      if (type === 'all' || type === 'ingredients') {
        const ingredientsResult = await client.query(`
          SELECT DISTINCT 
            ri.name as ingredient_name,
            COUNT(*) as recipe_count
          FROM recipe_ingredients ri
          JOIN recipes r ON ri.recipe_id = r.id
          WHERE r.is_public = true AND ri.name ILIKE $1
          GROUP BY ri.name
          ORDER BY recipe_count DESC, ri.name
          LIMIT $2
        `, [searchTerm, parseInt(limit)]);

        const ingredients = ingredientsResult.rows.map(ingredient => ({
          name: ingredient.ingredient_name,
          recipeCount: parseInt(ingredient.recipe_count)
        }));

        results.results.ingredients = ingredients;
      }

      res.json(results);

    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ Global search error:', error);
    res.status(500).json({
      error: 'Search failed',
      message: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
};

// Recipe search with advanced filters (this one was working, keeping it)
const searchRecipes = async (req, res) => {
  try {
    const {
      q: query = '',
      ingredients = '',
      categories = '',
      difficulty = '',
      maxPrepTime = '',
      maxCookTime = '',
      minRating = '',
      page = 1,
      limit = 10,
      sort = 'relevance'
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const requestingUserId = req.user ? req.user.id : null;

    const client = await pool.connect();
    try {
      // Build WHERE conditions
      const conditions = [];
      const values = [];
      let paramCount = 1;

      // Base condition for public recipes or user's own recipes
      if (requestingUserId) {
        conditions.push(`(r.is_public = true OR r.author_id = $${paramCount})`);
        values.push(requestingUserId);
        paramCount++;
      } else {
        conditions.push('r.is_public = true');
      }

      // Text search
      if (query.trim()) {
        conditions.push(`(r.title ILIKE $${paramCount} OR r.description ILIKE $${paramCount})`);
        values.push(`%${query.trim()}%`);
        paramCount++;
      }

      // Ingredient search
      if (ingredients.trim()) {
        const ingredientList = ingredients.split(',').map(ing => ing.trim());
        conditions.push(`EXISTS (
          SELECT 1 FROM recipe_ingredients ri 
          WHERE ri.recipe_id = r.id 
          AND (${ingredientList.map((_, i) => `ri.name ILIKE $${paramCount + i}`).join(' OR ')})
        )`);
        ingredientList.forEach(ingredient => {
          values.push(`%${ingredient}%`);
          paramCount++;
        });
      }

      // Category filter
      if (categories.trim()) {
        const categoryList = categories.split(',').map(cat => cat.trim());
        conditions.push(`EXISTS (
          SELECT 1 FROM recipe_categories rc 
          JOIN categories c ON rc.category_id = c.id 
          WHERE rc.recipe_id = r.id 
          AND c.name IN (${categoryList.map((_, i) => `$${paramCount + i}`).join(', ')})
        )`);
        categoryList.forEach(category => {
          values.push(category);
          paramCount++;
        });
      }

      // Difficulty filter
      if (difficulty.trim()) {
        conditions.push(`r.difficulty = $${paramCount}`);
        values.push(difficulty);
        paramCount++;
      }

      // Time filters
      if (maxPrepTime) {
        conditions.push(`r.prep_time_minutes <= $${paramCount}`);
        values.push(parseInt(maxPrepTime));
        paramCount++;
      }

      if (maxCookTime) {
        conditions.push(`r.cook_time_minutes <= $${paramCount}`);
        values.push(parseInt(maxCookTime));
        paramCount++;
      }

      // Rating filter
      if (minRating) {
        conditions.push(`(
          SELECT AVG(rating) FROM recipe_ratings 
          WHERE recipe_id = r.id
        ) >= $${paramCount}`);
        values.push(parseFloat(minRating));
        paramCount++;
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // Build ORDER BY clause
      let orderBy;
      switch (sort) {
        case 'newest':
          orderBy = 'r.created_at DESC';
          break;
        case 'oldest':
          orderBy = 'r.created_at ASC';
          break;
        case 'popular':
          orderBy = '(SELECT COUNT(*) FROM recipe_likes WHERE recipe_id = r.id) DESC';
          break;
        case 'rating':
          orderBy = '(SELECT AVG(rating) FROM recipe_ratings WHERE recipe_id = r.id) DESC NULLS LAST';
          break;
        case 'prep_time':
          orderBy = 'r.prep_time_minutes ASC';
          break;
        case 'cook_time':
          orderBy = 'r.cook_time_minutes ASC';
          break;
        case 'total_time':
          orderBy = '(r.prep_time_minutes + r.cook_time_minutes) ASC';
          break;
        default: // relevance
          if (query.trim()) {
            orderBy = `
              CASE WHEN r.title ILIKE $${paramCount} THEN 1 ELSE 2 END,
              r.created_at DESC
            `;
            values.push(`%${query.trim()}%`);
            paramCount++;
          } else {
            orderBy = 'r.created_at DESC';
          }
      }

      // Get recipes
      let searchQuery;
      if (requestingUserId) {
        searchQuery = `
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
          ${whereClause}
          ORDER BY ${orderBy}
          LIMIT $${paramCount} OFFSET $${paramCount + 1}
        `;
        values.push(parseInt(limit), offset);
      } else {
        searchQuery = `
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
            false as is_liked_by_user
          FROM recipes r
          JOIN users u ON r.author_id = u.id
          ${whereClause}
          ORDER BY ${orderBy}
          LIMIT $${paramCount} OFFSET $${paramCount + 1}
        `;
        values.push(parseInt(limit), offset);
      }

      const recipesResult = await client.query(searchQuery, values);

      // Get categories for each recipe
      const recipes = await Promise.all(recipesResult.rows.map(async (recipe) => {
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

      res.json({
        recipes,
        searchParams: {
          query: query.trim(),
          ingredients: ingredients.trim(),
          categories: categories.trim(),
          difficulty: difficulty.trim(),
          maxPrepTime: maxPrepTime ? parseInt(maxPrepTime) : null,
          maxCookTime: maxCookTime ? parseInt(maxCookTime) : null,
          minRating: minRating ? parseFloat(minRating) : null,
          sort
        },
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
    console.error('❌ Advanced recipe search error:', error);
    res.status(500).json({
      error: 'Recipe search failed',
      message: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
};

module.exports = {
  globalSearch,
  searchRecipes
};