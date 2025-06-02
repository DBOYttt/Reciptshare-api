// Test each import individually to find the issue

console.log('Testing imports...');

try {
  console.log('1. Testing feedController...');
  const feedController = require('./src/controllers/feedController');
  console.log('✅ feedController:', Object.keys(feedController));
} catch (error) {
  console.log('❌ feedController error:', error.message);
}

try {
  console.log('2. Testing commentValidation...');
  const commentValidation = require('./src/middleware/commentValidation');
  console.log('✅ commentValidation:', Object.keys(commentValidation));
} catch (error) {
  console.log('❌ commentValidation error:', error.message);
}

try {
  console.log('3. Testing auth middleware...');
  const auth = require('./src/middleware/auth');
  console.log('✅ auth:', Object.keys(auth));
} catch (error) {
  console.log('❌ auth error:', error.message);
}

try {
  console.log('4. Testing feed routes...');
  const feedRoutes = require('./src/routes/feed');
  console.log('✅ feedRoutes loaded successfully');
} catch (error) {
  console.log('❌ feedRoutes error:', error.message);
}

console.log('Import test completed');