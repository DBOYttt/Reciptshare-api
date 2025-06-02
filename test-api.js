const axios = require('axios');
const assert = require('assert');

// Configuration
const config = {
  baseURL: process.env.API_BASE_URL || 'http://localhost:3000/api',
  timeout: 10000,
  testUser: {
    username: 'testuser_' + Date.now(),
    email: `test_${Date.now()}@example.com`,
    password: 'TestPass123!',
    firstName: 'Test',
    lastName: 'User',
    bio: 'API Test User'
  },
  testUser2: {
    username: 'testuser2_' + Date.now(),
    email: `test2_${Date.now()}@example.com`,
    password: 'TestPass123!',
    firstName: 'Test2',
    lastName: 'User2',
    bio: 'API Test User 2'
  }
};

// Test results tracking
const testResults = {
  passed: 0,
  failed: 0,
  errors: []
};

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

// Utility functions
const log = (message, color = colors.white) => {
  console.log(`${color}${message}${colors.reset}`);
};

const logSuccess = (message) => log(`✅ ${message}`, colors.green);
const logError = (message) => log(`❌ ${message}`, colors.red);
const logInfo = (message) => log(`ℹ️  ${message}`, colors.blue);
const logWarning = (message) => log(`⚠️  ${message}`, colors.yellow);
const logSection = (message) => log(`\n🔹 ${message}`, colors.cyan);

// HTTP client setup
const client = axios.create({
  baseURL: config.baseURL,
  timeout: config.timeout,
  validateStatus: () => true // Don't throw on any status code
});

// Test assertion helper
const test = async (name, testFn) => {
  try {
    await testFn();
    testResults.passed++;
    logSuccess(name);
  } catch (error) {
    testResults.failed++;
    testResults.errors.push({ test: name, error: error.message });
    logError(`${name} - ${error.message}`);
  }
};

// Global test data storage
const testData = {
  user1Token: null,
  user2Token: null,
  user1Id: null,
  user2Id: null,
  recipeId: null,
  commentId: null,
  categoryId: null,
  shoppingListItemId: null
};

// Test functions
const testHealthCheck = async () => {
  logSection('Health Check Tests');
  
  await test('Server health check', async () => {
    const response = await client.get('/health');
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.data.status, 'healthy');
    assert(response.data.database);
  });

  await test('API documentation endpoint', async () => {
    const response = await client.get('/docs');
    assert.strictEqual(response.status, 200);
    assert(response.data.title);
    assert(response.data.endpoints);
  });
};

const testAuthentication = async () => {
  logSection('Authentication Tests');

  // Test user registration
  await test('User registration', async () => {
    const response = await client.post('/auth/register', config.testUser);
    assert.strictEqual(response.status, 201);
    assert(response.data.token);
    assert.strictEqual(response.data.user.username, config.testUser.username);
    testData.user1Token = response.data.token;
    testData.user1Id = response.data.user.id;
  });

  // Test second user registration
  await test('Second user registration', async () => {
    const response = await client.post('/auth/register', config.testUser2);
    assert.strictEqual(response.status, 201);
    assert(response.data.token);
    testData.user2Token = response.data.token;
    testData.user2Id = response.data.user.id;
  });

  // Test duplicate registration
  await test('Duplicate registration rejection', async () => {
    const response = await client.post('/auth/register', config.testUser);
    assert.strictEqual(response.status, 409);
  });

  // Test user login
  await test('User login', async () => {
    const response = await client.post('/auth/login', {
      emailOrUsername: config.testUser.username,
      password: config.testUser.password
    });
    assert.strictEqual(response.status, 200);
    assert(response.data.token);
  });

  // Test invalid login
  await test('Invalid login rejection', async () => {
    const response = await client.post('/auth/login', {
      emailOrUsername: config.testUser.username,
      password: 'wrongpassword'
    });
    assert.strictEqual(response.status, 401);
  });

  // Test token verification
  await test('Token verification', async () => {
    const response = await client.get('/auth/verify', {
      headers: { Authorization: `Bearer ${testData.user1Token}` }
    });
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.data.user.id, testData.user1Id);
  });

  // Test profile retrieval
  await test('Get user profile', async () => {
    const response = await client.get('/auth/profile', {
      headers: { Authorization: `Bearer ${testData.user1Token}` }
    });
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.data.user.username, config.testUser.username);
  });
};

