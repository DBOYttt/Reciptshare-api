const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const { pool } = require('../config/database');
const { generateUUID } = require('../config/schema');

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

// User registration
const register = async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array(),
        timestamp: new Date().toISOString()
      });
    }

    const {
      username,
      email,
      password,
      firstName,
      lastName,
      bio = '',
      profileImageUrl = ''
    } = req.body;

    const client = await pool.connect();
    try {
      // Check if user already exists
      const existingUser = await client.query(
        'SELECT id FROM users WHERE email = $1 OR username = $2',
        [email.toLowerCase(), username.toLowerCase()]
      );

      if (existingUser.rows.length > 0) {
        return res.status(409).json({
          error: 'User already exists',
          message: 'Email or username is already taken',
          timestamp: new Date().toISOString()
        });
      }

      // Hash password
      const saltRounds = 12;
      const passwordHash = await bcrypt.hash(password, saltRounds);

      // Create user
      const userId = generateUUID();
      const insertResult = await client.query(`
        INSERT INTO users (
          id, username, email, password_hash, first_name, last_name, bio, profile_image_url
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, username, email, first_name, last_name, bio, profile_image_url, 
                 is_public_profile, is_verified, created_at
      `, [
        userId,
        username.toLowerCase(),
        email.toLowerCase(),
        passwordHash,
        firstName,
        lastName || '',
        bio,
        profileImageUrl
      ]);

      const newUser = insertResult.rows[0];

      // Generate token
      const token = generateToken(newUser.id);

      res.status(201).json({
        message: 'User registered successfully',
        user: {
          id: newUser.id,
          username: newUser.username,
          email: newUser.email,
          firstName: newUser.first_name,
          lastName: newUser.last_name,
          fullName: `${newUser.first_name} ${newUser.last_name}`.trim(),
          bio: newUser.bio,
          profileImageUrl: newUser.profile_image_url,
          isPublicProfile: newUser.is_public_profile,
          isVerified: newUser.is_verified,
          createdAt: newUser.created_at
        },
        token,
        expiresIn: process.env.JWT_EXPIRES_IN || '7d',
        timestamp: new Date().toISOString()
      });

    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ Registration error:', error);
    res.status(500).json({
      error: 'Registration failed',
      message: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
};

// User login
const login = async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array(),
        timestamp: new Date().toISOString()
      });
    }

    const { emailOrUsername, password } = req.body;

    const client = await pool.connect();
    try {
      // Find user by email or username
      const userResult = await client.query(`
        SELECT id, username, email, password_hash, first_name, last_name, bio, 
               profile_image_url, is_public_profile, is_verified, is_active
        FROM users 
        WHERE (email = $1 OR username = $1) AND is_active = true
      `, [emailOrUsername.toLowerCase()]);

      if (userResult.rows.length === 0) {
        return res.status(401).json({
          error: 'Invalid credentials',
          message: 'Email/username or password is incorrect',
          timestamp: new Date().toISOString()
        });
      }

      const user = userResult.rows[0];

      // Check password
      const isPasswordValid = await bcrypt.compare(password, user.password_hash);
      if (!isPasswordValid) {
        return res.status(401).json({
          error: 'Invalid credentials',
          message: 'Email/username or password is incorrect',
          timestamp: new Date().toISOString()
        });
      }

      // Generate token
      const token = generateToken(user.id);

      res.json({
        message: 'Login successful',
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          fullName: `${user.first_name} ${user.last_name}`.trim(),
          bio: user.bio,
          profileImageUrl: user.profile_image_url,
          isPublicProfile: user.is_public_profile,
          isVerified: user.is_verified
        },
        token,
        expiresIn: process.env.JWT_EXPIRES_IN || '7d',
        timestamp: new Date().toISOString()
      });

    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({
      error: 'Login failed',
      message: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
};

// Get current user profile
const getProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    const client = await pool.connect();
    try {
      const userResult = await client.query(`
        SELECT id, username, email, first_name, last_name, bio, profile_image_url,
               location, website, is_public_profile, allow_recipe_notifications,
               allow_follower_notifications, allow_comment_notifications,
               is_verified, created_at, updated_at
        FROM users 
        WHERE id = $1
      `, [userId]);

      if (userResult.rows.length === 0) {
        return res.status(404).json({
          error: 'User not found',
          timestamp: new Date().toISOString()
        });
      }

      const user = userResult.rows[0];

      // Get user stats
      const statsResult = await client.query(`
        SELECT 
          (SELECT COUNT(*) FROM recipes WHERE author_id = $1) as recipe_count,
          (SELECT COUNT(*) FROM user_followers WHERE following_id = $1) as followers_count,
          (SELECT COUNT(*) FROM user_followers WHERE follower_id = $1) as following_count,
          (SELECT COUNT(*) FROM recipe_likes rl 
           JOIN recipes r ON rl.recipe_id = r.id 
           WHERE r.author_id = $1) as total_likes
      `, [userId]);

      const stats = statsResult.rows[0];

      res.json({
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          fullName: `${user.first_name} ${user.last_name}`.trim(),
          bio: user.bio,
          profileImageUrl: user.profile_image_url,
          location: user.location,
          website: user.website,
          isPublicProfile: user.is_public_profile,
          allowRecipeNotifications: user.allow_recipe_notifications,
          allowFollowerNotifications: user.allow_follower_notifications,
          allowCommentNotifications: user.allow_comment_notifications,
          isVerified: user.is_verified,
          createdAt: user.created_at,
          updatedAt: user.updated_at,
          stats: {
            recipeCount: parseInt(stats.recipe_count),
            followersCount: parseInt(stats.followers_count),
            followingCount: parseInt(stats.following_count),
            totalLikes: parseInt(stats.total_likes)
          }
        },
        timestamp: new Date().toISOString()
      });

    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ Get profile error:', error);
    res.status(500).json({
      error: 'Failed to get profile',
      message: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
};

// Change password
const changePassword = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array(),
        timestamp: new Date().toISOString()
      });
    }

    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    const client = await pool.connect();
    try {
      // Get current password hash
      const userResult = await client.query(
        'SELECT password_hash FROM users WHERE id = $1',
        [userId]
      );

      const user = userResult.rows[0];

      // Verify current password
      const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password_hash);
      if (!isCurrentPasswordValid) {
        return res.status(400).json({
          error: 'Invalid current password',
          timestamp: new Date().toISOString()
        });
      }

      // Hash new password
      const saltRounds = 12;
      const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

      // Update password
      await client.query(
        'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [newPasswordHash, userId]
      );

      res.json({
        message: 'Password changed successfully',
        timestamp: new Date().toISOString()
      });

    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ Change password error:', error);
    res.status(500).json({
      error: 'Failed to change password',
      message: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
};

module.exports = {
  register,
  login,
  getProfile,
  changePassword
};