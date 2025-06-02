const express = require('express');
const { initializeDatabase, resetDatabase } = require('../utils/initDatabase');
const { checkTablesExist, forceDropEverything, createTables } = require('../config/schema');

const router = express.Router();

// Initialize database (create tables)
router.post('/init', async (req, res) => {
  try {
    const success = await initializeDatabase();
    
    if (success) {
      res.json({
        message: 'Database initialized successfully',
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(500).json({
        error: 'Database initialization failed',
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    res.status(500).json({
      error: 'Database initialization error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Reset database (drop and recreate all tables)
router.post('/reset', async (req, res) => {
  try {
    const success = await resetDatabase();
    
    if (success) {
      res.json({
        message: 'Database reset successfully',
        warning: 'All data has been deleted',
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(500).json({
        error: 'Database reset failed',
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    res.status(500).json({
      error: 'Database reset error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Force reset database (nuclear option)
router.post('/force-reset', async (req, res) => {
  try {
    console.log('🚨 Force reset requested...');
    
    // Force drop everything
    await forceDropEverything();
    
    // Recreate schema
    await createTables();
    
    res.json({
      message: 'Database force reset successfully',
      warning: 'All data has been completely wiped',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      error: 'Database force reset failed',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Get database status
router.get('/status', async (req, res) => {
  try {
    const tables = await checkTablesExist();
    
    res.json({
      status: 'connected',
      tables: tables,
      tableCount: tables.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get database status',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;