const testCategories = async () => {
  logSection('Categories Tests');

  await test('Get all categories', async () => {
    const response = await client.get('/categories');
    assert.strictEqual(response.status, 200);
    assert(Array.isArray(response.data.categories));
    assert(response.data.categories.length > 0);
    testData.categoryId = response.data.categories[0].id;
  });

  await test('Get single category', async () => {
    const response = await client.get(`/categories/${testData.categoryId}`);
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.data.category.id, testData.categoryId);
  });
};

const testRecipes = async () => {
  logSection('Recipe Management Tests');

  const recipeData = {
    title: 'Test Recipe API',
    description: 'A test recipe created by the API test suite for validation purposes',
    prepTimeMinutes: 15,
    cookTimeMinutes: 30,
    servings: 4,
    difficulty: 'Medium',
    instructions: [
      'Prepare all ingredients',
      'Mix ingredients together',
      'Cook for specified time',
      'Serve and enjoy'
    ],
    ingredients: [
      { name: 'Test Ingredient 1', quantity: 2, unit: 'cups' },
      { name: 'Test Ingredient 2', quantity: 1, unit: 'tablespoon' },
      { name: 'Test Ingredient 3', quantity: 500, unit: 'grams' }
    ],
    categoryIds: [testData.categoryId],
    isPublic: true
  };

  // Create recipe
  await test('Create recipe', async () => {
    const response = await client.post('/recipes', recipeData, {
      headers: { Authorization: `Bearer ${testData.user1Token}` }
    });
    assert.strictEqual(response.status, 201);
    assert(response.data.recipe.id);
    assert.strictEqual(response.data.recipe.title, recipeData.title);
    assert.strictEqual(response.data.recipe.ingredients.length, 3);
    testData.recipeId = response.data.recipe.id;
  });

  // Get all recipes
  await test('Get recipes list', async () => {
    const response = await client.get('/recipes');
    assert.strictEqual(response.status, 200);
    assert(Array.isArray(response.data.recipes));
    assert(response.data.pagination);
  });

  // Get single recipe
  await test('Get single recipe', async () => {
    const response = await client.get(`/recipes/${testData.recipeId}`);
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.data.recipe.id, testData.recipeId);
    assert.strictEqual(response.data.recipe.title, recipeData.title);
  });

  // Update recipe
  await test('Update recipe', async () => {
    const updateData = {
      ...recipeData,
      title: 'Updated Test Recipe API',
      description: 'Updated description for the test recipe'
    };
    
    const response = await client.put(`/recipes/${testData.recipeId}`, updateData, {
      headers: { Authorization: `Bearer ${testData.user1Token}` }
    });
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.data.recipe.title, updateData.title);
  });

  // Test recipe filters
  await test('Filter recipes by difficulty', async () => {
    const response = await client.get('/recipes?difficulty=Medium');
    assert.strictEqual(response.status, 200);
    assert(Array.isArray(response.data.recipes));
  });

  // Test recipe search
  await test('Search recipes', async () => {
    const response = await client.get('/recipes?search=Test');
    assert.strictEqual(response.status, 200);
    assert(Array.isArray(response.data.recipes));
  });
};

const testRecipeInteractions = async () => {
  logSection('Recipe Interactions Tests');

  // Like recipe
  await test('Like recipe', async () => {
    const response = await client.post(`/recipes/${testData.recipeId}/like`, {}, {
      headers: { Authorization: `Bearer ${testData.user2Token}` }
    });
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.data.isLiked, true);
    assert.strictEqual(response.data.likesCount, 1);
  });

  // Unlike recipe
  await test('Unlike recipe', async () => {
    const response = await client.post(`/recipes/${testData.recipeId}/like`, {}, {
      headers: { Authorization: `Bearer ${testData.user2Token}` }
    });
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.data.isLiked, false);
    assert.strictEqual(response.data.likesCount, 0);
  });

  // Rate recipe
  await test('Rate recipe', async () => {
    const response = await client.post(`/recipes/${testData.recipeId}/rate`, {
      rating: 5,
      review: 'Excellent test recipe!'
    }, {
      headers: { Authorization: `Bearer ${testData.user2Token}` }
    });
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.data.rating.rating, 5);
  });

  // Get recipe ratings
  await test('Get recipe ratings', async () => {
    const response = await client.get(`/recipes/${testData.recipeId}/ratings`);
    assert.strictEqual(response.status, 200);
    assert(Array.isArray(response.data.ratings));
    assert(response.data.ratings.length > 0);
  });

  // Update rating
  await test('Update recipe rating', async () => {
    const response = await client.post(`/recipes/${testData.recipeId}/rate`, {
      rating: 4,
      review: 'Updated: Very good test recipe!'
    }, {
      headers: { Authorization: `Bearer ${testData.user2Token}` }
    });
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.data.rating.rating, 4);
  });
};

