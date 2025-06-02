const { validationResult } = require('express-validator');
const { pool } = require('../config/database');

// Update user profile
const updateProfile = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array(),
        timestamp: new Date().toISOString()
      });
    }

    const userId = req.user.id;
    const {
      firstName,
      lastName,
      bio,
      location,
      website,
      profileImageUrl,
      isPublicProfile,
      allowRecipeNotifications,
      allowFollowerNotifications,
      allowCommentNotifications
    } = req.body;

    const client = await pool.connect();
    try {
      // Build dynamic update query
      const updates = [];
      const values = [];
      let paramCount = 1;

      if (firstName !== undefined) {
        updates.push(`first_name = $${paramCount}`);
        values.push(firstName);
        paramCount++;
      }
      
      if (lastName !== undefined) {
        updates.push(`last_name = $${paramCount}`);
        values.push(lastName);
        paramCount++;
      }
      
      if (bio !== undefined) {
        updates.push(`bio = $${paramCount}`);
        values.push(bio);
        paramCount++;
      }
      
      if (location !== undefined) {
        updates.push(`location = $${paramCount}`);
        values.push(location);
        paramCount++;
      }
      
      if (website !== undefined) {
        updates.push(`website = $${paramCount}`);
        values.push(website);
        paramCount++;
      }
      
      if (profileImageUrl !== undefined) {
        updates.push(`profile_image_url = $${paramCount}`);
        values.push(profileImageUrl);
        paramCount++;
      }
      
      if (isPublicProfile !== undefined) {
        updates.push(`is_public_profile = $${paramCount}`);
        values.push(isPublicProfile);
        paramCount++;
      }
      
      if (allowRecipeNotifications !== undefined) {
        updates.push(`allow_recipe_notifications = $${paramCount}`);
        values.push(allowRecipeNotifications);
        paramCount++;
      }
      
      if (allowFollowerNotifications !== undefined) {
        updates.push(`allow_follower_notifications = $${paramCount}`);
        values.push(allowFollowerNotifications);
        paramCount++;
      }
      
      if (allowCommentNotifications !== undefined) {
        updates.push(`allow_comment_notifications = $${paramCount}`);
        values.push(allowCommentNotifications);
        paramCount++;
      }

      if (updates.length === 0) {
        return res.status(400).json({
          error: 'No fields to update',
          timestamp: new Date().toISOString()
        });
      }

      // Add updated_at and user ID
      updates.push('updated_at = CURRENT_TIMESTAMP');
      values.push(userId);

      const updateQuery = `
        UPDATE users 
        SET ${updates.join(', ')}
        WHERE id = $${paramCount}
        RETURNING id, username, email, first_name, last_name, bio, profile_image_url,
                 location, website, is_public_profile, allow_recipe_notifications,
                 allow_follower_notifications, allow_comment_notifications,
                 is_verified, created_at, updated_at
      `;

      const result = await client.query(updateQuery, values);
      const updatedUser = result.rows[0];

      res.json({
        message: 'Profile updated successfully',
        user: {
          id: updatedUser.id,
          username: updatedUser.username,
          email: updatedUser.email,
          firstName: updatedUser.first_name,
          lastName: updatedUser.last_name,
          fullName: `${updatedUser.first_name} ${updatedUser.last_name}`.trim(),
          bio: updatedUser.bio,
          profileImageUrl: updatedUser.profile_image_url,
          location: updatedUser.location,
          website: updatedUser.website,
          isPublicProfile: updatedUser.is_public_profile,
          allowRecipeNotifications: updatedUser.allow_recipe_notifications,
          allowFollowerNotifications: updatedUser.allow_follower_notifications,
          allowCommentNotifications: updatedUser.allow_comment_notifications,
          isVerified: updatedUser.is_verified,
          createdAt: updatedUser.created_at,
          updatedAt: updatedUser.updated_at
        },
        timestamp: new Date().toISOString()
      });

    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ Update profile error:', error);
    res.status(500).json({
      error: 'Failed to update profile',
      message: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
};

// Get public user profile by username
const getPublicProfile = async (req, res) => {
  try {
    const { username } = req.params;
    const requestingUserId = req.user ? req.user.id : null;

    const client = await pool.connect();
    try {
      const userResult = await client.query(`
        SELECT id, username, first_name, last_name, bio, profile_image_url,
               location, website, is_public_profile, is_verified, created_at
        FROM users 
        WHERE username = $1 AND is_active = true
      `, [username.toLowerCase()]);

      if (userResult.rows.length === 0) {
        return res.status(404).json({
          error: 'User not found',
          timestamp: new Date().toISOString()
        });
      }

      const user = userResult.rows[0];

      // Check if profile is public or if it's the user's own profile
      if (!user.is_public_profile && user.id !== requestingUserId) {
        return res.status(403).json({
          error: 'Profile is private',
          timestamp: new Date().toISOString()
        });
      }

      // Get user stats
      const statsResult = await client.query(`
        SELECT 
          (SELECT COUNT(*) FROM recipes WHERE author_id = $1 AND is_public = true) as recipe_count,
          (SELECT COUNT(*) FROM user_followers WHERE following_id = $1) as followers_count,
          (SELECT COUNT(*) FROM user_followers WHERE follower_id = $1) as following_count,
          (SELECT COUNT(*) FROM recipe_likes rl 
           JOIN recipes r ON rl.recipe_id = r.id 
           WHERE r.author_id = $1 AND r.is_public = true) as total_likes
      `, [user.id]);

      const stats = statsResult.rows[0];

      // Check if requesting user is following this user
      let isFollowing = false;
      if (requestingUserId && requestingUserId !== user.id) {
        const followResult = await client.query(
          'SELECT 1 FROM user_followers WHERE follower_id = $1 AND following_id = $2',
          [requestingUserId, user.id]
        );
        isFollowing = followResult.rows.length > 0;
      }

      res.json({
        user: {
          id: user.id,
          username: user.username,
          firstName: user.first_name,
          lastName: user.last_name,
          fullName: `${user.first_name} ${user.last_name}`.trim(),
          bio: user.bio,
          profileImageUrl: user.profile_image_url,
          location: user.location,
          website: user.website,
          isVerified: user.is_verified,
          createdAt: user.created_at,
          stats: {
            recipeCount: parseInt(stats.recipe_count),
            followersCount: parseInt(stats.followers_count),
            followingCount: parseInt(stats.following_count),
            totalLikes: parseInt(stats.total_likes)
          },
          isFollowing: isFollowing,
          isOwnProfile: user.id === requestingUserId
        },
        timestamp: new Date().toISOString()
      });

    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ Get public profile error:', error);
    res.status(500).json({
      error: 'Failed to get profile',
      message: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
};

module.exports = {
  updateProfile,
  getPublicProfile
};