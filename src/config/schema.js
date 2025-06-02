const { pool } = require('./database');
const { v4: uuidv4 } = require('uuid');

// SQL script to create all tables (no UUID functions, handle in app)
const createTablesSQL = `
-- Users table (no default UUID, we'll handle in app)
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100),
    bio TEXT,
    profile_image_url TEXT,
    location VARCHAR(255),
    website VARCHAR(255),
    is_public_profile BOOLEAN DEFAULT true,
    allow_recipe_notifications BOOLEAN DEFAULT true,
    allow_follower_notifications BOOLEAN DEFAULT true,
    allow_comment_notifications BOOLEAN DEFAULT true,
    is_verified BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Recipe categories table
CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    color VARCHAR(7) DEFAULT '#2196F3',
    icon VARCHAR(50),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Difficulty levels enum
DO $$ BEGIN
    CREATE TYPE difficulty_level AS ENUM ('Easy', 'Medium', 'Hard', 'Expert');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Recipes table
CREATE TABLE IF NOT EXISTS recipes (
    id TEXT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    prep_time_minutes INTEGER NOT NULL CHECK (prep_time_minutes > 0),
    cook_time_minutes INTEGER NOT NULL CHECK (cook_time_minutes > 0),
    servings INTEGER NOT NULL CHECK (servings > 0),
    difficulty difficulty_level NOT NULL DEFAULT 'Easy',
    image_url TEXT,
    instructions TEXT[] NOT NULL,
    is_public BOOLEAN DEFAULT true,
    is_featured BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Recipe ingredients table
CREATE TABLE IF NOT EXISTS recipe_ingredients (
    id TEXT PRIMARY KEY,
    recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    quantity DECIMAL(10,2) NOT NULL CHECK (quantity > 0),
    unit VARCHAR(50) NOT NULL,
    notes TEXT,
    order_index INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Recipe categories junction table
CREATE TABLE IF NOT EXISTS recipe_categories (
    recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    PRIMARY KEY (recipe_id, category_id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Recipe ratings table
CREATE TABLE IF NOT EXISTS recipe_ratings (
    id TEXT PRIMARY KEY,
    recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    review TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(recipe_id, user_id)
);

-- Recipe comments table
CREATE TABLE IF NOT EXISTS recipe_comments (
    id TEXT PRIMARY KEY,
    recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    comment TEXT NOT NULL,
    parent_comment_id TEXT REFERENCES recipe_comments(id) ON DELETE CASCADE,
    is_edited BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Recipe likes/favorites table
CREATE TABLE IF NOT EXISTS recipe_likes (
    recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (recipe_id, user_id)
);

-- User followers table
CREATE TABLE IF NOT EXISTS user_followers (
    follower_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    following_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (follower_id, following_id),
    CHECK (follower_id != following_id)
);

-- Shopping list items table
CREATE TABLE IF NOT EXISTS shopping_list_items (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipe_id TEXT REFERENCES recipes(id) ON DELETE SET NULL,
    ingredient_name VARCHAR(255) NOT NULL,
    quantity DECIMAL(10,2),
    unit VARCHAR(50),
    notes TEXT,
    is_completed BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_recipes_author_id ON recipes(author_id);
CREATE INDEX IF NOT EXISTS idx_recipes_created_at ON recipes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recipes_difficulty ON recipes(difficulty);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe_id ON recipe_ingredients(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_categories_recipe_id ON recipe_categories(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_categories_category_id ON recipe_categories(category_id);
CREATE INDEX IF NOT EXISTS idx_recipe_ratings_recipe_id ON recipe_ratings(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_ratings_user_id ON recipe_ratings(user_id);
CREATE INDEX IF NOT EXISTS idx_recipe_comments_recipe_id ON recipe_comments(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_comments_user_id ON recipe_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_recipe_likes_recipe_id ON recipe_likes(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_likes_user_id ON recipe_likes(user_id);
CREATE INDEX IF NOT EXISTS idx_user_followers_follower_id ON user_followers(follower_id);
CREATE INDEX IF NOT EXISTS idx_user_followers_following_id ON user_followers(following_id);
CREATE INDEX IF NOT EXISTS idx_shopping_list_user_id ON shopping_list_items(user_id);

-- Create or replace function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers to automatically update updated_at timestamps
DO $$ BEGIN
    CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TRIGGER update_recipes_updated_at BEFORE UPDATE ON recipes
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TRIGGER update_recipe_ratings_updated_at BEFORE UPDATE ON recipe_ratings
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TRIGGER update_recipe_comments_updated_at BEFORE UPDATE ON recipe_comments
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TRIGGER update_shopping_list_items_updated_at BEFORE UPDATE ON shopping_list_items
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
`;