const testComments = async () => {
  logSection('Comments Tests');

  // Create comment
  await test('Create comment', async () => {
    const response = await client.post(`/recipes/${testData.recipeId}/comments`, {
      comment: 'This is a test comment for the API test suite'
    }, {
      headers: { Authorization: `Bearer ${testData.user2Token}` }
    });
    assert.strictEqual(response.status, 201);
    assert(response.data.comment.id);
    testData.commentId = response.data.comment.id;
  });

  // Get comments
  await test('Get recipe comments', async () => {
    const response = await client.get(`/recipes/${testData.recipeId}/comments`);
    assert.strictEqual(response.status, 200);
    assert(Array.isArray(response.data.comments));
    assert(response.data.comments.length > 0);
  });

  // Update comment
  await test('Update comment', async () => {
    const response = await client.put(`/comments/${testData.commentId}`, {
      comment: 'This is an updated test comment'
    }, {
      headers: { Authorization: `Bearer ${testData.user2Token}` }
    });
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.data.comment.isEdited, true);
  });

  // Create reply comment
  await test('Create reply comment', async () => {
    const response = await client.post(`/recipes/${testData.recipeId}/comments`, {
      comment: 'This is a reply to the test comment',
      parentCommentId: testData.commentId
    }, {
      headers: { Authorization: `Bearer ${testData.user1Token}` }
    });
    assert.strictEqual(response.status, 201);
    assert.strictEqual(response.data.comment.parentCommentId, testData.commentId);
  });
};

const testSocialFeatures = async () => {
  logSection('Social Features Tests');

  // Follow user
  await test('Follow user', async () => {
    const response = await client.post(`/users/${config.testUser.username}/follow`, {}, {
      headers: { Authorization: `Bearer ${testData.user2Token}` }
    });
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.data.isFollowing, true);
  });

  // Get followers
  await test('Get user followers', async () => {
    const response = await client.get(`/users/${config.testUser.username}/followers`);
    assert.strictEqual(response.status, 200);
    assert(Array.isArray(response.data.followers));
    assert(response.data.followers.length > 0);
  });

  // Get following
  await test('Get user following', async () => {
    const response = await client.get(`/users/${config.testUser2.username}/following`);
    assert.strictEqual(response.status, 200);
    assert(Array.isArray(response.data.following));
    assert(response.data.following.length > 0);
  });

  // Get follow suggestions
  await test('Get follow suggestions', async () => {
    const response = await client.get('/suggestions', {
      headers: { Authorization: `Bearer ${testData.user1Token}` }
    });
    assert.strictEqual(response.status, 200);
    assert(Array.isArray(response.data.suggestions));
  });

  // Unfollow user
  await test('Unfollow user', async () => {
    const response = await client.post(`/users/${config.testUser.username}/follow`, {}, {
      headers: { Authorization: `Bearer ${testData.user2Token}` }
    });
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.data.isFollowing, false);
  });
};

const testFeeds = async () => {
  logSection('Feeds Tests');

  // Get personal feed
  await test('Get personal feed', async () => {
    const response = await client.get('/feed', {
      headers: { Authorization: `Bearer ${testData.user1Token}` }
    });
    assert.strictEqual(response.status, 200);
    assert(Array.isArray(response.data.feed));
  });

  // Get trending recipes
  await test('Get trending recipes', async () => {
    const response = await client.get('/trending');
    assert.strictEqual(response.status, 200);
    assert(Array.isArray(response.data.trendingRecipes));
  });

  // Get user activity
  await test('Get user activity', async () => {
    const response = await client.get('/activity', {
      headers: { Authorization: `Bearer ${testData.user1Token}` }
    });
    assert.strictEqual(response.status, 200);
    assert(Array.isArray(response.data.activities));
  });
};

