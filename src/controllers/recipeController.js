const { validationResult } = require('express-validator');
const { pool } = require('../config/database');
const { generateUUID } = require('../config/schema');

// Create a new recipe
const createRecipe = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array(),
        timestamp: new Date().toISOString()
      });
    }

    const {
      title,
      description,
      prepTimeMinutes,
      cookTimeMinutes,
      servings,
      difficulty,
      imageUrl,
      instructions,
      ingredients,
      categoryIds,
      isPublic = true
    } = req.body;

    const authorId = req.user.id;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Create recipe
      const recipeId = generateUUID();
      const recipeResult = await client.query(`
        INSERT INTO recipes (
          id, title, description, author_id, prep_time_minutes, cook_time_minutes,
          servings, difficulty, image_url, instructions, is_public
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
      `, [
        recipeId,
        title,
        description,
        authorId,
        prepTimeMinutes,
        cookTimeMinutes,
        servings,
        difficulty,
        imageUrl || null,
        instructions,
        isPublic
      ]);

      const recipe = recipeResult.rows[0];

      // Add ingredients
      if (ingredients && ingredients.length > 0) {
        for (let i = 0; i < ingredients.length; i++) {
          const ingredient = ingredients[i];
          const ingredientId = generateUUID();
          
          await client.query(`
            INSERT INTO recipe_ingredients (
              id, recipe_id, name, quantity, unit, notes, order_index
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          `, [
            ingredientId,
            recipeId,
            ingredient.name,
            ingredient.quantity,
            ingredient.unit,
            ingredient.notes || null,
            i + 1
          ]);
        }
      }

      // Add categories
      if (categoryIds && categoryIds.length > 0) {
        for (const categoryId of categoryIds) {
          await client.query(`
            INSERT INTO recipe_categories (recipe_id, category_id)
            VALUES ($1, $2)
            ON CONFLICT DO NOTHING
          `, [recipeId, categoryId]);
        }
      }

      await client.query('COMMIT');

      // Get complete recipe with ingredients and categories
      const completeRecipe = await getCompleteRecipeById(client, recipeId, authorId);

      res.status(201).json({
        message: 'Recipe created successfully',
        recipe: completeRecipe,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ Create recipe error:', error);
    res.status(500).json({
      error: 'Failed to create recipe',
      message: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
};

// Get all recipes with filtering and pagination
const getRecipes = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = '',
      category = '',
      difficulty = '',
      authorId = '',
      featured = '',
      sort = 'created_at',
      order = 'desc'
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const requestingUserId = req.user ? req.user.id : null;

    const client = await pool.connect();
    try {
      // Build WHERE clause
      const conditions = [];
      const values = [];
      let paramCount = 1;

      // Always include public recipes or user's own recipes
      if (requestingUserId) {
        conditions.push(`(r.is_public = true OR r.author_id = $${paramCount})`);
        values.push(requestingUserId);
        paramCount++;
      } else {
        conditions.push('r.is_public = true');
      }

      if (search) {
        conditions.push(`(r.title ILIKE $${paramCount} OR r.description ILIKE $${paramCount})`);
        values.push(`%${search}%`);
        paramCount++;
      }

      if (category) {
        conditions.push(`EXISTS (
          SELECT 1 FROM recipe_categories rc 
          JOIN categories c ON rc.category_id = c.id 
          WHERE rc.recipe_id = r.id AND c.name ILIKE $${paramCount}
        )`);
        values.push(`%${category}%`);
        paramCount++;
      }

      if (difficulty) {
        conditions.push(`r.difficulty = $${paramCount}`);
        values.push(difficulty);
        paramCount++;
      }

      if (authorId) {
        conditions.push(`r.author_id = $${paramCount}`);
        values.push(authorId);
        paramCount++;
      }

      if (featured === 'true') {
        conditions.push('r.is_featured = true');
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // Validate sort column
      const allowedSortColumns = ['created_at', 'title', 'prep_time_minutes', 'cook_time_minutes', 'difficulty'];
      const sortColumn = allowedSortColumns.includes(sort) ? sort : 'created_at';
      const sortOrder = order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

      // Get total count
      const countQuery = `
        SELECT COUNT(*) as total
        FROM recipes r
        JOIN users u ON r.author_id = u.id
        ${whereClause}
      `;

      const countResult = await client.query(countQuery, values);
      const totalRecipes = parseInt(countResult.rows[0].total);

      // Get recipes - handle null requestingUserId properly
      let recipesQuery;
      let recipesValues;

      if (requestingUserId) {
        recipesQuery = `
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
            EXISTS(SELECT 1 FROM recipe_likes WHERE recipe_id = r.id AND user_id = $${paramCount}) as is_liked_by_user
          FROM recipes r
          JOIN users u ON r.author_id = u.id
          ${whereClause}
          ORDER BY r.${sortColumn} ${sortOrder}
          LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
        `;
        recipesValues = [...values, requestingUserId, parseInt(limit), offset];
      } else {
        recipesQuery = `
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
          ORDER BY r.${sortColumn} ${sortOrder}
          LIMIT $${paramCount} OFFSET $${paramCount + 1}
        `;
        recipesValues = [...values, parseInt(limit), offset];
      }

      const recipesResult = await client.query(recipesQuery, recipesValues);

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

      const totalPages = Math.ceil(totalRecipes / parseInt(limit));

      res.json({
        recipes,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalRecipes,
          limit: parseInt(limit),
          hasNextPage: parseInt(page) < totalPages,
          hasPrevPage: parseInt(page) > 1
        },
        filters: {
          search,
          category,
          difficulty,
          authorId,
          featured,
          sort: sortColumn,
          order: sortOrder.toLowerCase()
        },
        timestamp: new Date().toISOString()
      });

    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ Get recipes error:', error);
    res.status(500).json({
      error: 'Failed to get recipes',
      message: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
};

// Get single recipe by ID
const getRecipeById = async (req, res) => {
  try {
    const { id } = req.params;
    const requestingUserId = req.user ? req.user.id : null;

    const client = await pool.connect();
    try {
      const recipe = await getCompleteRecipeById(client, id, requestingUserId);

      if (!recipe) {
        return res.status(404).json({
          error: 'Recipe not found',
          timestamp: new Date().toISOString()
        });
      }

      // Check if user can access this recipe
      if (!recipe.isPublic && recipe.author.id !== requestingUserId) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'This recipe is private',
          timestamp: new Date().toISOString()
        });
      }

      res.json({
        recipe,
        timestamp: new Date().toISOString()
      });

    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ Get recipe by ID error:', error);
    res.status(500).json({
      error: 'Failed to get recipe',
      message: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
};

// Helper function to get complete recipe with all relations - FIXED
const getCompleteRecipeById = async (client, recipeId, requestingUserId = null) => {
  try {
    // Handle null requestingUserId properly with separate queries
    let recipeQuery;
    let queryParams;

    if (requestingUserId) {
      recipeQuery = `
        SELECT 
          r.id, r.title, r.description, r.prep_time_minutes, r.cook_time_minutes,
          r.servings, r.difficulty, r.image_url, r.instructions, r.is_public, r.is_featured,
          r.created_at, r.updated_at,
          u.id as author_id, u.username as author_username, 
          u.first_name as author_first_name, u.last_name as author_last_name,
          u.profile_image_url as author_profile_image,
          (SELECT COUNT(*) FROM recipe_likes WHERE recipe_id = r.id) as likes_count,
          (SELECT COUNT(*) FROM recipe_comments WHERE recipe_id = r.id) as comments_count,
          (SELECT AVG(rating)::DECIMAL(3,2) FROM recipe_ratings WHERE recipe_id = r.id) as average_rating,
          (SELECT COUNT(*) FROM recipe_ratings WHERE recipe_id = r.id) as ratings_count,
          EXISTS(SELECT 1 FROM recipe_likes WHERE recipe_id = r.id AND user_id = $2) as is_liked_by_user,
          (SELECT rating FROM recipe_ratings WHERE recipe_id = r.id AND user_id = $2) as user_rating
        FROM recipes r
        JOIN users u ON r.author_id = u.id
        WHERE r.id = $1
      `;
      queryParams = [recipeId, requestingUserId];
    } else {
      recipeQuery = `
        SELECT 
          r.id, r.title, r.description, r.prep_time_minutes, r.cook_time_minutes,
          r.servings, r.difficulty, r.image_url, r.instructions, r.is_public, r.is_featured,
          r.created_at, r.updated_at,
          u.id as author_id, u.username as author_username, 
          u.first_name as author_first_name, u.last_name as author_last_name,
          u.profile_image_url as author_profile_image,
          (SELECT COUNT(*) FROM recipe_likes WHERE recipe_id = r.id) as likes_count,
          (SELECT COUNT(*) FROM recipe_comments WHERE recipe_id = r.id) as comments_count,
          (SELECT AVG(rating)::DECIMAL(3,2) FROM recipe_ratings WHERE recipe_id = r.id) as average_rating,
          (SELECT COUNT(*) FROM recipe_ratings WHERE recipe_id = r.id) as ratings_count,
          false as is_liked_by_user,
          null as user_rating
        FROM recipes r
        JOIN users u ON r.author_id = u.id
        WHERE r.id = $1
      `;
      queryParams = [recipeId];
    }

    const recipeResult = await client.query(recipeQuery, queryParams);

    if (recipeResult.rows.length === 0) {
      return null;
    }

    const recipe = recipeResult.rows[0];

    // Get ingredients
    const ingredientsResult = await client.query(`
      SELECT id, name, quantity, unit, notes, order_index
      FROM recipe_ingredients
      WHERE recipe_id = $1
      ORDER BY order_index
    `, [recipeId]);

    // Get categories
    const categoriesResult = await client.query(`
      SELECT c.id, c.name, c.description, c.color, c.icon
      FROM categories c
      JOIN recipe_categories rc ON c.id = rc.category_id
      WHERE rc.recipe_id = $1
    `, [recipeId]);

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
      instructions: recipe.instructions,
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
      ingredients: ingredientsResult.rows.map(ingredient => ({
        id: ingredient.id,
        name: ingredient.name,
        quantity: parseFloat(ingredient.quantity),
        unit: ingredient.unit,
        notes: ingredient.notes,
        orderIndex: ingredient.order_index
      })),
      categories: categoriesResult.rows,
      stats: {
        likesCount: parseInt(recipe.likes_count),
        commentsCount: parseInt(recipe.comments_count),
        averageRating: recipe.average_rating ? parseFloat(recipe.average_rating) : null,
        ratingsCount: parseInt(recipe.ratings_count)
      },
      isLikedByUser: recipe.is_liked_by_user,
      userRating: recipe.user_rating
    };
  } catch (error) {
    console.error('❌ Get complete recipe error:', error);
    throw error;
  }
};

// Update recipe
const updateRecipe = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array(),
        timestamp: new Date().toISOString()
      });
    }

    const { id } = req.params;
    const userId = req.user.id;

    const client = await pool.connect();
    try {
      // Check if recipe exists and user owns it
      const existingRecipe = await client.query(
        'SELECT author_id FROM recipes WHERE id = $1',
        [id]
      );

      if (existingRecipe.rows.length === 0) {
        return res.status(404).json({
          error: 'Recipe not found',
          timestamp: new Date().toISOString()
        });
      }

      if (existingRecipe.rows[0].author_id !== userId) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'You can only update your own recipes',
          timestamp: new Date().toISOString()
        });
      }

      await client.query('BEGIN');

      const {
        title,
        description,
        prepTimeMinutes,
        cookTimeMinutes,
        servings,
        difficulty,
        imageUrl,
        instructions,
        ingredients,
        categoryIds,
        isPublic
      } = req.body;

      // Update recipe
      const updateQuery = `
        UPDATE recipes 
        SET title = $1, description = $2, prep_time_minutes = $3, cook_time_minutes = $4,
            servings = $5, difficulty = $6, image_url = $7, instructions = $8, 
            is_public = $9, updated_at = CURRENT_TIMESTAMP
        WHERE id = $10
      `;

      await client.query(updateQuery, [
        title,
        description,
        prepTimeMinutes,
        cookTimeMinutes,
        servings,
        difficulty,
        imageUrl || null,
        instructions,
        isPublic,
        id
      ]);

      // Update ingredients if provided
      if (ingredients !== undefined) {
        // Delete existing ingredients
        await client.query('DELETE FROM recipe_ingredients WHERE recipe_id = $1', [id]);

        // Add new ingredients
        if (ingredients && ingredients.length > 0) {
          for (let i = 0; i < ingredients.length; i++) {
            const ingredient = ingredients[i];
            const ingredientId = generateUUID();
            
            await client.query(`
              INSERT INTO recipe_ingredients (
                id, recipe_id, name, quantity, unit, notes, order_index
              ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            `, [
              ingredientId,
              id,
              ingredient.name,
              ingredient.quantity,
              ingredient.unit,
              ingredient.notes || null,
              i + 1
            ]);
          }
        }
      }

      // Update categories if provided
      if (categoryIds !== undefined) {
        // Delete existing categories
        await client.query('DELETE FROM recipe_categories WHERE recipe_id = $1', [id]);

        // Add new categories
        if (categoryIds && categoryIds.length > 0) {
          for (const categoryId of categoryIds) {
            await client.query(`
              INSERT INTO recipe_categories (recipe_id, category_id)
              VALUES ($1, $2)
              ON CONFLICT DO NOTHING
            `, [id, categoryId]);
          }
        }
      }

      await client.query('COMMIT');

      // Get updated recipe
      const updatedRecipe = await getCompleteRecipeById(client, id, userId);

      res.json({
        message: 'Recipe updated successfully',
        recipe: updatedRecipe,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ Update recipe error:', error);
    res.status(500).json({
      error: 'Failed to update recipe',
      message: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
};

// Delete recipe
const deleteRecipe = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const client = await pool.connect();
    try {
      // Check if recipe exists and user owns it
      const existingRecipe = await client.query(
        'SELECT author_id, title FROM recipes WHERE id = $1',
        [id]
      );

      if (existingRecipe.rows.length === 0) {
        return res.status(404).json({
          error: 'Recipe not found',
          timestamp: new Date().toISOString()
        });
      }

      if (existingRecipe.rows[0].author_id !== userId) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'You can only delete your own recipes',
          timestamp: new Date().toISOString()
        });
      }

      // Delete recipe (CASCADE will handle related records)
      await client.query('DELETE FROM recipes WHERE id = $1', [id]);

      res.json({
        message: 'Recipe deleted successfully',
        deletedRecipe: {
          id,
          title: existingRecipe.rows[0].title
        },
        timestamp: new Date().toISOString()
      });

    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ Delete recipe error:', error);
    res.status(500).json({
      error: 'Failed to delete recipe',
      message: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
};

module.exports = {
  createRecipe,
  getRecipes,
  getRecipeById,
  updateRecipe,
  deleteRecipe
};