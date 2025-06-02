const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// Import database configuration
const { testConnection } = require('./src/config/database');

// Import all routes
const adminRoutes = require('./src/routes/admin');
const authRoutes = require('./src/routes/auth');
const userRoutes = require('./src/routes/users');
const recipeRoutes = require('./src/routes/recipes');
const categoryRoutes = require('./src/routes/categories');
const recipeInteractionRoutes = require('./src/routes/recipeInteractions');
const commentRoutes = require('./src/routes/comments');
const followRoutes = require('./src/routes/follow');
const feedRoutes = require('./src/routes/feed');
const shoppingListRoutes = require('./src/routes/shoppingList');
const searchRoutes = require('./src/routes/search');
const statisticsRoutes = require('./src/routes/statistics');
const collectionsRoutes = require('./src/routes/collections');

// Create Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy for rate limiting behind reverse proxies
app.set('trust proxy', 1);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per windowMs
  message: {
    error: 'Too many requests',
    message: 'Please try again later',
    timestamp: new Date().toISOString()
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Stricter rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit each IP to 20 auth requests per windowMs
  message: {
    error: 'Too many authentication attempts',
    message: 'Please try again later',
    timestamp: new Date().toISOString()
  }
});

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Apply rate limiting
app.use(limiter);
app.use('/api/auth', authLimiter);