const testShoppingList = async () => {
  logSection('Shopping List Tests');

  // Get empty shopping list
  await test('Get shopping list', async () => {
    const response = await client.get('/shopping-list', {
      headers: { Authorization: `Bearer ${testData.user1Token}` }
    });
    assert.strictEqual(response.status, 200);
    assert(Array.isArray(response.data.items));
    assert(response.data.stats);
  });

  // Add item to shopping list
  await test('Add shopping list item', async () => {
    const response = await client.post('/shopping-list/items', {
      ingredientName: 'Test Shopping Item',
      quantity: 2,
      unit: 'pieces',
      notes: 'Added by API test'
    }, {
      headers: { Authorization: `Bearer ${testData.user1Token}` }
    });
    assert.strictEqual(response.status, 201);
    assert(response.data.item.id);
    testData.shoppingListItemId = response.data.item.id;
  });

  // Add recipe to shopping list
  await test('Add recipe to shopping list', async () => {
    const response = await client.post(`/shopping-list/recipes/${testData.recipeId}`, {
      servingMultiplier: 2
    }, {
      headers: { Authorization: `Bearer ${testData.user1Token}` }
    });
    assert.strictEqual(response.status, 201);
    assert(Array.isArray(response.data.addedItems));
    assert(response.data.addedItems.length > 0);
  });

  // Update shopping list item
  await test('Update shopping list item', async () => {
    const response = await client.put(`/shopping-list/items/${testData.shoppingListItemId}`, {
      isCompleted: true,
      notes: 'Updated by API test'
    }, {
      headers: { Authorization: `Bearer ${testData.user1Token}` }
    });
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.data.item.isCompleted, true);
  });

  // Get shopping list with completed items
  await test('Get shopping list with filters', async () => {
    const response = await client.get('/shopping-list?completed=true', {
      headers: { Authorization: `Bearer ${testData.user1Token}` }
    });
    assert.strictEqual(response.status, 200);
    assert(response.data.items.length > 0);
  });
};

const testSearch = async () => {
  logSection('Search Tests');

  // Global search
  await test('Global search', async () => {
    const response = await client.get('/search?q=test');
    assert.strictEqual(response.status, 200);
    assert(response.data.results);
  });

  // Search recipes
  await test('Search recipes by title', async () => {
    const response = await client.get('/search?q=test&type=recipes');
    assert.strictEqual(response.status, 200);
    assert(response.data.results.recipes);
  });

  // Advanced recipe search
  await test('Advanced recipe search', async () => {
    const response = await client.get('/search/recipes?q=test&difficulty=Medium&maxPrepTime=60');
    assert.strictEqual(response.status, 200);
    assert(Array.isArray(response.data.recipes));
  });

  // Search users
  await test('Search users', async () => {
    const response = await client.get(`/search?q=${config.testUser.username}&type=users`);
    assert.strictEqual(response.status, 200);
    assert(response.data.results.users);
  });
};

const testStatistics = async () => {
  logSection('Statistics Tests');

  // Platform statistics
  await test('Get platform statistics', async () => {
    const response = await client.get('/statistics/platform');
    assert.strictEqual(response.status, 200);
    assert(response.data.platformStats);
    assert(typeof response.data.platformStats.totalUsers === 'number');
  });

  // User statistics
  await test('Get user statistics', async () => {
    const response = await client.get('/statistics/user', {
      headers: { Authorization: `Bearer ${testData.user1Token}` }
    });
    assert.strictEqual(response.status, 200);
    assert(response.data.recipeStats);
    assert(response.data.engagementStats);
  });
};

const testCollections = async () => {
  logSection('Collections Tests');

  // Like recipe first for favorites test
  await client.post(`/recipes/${testData.recipeId}/like`, {}, {
    headers: { Authorization: `Bearer ${testData.user1Token}` }
  });

  // Get favorite recipes
  await test('Get favorite recipes', async () => {
    const response = await client.get('/collections/favorites', {
      headers: { Authorization: `Bearer ${testData.user1Token}` }
    });
    assert.strictEqual(response.status, 200);
    assert(Array.isArray(response.data.favoriteRecipes));
  });

  // Get recipe history
  await test('Get recipe history', async () => {
    const response = await client.get('/collections/history', {
      headers: { Authorization: `Bearer ${testData.user2Token}` }
    });
    assert.strictEqual(response.status, 200);
    assert(Array.isArray(response.data.recipeHistory));
  });
};

