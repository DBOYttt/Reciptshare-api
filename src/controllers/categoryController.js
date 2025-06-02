const { pool } = require('../config/database');

// Get all categories
const getCategories = async (req, res) => {
  try {
    const { active = 'true' } = req.query;

    const client = await pool.connect();
    try {
      let query = `
        SELECT id, name, description, color, icon, is_active, created_at,
               (SELECT COUNT(*) FROM recipe_categories rc 
                JOIN recipes r ON rc.recipe_id = r.id 
                WHERE rc.category_id = categories.id AND r.is_public = true) as recipe_count
        FROM categories
      `;

      const values = [];
      if (active === 'true') {
        query += ' WHERE is_active = true';
      }

      query += ' ORDER BY name';

      const result = await client.query(query, values);

      const categories = result.rows.map(category => ({
        id: category.id,
        name: category.name,
        description: category.description,
        color: category.color,
        icon: category.icon,
        isActive: category.is_active,
        recipeCount: parseInt(category.recipe_count),
        createdAt: category.created_at
      }));

      res.json({
        categories,
        totalCategories: categories.length,
        timestamp: new Date().toISOString()
      });

    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ Get categories error:', error);
    res.status(500).json({
      error: 'Failed to get categories',
      message: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
};

// Get single category by ID
const getCategoryById = async (req, res) => {
  try {
    const { id } = req.params;

    const client = await pool.connect();
    try {
      const result = await client.query(`
        SELECT id, name, description, color, icon, is_active, created_at,
               (SELECT COUNT(*) FROM recipe_categories rc 
                JOIN recipes r ON rc.recipe_id = r.id 
                WHERE rc.category_id = categories.id AND r.is_public = true) as recipe_count
        FROM categories
        WHERE id = $1
      `, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: 'Category not found',
          timestamp: new Date().toISOString()
        });
      }

      const category = result.rows[0];

      res.json({
        category: {
          id: category.id,
          name: category.name,
          description: category.description,
          color: category.color,
          icon: category.icon,
          isActive: category.is_active,
          recipeCount: parseInt(category.recipe_count),
          createdAt: category.created_at
        },
        timestamp: new Date().toISOString()
      });

    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ Get category by ID error:', error);
    res.status(500).json({
      error: 'Failed to get category',
      message: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
};

module.exports = {
  getCategories,
  getCategoryById
};