// CORS middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware (in development)
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.originalUrl}`);
    next();
  });
}

// API Routes
app.use('/api/admin', adminRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/recipes', recipeRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/recipes', recipeInteractionRoutes); // Recipe likes and ratings
app.use('/api', commentRoutes); // Comments
app.use('/api', followRoutes); // Follow system
app.use('/api', feedRoutes); // Social feeds
app.use('/api/shopping-list', shoppingListRoutes); // Shopping lists
app.use('/api/search', searchRoutes); // Search functionality
app.use('/api/statistics', statisticsRoutes); // Statistics
app.use('/api/collections', collectionsRoutes); // User collections

// Root endpoint with API overview
app.get('/', (req, res) => {
  res.json({
    message: '🍳 RecipeShare API is running!',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    server: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      nodeVersion: process.version
    },
    endpoints: {
      // Core endpoints
      health: 'GET /api/health',
      admin: 'GET /api/admin/*',
      
      // Authentication
      register: 'POST /api/auth/register',
      login: 'POST /api/auth/login',
      profile: 'GET /api/auth/profile',
      verifyToken: 'GET /api/auth/verify',
      
      // Users
      updateProfile: 'PUT /api/users/profile',
      publicProfile: 'GET /api/users/:username',
      
      // Recipes
      recipes: 'GET /api/recipes',
      createRecipe: 'POST /api/recipes',
      recipeById: 'GET /api/recipes/:id',
      updateRecipe: 'PUT /api/recipes/:id',
      deleteRecipe: 'DELETE /api/recipes/:id',
      
      // Categories
      categories: 'GET /api/categories',
      categoryById: 'GET /api/categories/:id',
      
      // Interactions
      likeRecipe: 'POST /api/recipes/:id/like',
      rateRecipe: 'POST /api/recipes/:id/rate',
      recipeRatings: 'GET /api/recipes/:id/ratings',
      deleteRating: 'DELETE /api/recipes/:id/rating',
      
      // Comments
      createComment: 'POST /api/recipes/:id/comments',
      getComments: 'GET /api/recipes/:id/comments',
      updateComment: 'PUT /api/comments/:commentId',
      deleteComment: 'DELETE /api/comments/:commentId',
      
      // Social Features
      followUser: 'POST /api/users/:username/follow',
      getUserFollowers: 'GET /api/users/:username/followers',
      getUserFollowing: 'GET /api/users/:username/following',
      followSuggestions: 'GET /api/suggestions',
      
      // Feeds
      personalFeed: 'GET /api/feed',
      trendingRecipes: 'GET /api/trending',
      userActivity: 'GET /api/activity',
      
      // Shopping Lists
      shoppingList: 'GET /api/shopping-list',
      addItem: 'POST /api/shopping-list/items',
      addRecipeToList: 'POST /api/shopping-list/recipes/:id',
      updateItem: 'PUT /api/shopping-list/items/:itemId',
      deleteItem: 'DELETE /api/shopping-list/items/:itemId',
      clearCompleted: 'DELETE /api/shopping-list/completed',
      clearAll: 'DELETE /api/shopping-list/clear',
      
      // Search
      globalSearch: 'GET /api/search?q=query',
      advancedRecipeSearch: 'GET /api/search/recipes',
      
      // Statistics
      platformStats: 'GET /api/statistics/platform',
      userStats: 'GET /api/statistics/user',
      
      // Collections
      favoriteRecipes: 'GET /api/collections/favorites',
      recipeHistory: 'GET /api/collections/history'
    },
    documentation: {
      apiDocs: '/api/docs',
      schemas: '/api/schemas',
      examples: '/api/examples'
    }
  });
});

// API health check with detailed system info
app.get('/api/health', async (req, res) => {
  try {
    const startTime = Date.now();
    const dbConnected = await testConnection();
    const dbResponseTime = Date.now() - startTime;
    
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      version: '1.0.0',
      database: {
        status: dbConnected ? 'connected' : 'disconnected',
        responseTime: `${dbResponseTime}ms`
      },
      system: {
        memory: {
          used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
          unit: 'MB'
        },
        cpu: process.cpuUsage(),
        nodeVersion: process.version,
        platform: process.platform
      }
    };
    
    if (!dbConnected) {
      health.status = 'degraded';
      return res.status(503).json(health);
    }
    
    res.json(health);
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      database: 'disconnected',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// API Documentation endpoint
app.get('/api/docs', (req, res) => {
  res.json({
    title: 'RecipeShare API Documentation',
    version: '1.0.0',
    description: 'Complete API documentation for the RecipeShare platform',
    baseUrl: `${req.protocol}://${req.get('host')}/api`,
    authentication: {
      type: 'Bearer Token (JWT)',
      header: 'Authorization: Bearer <token>',
      obtain: 'POST /auth/login or POST /auth/register'
    },
    endpoints: {
      authentication: {
        register: {
          method: 'POST',
          path: '/auth/register',
          description: 'Register a new user account',
          body: {
            username: 'string (3-50 chars, alphanumeric)',
            email: 'string (valid email)',
            password: 'string (8+ chars, mixed case, number, special char)',
            firstName: 'string (1-100 chars)',
            lastName: 'string (optional, max 100 chars)',
            bio: 'string (optional, max 500 chars)',
            profileImageUrl: 'string (optional, valid URL)'
          },
          response: {
            user: 'User object',
            token: 'JWT token',
            expiresIn: 'Token expiration time'
          }
        },
        login: {
          method: 'POST',
          path: '/auth/login',
          description: 'Login with existing credentials',
          body: {
            emailOrUsername: 'string (email or username)',
            password: 'string'
          },
          response: {
            user: 'User object',
            token: 'JWT token',
            expiresIn: 'Token expiration time'
          }
        }
      },
      recipes: {
        list: {
          method: 'GET',
          path: '/recipes',
          description: 'Get paginated list of recipes with filters',
          query: {
            page: 'number (default: 1)',
            limit: 'number (1-10, default: 10)',
            search: 'string (search in title/description)',
            category: 'string (category name)',
            difficulty: 'string (Easy|Medium|Hard|Expert)',
            authorId: 'string (filter by author)',
            featured: 'boolean (featured recipes only)',
            sort: 'string (created_at|title|prep_time_minutes|cook_time_minutes|difficulty)',
            order: 'string (asc|desc, default: desc)'
          }
        },
        create: {
          method: 'POST',
          path: '/recipes',
          auth: 'required',
          description: 'Create a new recipe',
          body: {
            title: 'string (1-255 chars)',
            description: 'string (10-2000 chars)',
            prepTimeMinutes: 'number (1-1440)',
            cookTimeMinutes: 'number (1-1440)',
            servings: 'number (1-100)',
            difficulty: 'string (Easy|Medium|Hard|Expert)',
            imageUrl: 'string (optional, valid URL)',
            instructions: 'array of strings (each 1-1000 chars)',
            ingredients: 'array of ingredient objects',
            categoryIds: 'array of numbers (optional)',
            isPublic: 'boolean (default: true)'
          }
        },
        get: {
          method: 'GET',
          path: '/recipes/:id',
          description: 'Get a single recipe by ID'
        },
        update: {
          method: 'PUT',
          path: '/recipes/:id',
          auth: 'required (owner only)',
          description: 'Update a recipe'
        },
        delete: {
          method: 'DELETE',
          path: '/recipes/:id',
          auth: 'required (owner only)',
          description: 'Delete a recipe'
        }
      },
      social: {
        like: {
          method: 'POST',
          path: '/recipes/:id/like',
          auth: 'required',
          description: 'Toggle like/unlike on a recipe'
        },
        rate: {
          method: 'POST',
          path: '/recipes/:id/rate',
          auth: 'required',
          description: 'Rate a recipe (1-5 stars)',
          body: {
            rating: 'number (1-5)',
            review: 'string (optional, max 1000 chars)'
          }
        },
        comment: {
          method: 'POST',
          path: '/recipes/:id/comments',
          auth: 'required',
          description: 'Add a comment to a recipe',
          body: {
            comment: 'string (1-1000 chars)',
            parentCommentId: 'string (optional, for replies)'
          }
        },
        follow: {
          method: 'POST',
          path: '/users/:username/follow',
          auth: 'required',
          description: 'Follow/unfollow a user'
        }
      },
      search: {
        global: {
          method: 'GET',
          path: '/search',
          description: 'Global search across recipes, users, and ingredients',
          query: {
            q: 'string (2+ chars, required)',
            type: 'string (all|recipes|users|ingredients, default: all)',
            page: 'number (default: 1)',
            limit: 'number (1-10, default: 10)'
          }
        },
        recipes: {
          method: 'GET',
          path: '/search/recipes',
          description: 'Advanced recipe search with multiple filters',
          query: {
            q: 'string (text search)',
            ingredients: 'string (comma-separated)',
            categories: 'string (comma-separated)',
            difficulty: 'string (Easy|Medium|Hard|Expert)',
            maxPrepTime: 'number (minutes)',
            maxCookTime: 'number (minutes)',
            minRating: 'number (1-5)',
            sort: 'string (relevance|newest|oldest|popular|rating|prep_time|cook_time|total_time)'
          }
        }
      },
      shoppingList: {
        get: {
          method: 'GET',
          path: '/shopping-list',
          auth: 'required',
          description: 'Get user\'s shopping list',
          query: {
            completed: 'string (true|false|all, default: all)'
          }
        },
        addItem: {
          method: 'POST',
          path: '/shopping-list/items',
          auth: 'required',
          body: {
            ingredientName: 'string (1-255 chars)',
            quantity: 'number (optional)',
            unit: 'string (optional, max 50 chars)',
            notes: 'string (optional, max 255 chars)',
            recipeId: 'string (optional)'
          }
        },
        addRecipe: {
          method: 'POST',
          path: '/shopping-list/recipes/:id',
          auth: 'required',
          description: 'Add all ingredients from a recipe to shopping list',
          body: {
            servingMultiplier: 'number (0.1-10, default: 1)'
          }
        }
      }
    },
    errorCodes: {
      400: 'Bad Request - Invalid input data',
      401: 'Unauthorized - Authentication required',
      403: 'Forbidden - Access denied',
      404: 'Not Found - Resource not found',
      409: 'Conflict - Resource already exists',
      422: 'Unprocessable Entity - Validation failed',
      429: 'Too Many Requests - Rate limit exceeded',
      500: 'Internal Server Error - Server error'
    },
    responseFormat: {
      success: {
        data: 'Response data',
        message: 'Success message (optional)',
        timestamp: 'ISO timestamp'
      },
      error: {
        error: 'Error type',
        message: 'Error description',
        details: 'Validation details (optional)',
        timestamp: 'ISO timestamp'
      }
    }
  });
});