const testUserProfile = async () => {
  logSection('User Profile Tests');

  // Update user profile
  await test('Update user profile', async () => {
    const response = await client.put('/users/profile', {
      firstName: 'Updated Test',
      bio: 'Updated bio from API test',
      location: 'Test City'
    }, {
      headers: { Authorization: `Bearer ${testData.user1Token}` }
    });
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.data.user.firstName, 'Updated Test');
  });

  // Get public user profile
  await test('Get public user profile', async () => {
    const response = await client.get(`/users/${config.testUser.username}`);
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.data.user.username, config.testUser.username);
    assert(response.data.user.stats);
  });
};

const testErrorHandling = async () => {
  logSection('Error Handling Tests');

  // Test 404 for non-existent recipe
  await test('404 for non-existent recipe', async () => {
    const response = await client.get('/recipes/non-existent-id');
    assert.strictEqual(response.status, 404);
  });

  // Test 401 for unauthorized access
  await test('401 for unauthorized access', async () => {
    const response = await client.post('/recipes', {
      title: 'Unauthorized Recipe'
    });
    assert.strictEqual(response.status, 401);
  });

  // Test 400 for invalid data
  await test('400 for invalid recipe data', async () => {
    const response = await client.post('/recipes', {
      title: '', // Invalid empty title
      description: 'short' // Too short description
    }, {
      headers: { Authorization: `Bearer ${testData.user1Token}` }
    });
    assert.strictEqual(response.status, 400);
  });
};

const cleanup = async () => {
  logSection('Cleanup');

  // Delete shopping list items
  if (testData.shoppingListItemId) {
    await client.delete(`/shopping-list/items/${testData.shoppingListItemId}`, {
      headers: { Authorization: `Bearer ${testData.user1Token}` }
    });
  }

  // Delete comment
  if (testData.commentId) {
    await client.delete(`/comments/${testData.commentId}`, {
      headers: { Authorization: `Bearer ${testData.user2Token}` }
    });
  }

  // Delete recipe
  if (testData.recipeId) {
    await client.delete(`/recipes/${testData.recipeId}`, {
      headers: { Authorization: `Bearer ${testData.user1Token}` }
    });
  }

  logInfo('Cleanup completed');
};

// Main test runner
const runTests = async () => {
  const startTime = Date.now();
  
  log('\n🧪 RecipeShare API Test Suite Starting...', colors.magenta);
  log('=' .repeat(60), colors.cyan);
  log(`Base URL: ${config.baseURL}`, colors.yellow);
  log(`Start Time: ${new Date().toISOString()}`, colors.yellow);
  log('=' .repeat(60), colors.cyan);

  try {
    await testHealthCheck();
    await testAuthentication();
    await testCategories();
    await testRecipes();
    await testRecipeInteractions();
    await testComments();
    await testSocialFeatures();
    await testFeeds();
    await testShoppingList();
    await testSearch();
    await testStatistics();
    await testCollections();
    await testUserProfile();
    await testErrorHandling();
    await cleanup();

  } catch (error) {
    logError(`Fatal error: ${error.message}`);
    testResults.failed++;
  }

  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2);

  // Print final results
  log('\n📊 Test Results Summary', colors.magenta);
  log('=' .repeat(60), colors.cyan);
  log(`✅ Passed: ${testResults.passed}`, colors.green);
  log(`❌ Failed: ${testResults.failed}`, colors.red);
  log(`⏱️  Duration: ${duration}s`, colors.yellow);
  log(`📅 Completed: ${new Date().toISOString()}`, colors.yellow);

  if (testResults.failed > 0) {
    log('\n🔍 Failed Tests:', colors.red);
    testResults.errors.forEach((error, index) => {
      log(`${index + 1}. ${error.test}: ${error.error}`, colors.red);
    });
  }

  const successRate = ((testResults.passed / (testResults.passed + testResults.failed)) * 100).toFixed(1);
  log(`\n🎯 Success Rate: ${successRate}%`, successRate > 90 ? colors.green : colors.yellow);
  
  if (testResults.failed === 0) {
    log('\n🎉 All tests passed! Your API is working perfectly! 🚀', colors.green);
  } else {
    log('\n⚠️  Some tests failed. Please check the API implementation.', colors.yellow);
  }

  log('=' .repeat(60), colors.cyan);
  
  // Exit with appropriate code
  process.exit(testResults.failed > 0 ? 1 : 0);
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logError(`Unhandled Rejection: ${reason}`);
  process.exit(1);
});

// Run the tests
if (require.main === module) {
  runTests();
}

module.exports = { runTests, testData, config };