const { validationResult } = require('express-validator');
const { pool } = require('../config/database');
const { generateUUID } = require('../config/schema');

// Get user's shopping list
const getShoppingList = async (req, res) => {
  try {
    const { page = 1, limit = 50, completed = 'all' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const userId = req.user.id;

    const client = await pool.connect();
    try {
      // Build WHERE clause based on completed filter
      let whereClause = 'WHERE sli.user_id = $1';
      const values = [userId];
      let paramCount = 2;

      if (completed === 'true') {
        whereClause += ` AND sli.is_completed = true`;
      } else if (completed === 'false') {
        whereClause += ` AND sli.is_completed = false`;
      }

      // Get shopping list items
      const itemsResult = await client.query(`
        SELECT 
          sli.id, sli.ingredient_name, sli.quantity, sli.unit, sli.notes,
          sli.is_completed, sli.created_at, sli.updated_at,
          r.id as recipe_id, r.title as recipe_title, r.image_url as recipe_image
        FROM shopping_list_items sli
        LEFT JOIN recipes r ON sli.recipe_id = r.id
        ${whereClause}
        ORDER BY sli.is_completed ASC, sli.created_at DESC
        LIMIT $${paramCount} OFFSET $${paramCount + 1}
      `, [...values, parseInt(limit), offset]);

      // Get total count
      const countResult = await client.query(`
        SELECT COUNT(*) as total
        FROM shopping_list_items sli
        ${whereClause}
      `, values);

      const totalItems = parseInt(countResult.rows[0].total);
      const totalPages = Math.ceil(totalItems / parseInt(limit));

      // Get summary statistics
      const statsResult = await client.query(`
        SELECT 
          COUNT(*) as total_items,
          COUNT(CASE WHEN is_completed = true THEN 1 END) as completed_items,
          COUNT(CASE WHEN is_completed = false THEN 1 END) as pending_items,
          COUNT(DISTINCT recipe_id) FILTER (WHERE recipe_id IS NOT NULL) as recipes_count
        FROM shopping_list_items
        WHERE user_id = $1
      `, [userId]);

      const stats = statsResult.rows[0];

      const items = itemsResult.rows.map(item => ({
        id: item.id,
        ingredientName: item.ingredient_name,
        quantity: item.quantity ? parseFloat(item.quantity) : null,
        unit: item.unit,
        notes: item.notes,
        isCompleted: item.is_completed,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
        recipe: item.recipe_id ? {
          id: item.recipe_id,
          title: item.recipe_title,
          imageUrl: item.recipe_image
        } : null
      }));

      res.json({
        items,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalItems,
          limit: parseInt(limit),
          hasNextPage: parseInt(page) < totalPages,
          hasPrevPage: parseInt(page) > 1
        },
        stats: {
          totalItems: parseInt(stats.total_items),
          completedItems: parseInt(stats.completed_items),
          pendingItems: parseInt(stats.pending_items),
          recipesCount: parseInt(stats.recipes_count),
          completionRate: stats.total_items > 0 ? 
            Math.round((stats.completed_items / stats.total_items) * 100) : 0
        },
        filters: {
          completed
        },
        timestamp: new Date().toISOString()
      });

    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ Get shopping list error:', error);
    res.status(500).json({
      error: 'Failed to get shopping list',
      message: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
};

// Add item to shopping list
const addShoppingListItem = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array(),
        timestamp: new Date().toISOString()
      });
    }

    const { ingredientName, quantity, unit, notes, recipeId } = req.body;
    const userId = req.user.id;

    const client = await pool.connect();
    try {
      // If recipeId is provided, verify the recipe exists and user has access
      let recipe = null;
      if (recipeId) {
        const recipeResult = await client.query(
          'SELECT id, title, author_id, is_public FROM recipes WHERE id = $1',
          [recipeId]
        );

        if (recipeResult.rows.length === 0) {
          return res.status(404).json({
            error: 'Recipe not found',
            timestamp: new Date().toISOString()
          });
        }

        recipe = recipeResult.rows[0];

        // Check if user can access this recipe
        if (!recipe.is_public && recipe.author_id !== userId) {
          return res.status(403).json({
            error: 'Access denied',
            message: 'Cannot add items from a private recipe',
            timestamp: new Date().toISOString()
          });
        }
      }

      // Create shopping list item
      const itemId = generateUUID();
      const insertResult = await client.query(`
        INSERT INTO shopping_list_items (
          id, user_id, recipe_id, ingredient_name, quantity, unit, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, ingredient_name, quantity, unit, notes, is_completed, created_at, updated_at
      `, [
        itemId,
        userId,
        recipeId || null,
        ingredientName,
        quantity || null,
        unit || '',
        notes || null
      ]);

      const newItem = insertResult.rows[0];

      res.status(201).json({
        message: 'Item added to shopping list successfully',
        item: {
          id: newItem.id,
          ingredientName: newItem.ingredient_name,
          quantity: newItem.quantity ? parseFloat(newItem.quantity) : null,
          unit: newItem.unit,
          notes: newItem.notes,
          isCompleted: newItem.is_completed,
          createdAt: newItem.created_at,
          updatedAt: newItem.updated_at,
          recipe: recipe ? {
            id: recipe.id,
            title: recipe.title
          } : null
        },
        timestamp: new Date().toISOString()
      });

    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ Add shopping list item error:', error);
    res.status(500).json({
      error: 'Failed to add item to shopping list',
      message: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
};

// Add all ingredients from a recipe to shopping list
const addRecipeToShoppingList = async (req, res) => {
  try {
    const { id: recipeId } = req.params;
    const { servingMultiplier = 1 } = req.body;
    const userId = req.user.id;

    const client = await pool.connect();
    try {
      // Get recipe and verify access
      const recipeResult = await client.query(
        'SELECT id, title, author_id, is_public, servings FROM recipes WHERE id = $1',
        [recipeId]
      );

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
          message: 'Cannot add ingredients from a private recipe',
          timestamp: new Date().toISOString()
        });
      }

      // Get recipe ingredients
      const ingredientsResult = await client.query(`
        SELECT name, quantity, unit, notes
        FROM recipe_ingredients
        WHERE recipe_id = $1
        ORDER BY order_index
      `, [recipeId]);

      if (ingredientsResult.rows.length === 0) {
        return res.status(400).json({
          error: 'No ingredients found',
          message: 'This recipe has no ingredients to add',
          timestamp: new Date().toISOString()
        });
      }

      // Add each ingredient to shopping list
      const addedItems = [];
      const multiplier = parseFloat(servingMultiplier);

      for (const ingredient of ingredientsResult.rows) {
        const itemId = generateUUID();
        const adjustedQuantity = ingredient.quantity ? ingredient.quantity * multiplier : null;
        
        const insertResult = await client.query(`
          INSERT INTO shopping_list_items (
            id, user_id, recipe_id, ingredient_name, quantity, unit, notes
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING id, ingredient_name, quantity, unit, notes, is_completed, created_at, updated_at
        `, [
          itemId,
          userId,
          recipeId,
          ingredient.name,
          adjustedQuantity,
          ingredient.unit,
          ingredient.notes
        ]);

        const newItem = insertResult.rows[0];
        addedItems.push({
          id: newItem.id,
          ingredientName: newItem.ingredient_name,
          quantity: newItem.quantity ? parseFloat(newItem.quantity) : null,
          unit: newItem.unit,
          notes: newItem.notes,
          isCompleted: newItem.is_completed,
          createdAt: newItem.created_at,
          updatedAt: newItem.updated_at
        });
      }

      res.status(201).json({
        message: `Added ${addedItems.length} ingredients from "${recipe.title}" to shopping list`,
        recipe: {
          id: recipe.id,
          title: recipe.title,
          originalServings: recipe.servings,
          adjustedServings: recipe.servings * multiplier
        },
        addedItems,
        servingMultiplier: multiplier,
        timestamp: new Date().toISOString()
      });

    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ Add recipe to shopping list error:', error);
    res.status(500).json({
      error: 'Failed to add recipe to shopping list',
      message: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
};
// Update shopping list item - FIXED
const updateShoppingListItem = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array(),
        timestamp: new Date().toISOString()
      });
    }

    const { itemId } = req.params;
    const { ingredientName, quantity, unit, notes, isCompleted } = req.body;
    const userId = req.user.id;

    const client = await pool.connect();
    try {
      // Check if item exists and belongs to user
      const existingItem = await client.query(
        'SELECT id, user_id FROM shopping_list_items WHERE id = $1',
        [itemId]
      );

      if (existingItem.rows.length === 0) {
        return res.status(404).json({
          error: 'Shopping list item not found',
          timestamp: new Date().toISOString()
        });
      }

      if (existingItem.rows[0].user_id !== userId) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'You can only update your own shopping list items',
          timestamp: new Date().toISOString()
        });
      }

      // Build dynamic update query - FIXED to handle all possible field updates
      const updates = [];
      const values = [];
      let paramCount = 1;

      if (ingredientName !== undefined) {
        updates.push(`ingredient_name = $${paramCount}`);
        values.push(ingredientName);
        paramCount++;
      }

      if (quantity !== undefined) {
        updates.push(`quantity = $${paramCount}`);
        values.push(quantity);
        paramCount++;
      }

      if (unit !== undefined) {
        updates.push(`unit = $${paramCount}`);
        values.push(unit || '');
        paramCount++;
      }

      if (notes !== undefined) {
        updates.push(`notes = $${paramCount}`);
        values.push(notes || null);
        paramCount++;
      }

      if (isCompleted !== undefined) {
        updates.push(`is_completed = $${paramCount}`);
        values.push(isCompleted);
        paramCount++;
      }

      if (updates.length === 0) {
        return res.status(400).json({
          error: 'No fields to update',
          timestamp: new Date().toISOString()
        });
      }

      updates.push('updated_at = CURRENT_TIMESTAMP');
      values.push(itemId);

      const updateQuery = `
        UPDATE shopping_list_items 
        SET ${updates.join(', ')}
        WHERE id = $${paramCount}
        RETURNING id, ingredient_name, quantity, unit, notes, is_completed, 
                 created_at, updated_at, recipe_id
      `;

      const updateResult = await client.query(updateQuery, values);
      const updatedItem = updateResult.rows[0];

      // Get recipe info if associated
      let recipe = null;
      if (updatedItem.recipe_id) {
        const recipeResult = await client.query(
          'SELECT id, title, image_url FROM recipes WHERE id = $1',
          [updatedItem.recipe_id]
        );
        if (recipeResult.rows.length > 0) {
          recipe = recipeResult.rows[0];
        }
      }

      res.json({
        message: 'Shopping list item updated successfully',
        item: {
          id: updatedItem.id,
          ingredientName: updatedItem.ingredient_name,
          quantity: updatedItem.quantity ? parseFloat(updatedItem.quantity) : null,
          unit: updatedItem.unit,
          notes: updatedItem.notes,
          isCompleted: updatedItem.is_completed,
          createdAt: updatedItem.created_at,
          updatedAt: updatedItem.updated_at,
          recipe: recipe ? {
            id: recipe.id,
            title: recipe.title,
            imageUrl: recipe.image_url
          } : null
        },
        timestamp: new Date().toISOString()
      });

    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ Update shopping list item error:', error);
    res.status(500).json({
      error: 'Failed to update shopping list item',
      message: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
};

// Delete shopping list item
const deleteShoppingListItem = async (req, res) => {
  try {
    const { itemId } = req.params;
    const userId = req.user.id;

    const client = await pool.connect();
    try {
      // Check if item exists and belongs to user
      const existingItem = await client.query(
        'SELECT id, user_id, ingredient_name FROM shopping_list_items WHERE id = $1',
        [itemId]
      );

      if (existingItem.rows.length === 0) {
        return res.status(404).json({
          error: 'Shopping list item not found',
          timestamp: new Date().toISOString()
        });
      }

      if (existingItem.rows[0].user_id !== userId) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'You can only delete your own shopping list items',
          timestamp: new Date().toISOString()
        });
      }

      // Delete the item
      await client.query('DELETE FROM shopping_list_items WHERE id = $1', [itemId]);

      res.json({
        message: 'Shopping list item deleted successfully',
        deletedItem: {
          id: itemId,
          ingredientName: existingItem.rows[0].ingredient_name
        },
        timestamp: new Date().toISOString()
      });

    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ Delete shopping list item error:', error);
    res.status(500).json({
      error: 'Failed to delete shopping list item',
      message: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
};

// Clear completed items
const clearCompletedItems = async (req, res) => {
  try {
    const userId = req.user.id;

    const client = await pool.connect();
    try {
      // Delete all completed items for the user
      const deleteResult = await client.query(
        'DELETE FROM shopping_list_items WHERE user_id = $1 AND is_completed = true',
        [userId]
      );

      const deletedCount = deleteResult.rowCount;

      res.json({
        message: `Cleared ${deletedCount} completed items from shopping list`,
        deletedCount,
        timestamp: new Date().toISOString()
      });

    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ Clear completed items error:', error);
    res.status(500).json({
      error: 'Failed to clear completed items',
      message: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
};

// Clear all items
const clearShoppingList = async (req, res) => {
  try {
    const userId = req.user.id;

    const client = await pool.connect();
    try {
      // Delete all items for the user
      const deleteResult = await client.query(
        'DELETE FROM shopping_list_items WHERE user_id = $1',
        [userId]
      );

      const deletedCount = deleteResult.rowCount;

      res.json({
        message: `Cleared all ${deletedCount} items from shopping list`,
        deletedCount,
        timestamp: new Date().toISOString()
      });

    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ Clear shopping list error:', error);
    res.status(500).json({
      error: 'Failed to clear shopping list',
      message: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
};

module.exports = {
  getShoppingList,
  addShoppingListItem,
  addRecipeToShoppingList,
  updateShoppingListItem,
  deleteShoppingListItem,
  clearCompletedItems,
  clearShoppingList
};