// API Schema definitions
app.get('/api/schemas', (req, res) => {
  res.json({
    title: 'RecipeShare API Schemas',
    schemas: {
      User: {
        id: 'string (UUID)',
        username: 'string',
        email: 'string',
        firstName: 'string',
        lastName: 'string',
        fullName: 'string',
        bio: 'string',
        profileImageUrl: 'string',
        location: 'string',
        website: 'string',
        isPublicProfile: 'boolean',
        isVerified: 'boolean',
        createdAt: 'ISO timestamp',
        updatedAt: 'ISO timestamp',
        stats: {
          recipeCount: 'number',
          followersCount: 'number',
          followingCount: 'number',
          totalLikes: 'number'
        }
      },
      Recipe: {
        id: 'string (UUID)',
        title: 'string',
        description: 'string',
        prepTimeMinutes: 'number',
        cookTimeMinutes: 'number',
        totalTimeMinutes: 'number',
        servings: 'number',
        difficulty: 'string (Easy|Medium|Hard|Expert)',
        imageUrl: 'string',
        instructions: 'array of strings',
        isPublic: 'boolean',
        isFeatured: 'boolean',
        createdAt: 'ISO timestamp',
        updatedAt: 'ISO timestamp',
        author: 'User object',
        ingredients: 'array of Ingredient objects',
        categories: 'array of Category objects',
        stats: {
          likesCount: 'number',
          commentsCount: 'number',
          averageRating: 'number',
          ratingsCount: 'number'
        },
        isLikedByUser: 'boolean',
        userRating: 'number'
      },
      Ingredient: {
        id: 'string (UUID)',
        name: 'string',
        quantity: 'number',
        unit: 'string',
        notes: 'string',
        orderIndex: 'number'
      },
      Category: {
        id: 'number',
        name: 'string',
        description: 'string',
        color: 'string (hex color)',
        icon: 'string (emoji)',
        isActive: 'boolean',
        recipeCount: 'number',
        createdAt: 'ISO timestamp'
      },
      Comment: {
        id: 'string (UUID)',
        comment: 'string',
        parentCommentId: 'string',
        isEdited: 'boolean',
        createdAt: 'ISO timestamp',
        updatedAt: 'ISO timestamp',
        user: 'User object',
        replies: 'array of Comment objects'
      },
      ShoppingListItem: {
        id: 'string (UUID)',
        ingredientName: 'string',
        quantity: 'number',
        unit: 'string',
        notes: 'string',
        isCompleted: 'boolean',
        createdAt: 'ISO timestamp',
        updatedAt: 'ISO timestamp',
        recipe: 'Recipe object (partial)'
      }
    }
  });
});