// SQL script to insert default categories
const insertCategoriesSQL = `
INSERT INTO categories (name, description, color, icon) VALUES
('Appetizers', 'Small dishes served before the main course', '#FF9800', '🥗'),
('Main Course', 'Primary dishes and entrees', '#4CAF50', '🍽️'),
('Desserts', 'Sweet treats and desserts', '#E91E63', '🍰'),
('Beverages', 'Drinks and cocktails', '#2196F3', '🥤'),
('Breakfast', 'Morning meals and breakfast items', '#FF5722', '🍳'),
('Lunch', 'Midday meals and light dishes', '#795548', '🥪'),
('Dinner', 'Evening meals and hearty dishes', '#3F51B5', '🍖'),
('Snacks', 'Quick bites and light snacks', '#FFEB3B', '🍿'),
('Vegetarian', 'Plant-based recipes without meat', '#8BC34A', '🥕'),
('Vegan', 'Plant-based recipes without any animal products', '#4CAF50', '🌱'),
('Gluten-Free', 'Recipes without gluten', '#9C27B0', '🌾'),
('Low-Carb', 'Low carbohydrate recipes', '#607D8B', '🥩'),
('Italian', 'Traditional Italian cuisine', '#FF5722', '🍝'),
('Mexican', 'Traditional Mexican cuisine', '#FF9800', '🌮'),
('Asian', 'Asian cuisine and flavors', '#F44336', '🥢'),
('Indian', 'Traditional Indian cuisine', '#FF5722', '🍛'),
('Mediterranean', 'Mediterranean diet and cuisine', '#009688', '🫒'),
('American', 'Traditional American cuisine', '#2196F3', '🍔'),
('French', 'Traditional French cuisine', '#9C27B0', '🥐'),
('Thai', 'Traditional Thai cuisine', '#4CAF50', '🌶️')
ON CONFLICT (name) DO NOTHING;
`;

// Function to create all tables
const createTables = async () => {
  const client = await pool.connect();
  try {
    console.log('🔧 Creating database schema...');
    await client.query(createTablesSQL);
    console.log('✅ Database schema created successfully');
    
    console.log('📦 Inserting default categories...');
    await client.query(insertCategoriesSQL);
    console.log('✅ Default categories inserted successfully');
    
    return true;
  } catch (error) {
    console.error('❌ Error creating database schema:', error);
    throw error;
  } finally {
    client.release();
  }
};

// Force drop everything
const forceDropEverything = async () => {
  const client = await pool.connect();
  try {
    console.log('💥 Force dropping everything in database...');
    
    const dropAllTablesSQL = `
      DO $$ 
      DECLARE 
          r RECORD;
      BEGIN
          -- Drop all tables
          FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') 
          LOOP
              EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(r.tablename) || ' CASCADE';
          END LOOP;
          
          -- Drop all sequences
          FOR r IN (SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public')
          LOOP
              EXECUTE 'DROP SEQUENCE IF EXISTS ' || quote_ident(r.sequence_name) || ' CASCADE';
          END LOOP;
          
          -- Drop all custom types
          FOR r IN (SELECT typname FROM pg_type WHERE typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public') AND typtype = 'e')
          LOOP
              EXECUTE 'DROP TYPE IF EXISTS ' || quote_ident(r.typname) || ' CASCADE';
          END LOOP;
          
          -- Drop all functions (except system functions)
          FOR r IN (SELECT proname FROM pg_proc WHERE pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public'))
          LOOP
              EXECUTE 'DROP FUNCTION IF EXISTS ' || quote_ident(r.proname) || ' CASCADE';
          END LOOP;
      END $$;
    `;
    
    await client.query(dropAllTablesSQL);
    console.log('✅ Force dropped all database objects');
    
    return true;
  } catch (error) {
    console.error('❌ Error force dropping database objects:', error);
    throw error;
  } finally {
    client.release();
  }
};

// Regular drop function
const dropTables = async () => {
  const client = await pool.connect();
  try {
    console.log('🗑️ Dropping tables...');
    
    const dropTablesSQL = `
      DROP TABLE IF EXISTS shopping_list_items CASCADE;
      DROP TABLE IF EXISTS user_followers CASCADE;
      DROP TABLE IF EXISTS recipe_likes CASCADE;
      DROP TABLE IF EXISTS recipe_comments CASCADE;
      DROP TABLE IF EXISTS recipe_ratings CASCADE;
      DROP TABLE IF EXISTS recipe_categories CASCADE;
      DROP TABLE IF EXISTS recipe_ingredients CASCADE;
      DROP TABLE IF EXISTS recipes CASCADE;
      DROP TABLE IF EXISTS categories CASCADE;
      DROP TABLE IF EXISTS users CASCADE;
      DROP TABLE IF EXISTS "__EFMigrationsHistory" CASCADE;
      DROP TYPE IF EXISTS difficulty_level CASCADE;
      DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
    `;
    
    await client.query(dropTablesSQL);
    console.log('✅ Regular drop completed');
    
    return true;
  } catch (error) {
    console.error('❌ Regular drop failed, trying force drop...', error.message);
    return await forceDropEverything();
  } finally {
    client.release();
  }
};

// Function to check if tables exist
const checkTablesExist = async () => {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);
    
    return result.rows.map(row => row.table_name);
  } catch (error) {
    console.error('❌ Error checking tables:', error);
    throw error;
  } finally {
    client.release();
  }
};

// Utility function to generate UUID (for use in application code)
const generateUUID = () => {
  return uuidv4();
};

module.exports = {
  createTables,
  dropTables,
  forceDropEverything,
  checkTablesExist,
  generateUUID
};