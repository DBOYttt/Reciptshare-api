const { createTables, dropTables, checkTablesExist } = require('../config/schema');

// Initialize database with tables
const initializeDatabase = async () => {
  try {
    console.log('🚀 Starting database initialization...');
    
    // Check existing tables
    const existingTables = await checkTablesExist();
    console.log('📋 Existing tables:', existingTables.length > 0 ? existingTables : 'None');
    
    // Create tables
    await createTables();
    
    // Verify tables were created
    const tablesAfterCreation = await checkTablesExist();
    console.log('✅ Tables after creation:', tablesAfterCreation);
    
    console.log('🎉 Database initialization completed successfully!');
    return true;
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    return false;
  }
};

// Reset database (drop and recreate all tables)
const resetDatabase = async () => {
  try {
    console.log('🔄 Resetting database...');
    
    await dropTables();
    await createTables();
    
    const tablesAfterReset = await checkTablesExist();
    console.log('✅ Tables after reset:', tablesAfterReset);
    
    console.log('🎉 Database reset completed successfully!');
    return true;
  } catch (error) {
    console.error('❌ Database reset failed:', error);
    return false;
  }
};

module.exports = {
  initializeDatabase,
  resetDatabase
};