// API Examples
app.get('/api/examples', (req, res) => {
  res.json({
    title: 'RecipeShare API Examples',
    examples: {
      userRegistration: {
        request: {
          method: 'POST',
          url: '/api/auth/register',
          headers: {
            'Content-Type': 'application/json'
          },
          body: {
            username: 'dboyttt',
            email: 'dboyttt@example.com',
            password: 'SecurePass123!',
            firstName: 'DBOYttt',
            lastName: 'Developer',
            bio: 'Passionate home cook and recipe creator'
          }
        },
        response: {
          message: 'User registered successfully',
          user: {
            id: 'uuid-here',
            username: 'dboyttt',
            email: 'dboyttt@example.com',
            firstName: 'DBOYttt',
            lastName: 'Developer',
            fullName: 'DBOYttt Developer',
            bio: 'Passionate home cook and recipe creator',
            isVerified: false,
            createdAt: '2025-06-02T16:50:19.000Z'
          },
          token: 'jwt-token-here',
          expiresIn: '7d'
        }
      },
      createRecipe: {
        request: {
          method: 'POST',
          url: '/api/recipes',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer jwt-token-here'
          },
          body: {
            title: 'Classic Spaghetti Carbonara',
            description: 'A traditional Italian pasta dish with eggs, cheese, and pancetta',
            prepTimeMinutes: 15,
            cookTimeMinutes: 20,
            servings: 4,
            difficulty: 'Medium',
            instructions: [
              'Bring a large pot of salted water to boil and cook spaghetti',
              'Meanwhile, cook pancetta in a large skillet until crispy',
              'Whisk eggs and grated cheese in a bowl',
              'Drain pasta, reserving 1 cup of pasta water',
              'Add hot pasta to pancetta pan, remove from heat',
              'Quickly stir in egg mixture, adding pasta water as needed',
              'Season with black pepper and serve immediately'
            ],
            ingredients: [
              { name: 'Spaghetti', quantity: 400, unit: 'g' },
              { name: 'Pancetta', quantity: 200, unit: 'g' },
              { name: 'Large eggs', quantity: 4, unit: 'whole' },
              { name: 'Parmesan cheese', quantity: 100, unit: 'g', notes: 'freshly grated' },
              { name: 'Black pepper', quantity: 1, unit: 'tsp', notes: 'freshly ground' }
            ],
            categoryIds: [13], // Italian
            isPublic: true
          }
        },
        response: {
          message: 'Recipe created successfully',
          recipe: {
            id: 'recipe-uuid-here',
            title: 'Classic Spaghetti Carbonara',
            description: 'A traditional Italian pasta dish with eggs, cheese, and pancetta',
            prepTimeMinutes: 15,
            cookTimeMinutes: 20,
            totalTimeMinutes: 35,
            servings: 4,
            difficulty: 'Medium',
            author: {
              id: 'user-uuid-here',
              username: 'dboyttt',
              firstName: 'DBOYttt',
              lastName: 'Developer'
            },
            ingredients: [
              {
                id: 'ingredient-uuid-1',
                name: 'Spaghetti',
                quantity: 400,
                unit: 'g',
                orderIndex: 1
              }
            ],
            categories: [
              {
                id: 13,
                name: 'Italian',
                color: '#FF5722',
                icon: '🍝'
              }
            ],
            stats: {
              likesCount: 0,
              commentsCount: 0,
              averageRating: null,
              ratingsCount: 0
            },
            isLikedByUser: false,
            createdAt: '2025-06-02T16:50:19.000Z'
          }
        }
      },
      searchRecipes: {
        request: {
          method: 'GET',
          url: '/api/search/recipes?q=pasta&ingredients=tomato,cheese&difficulty=Medium&maxPrepTime=30&sort=rating',
          headers: {
            'Authorization': 'Bearer jwt-token-here'
          }
        },
        response: {
          recipes: [
            {
              id: 'recipe-uuid-here',
              title: 'Classic Spaghetti Carbonara',
              description: 'A traditional Italian pasta dish...',
              prepTimeMinutes: 15,
              cookTimeMinutes: 20,
              difficulty: 'Medium',
              stats: {
                likesCount: 24,
                averageRating: 4.5,
                ratingsCount: 12
              }
            }
          ],
          searchParams: {
            query: 'pasta',
            ingredients: 'tomato,cheese',
            difficulty: 'Medium',
            maxPrepTime: 30,
            sort: 'rating'
          },
          pagination: {
            currentPage: 1,
            limit: 10,
            hasNextPage: false
          }
        }
      }
    }
  });
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    error: 'API endpoint not found',
    message: `Cannot ${req.method} ${req.originalUrl}`,
    availableEndpoints: '/api/docs',
    timestamp: new Date().toISOString()
  });
});

// 404 handler for all other routes
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    message: `Cannot ${req.method} ${req.originalUrl}`,
    suggestion: 'Visit /api/docs for API documentation',
    timestamp: new Date().toISOString()
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('❌ Error:', err.stack);
  
  // Handle specific error types
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: 'Invalid JSON',
      message: 'Request body contains invalid JSON',
      timestamp: new Date().toISOString()
    });
  }
  
  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      error: 'Payload too large',
      message: 'Request body exceeds size limit',
      timestamp: new Date().toISOString()
    });
  }
  
  const status = err.status || err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production' 
    ? (status < 500 ? err.message : 'Internal server error')
    : err.message;
  
  res.status(status).json({
    error: status < 500 ? 'Client error' : 'Server error',
    message,
    timestamp: new Date().toISOString(),
    ...(process.env.NODE_ENV === 'development' && { 
      stack: err.stack,
      details: err 
    })
  });
});

// Graceful shutdown handler
const gracefulShutdown = (signal) => {
  console.log(`\n🛑 Received ${signal}. Graceful shutdown initiated...`);
  
  // Close server
  process.exit(0);
};

// Handle graceful shutdown
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('💥 Uncaught Exception:', err);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start server
const startServer = async () => {
  try {
    // Test database connection before starting server
    console.log('🔍 Testing database connection...');
    const dbConnected = await testConnection();
    
    if (!dbConnected) {
      console.error('❌ Failed to connect to database. Server not started.');
      process.exit(1);
    }
    
    console.log('✅ Database connection successful');

    const server = app.listen(PORT, () => {
      console.log('\n🚀 RecipeShare API Server Started Successfully!');
      console.log('=' .repeat(60));
      console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🌐 Server: http://localhost:${PORT}`);
      console.log(`🔧 Health Check: http://localhost:${PORT}/api/health`);
      console.log(`📚 Documentation: http://localhost:${PORT}/api/docs`);
      console.log(`📋 API Examples: http://localhost:${PORT}/api/examples`);
      console.log(`🏗️  Schemas: http://localhost:${PORT}/api/schemas`);
      console.log('=' .repeat(60));
      console.log('\n🎯 Available Endpoints:');
      console.log('   🔐 Authentication: /api/auth/*');
      console.log('   👤 Users: /api/users/*');
      console.log('   🍳 Recipes: /api/recipes/*');
      console.log('   📂 Categories: /api/categories/*');
      console.log('   💬 Comments: /api/recipes/:id/comments');
      console.log('   👥 Social: /api/users/:username/follow');
      console.log('   📰 Feed: /api/feed');
      console.log('   🔥 Trending: /api/trending');
      console.log('   🔔 Activity: /api/activity');
      console.log('   🛒 Shopping Lists: /api/shopping-list/*');
      console.log('   🔍 Search: /api/search/*');
      console.log('   📊 Statistics: /api/statistics/*');
      console.log('   ⭐ Collections: /api/collections/*');
      console.log('   ⚙️  Admin: /api/admin/*');
      console.log('\n✨ Ready to serve requests!');
    });

    // Handle server errors
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use`);
        process.exit(1);
      } else {
        console.error('❌ Server error:', err);
        process.exit(1);
      }
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server
startServer();

module.exports = app;