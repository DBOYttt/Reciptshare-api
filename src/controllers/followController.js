const { pool } = require('../config/database');

// Follow/unfollow a user
const toggleFollow = async (req, res) => {
  try {
    const { username } = req.params;
    const followerId = req.user.id;

    const client = await pool.connect();
    try {
      // Get the user to follow
      const userResult = await client.query(
        'SELECT id, username, first_name, last_name FROM users WHERE username = $1 AND is_active = true',
        [username.toLowerCase()]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({
          error: 'User not found',
          timestamp: new Date().toISOString()
        });
      }

      const userToFollow = userResult.rows[0];

      // Can't follow yourself
      if (userToFollow.id === followerId) {
        return res.status(400).json({
          error: 'Invalid operation',
          message: 'You cannot follow yourself',
          timestamp: new Date().toISOString()
        });
      }

      // Check if already following
      const existingFollow = await client.query(
        'SELECT 1 FROM user_followers WHERE follower_id = $1 AND following_id = $2',
        [followerId, userToFollow.id]
      );

      let isFollowing;
      let message;

      if (existingFollow.rows.length > 0) {
        // Unfollow
        await client.query(
          'DELETE FROM user_followers WHERE follower_id = $1 AND following_id = $2',
          [followerId, userToFollow.id]
        );
        isFollowing = false;
        message = `You are no longer following ${userToFollow.username}`;
      } else {
        // Follow
        await client.query(
          'INSERT INTO user_followers (follower_id, following_id) VALUES ($1, $2)',
          [followerId, userToFollow.id]
        );
        isFollowing = true;
        message = `You are now following ${userToFollow.username}`;
      }

      // Get updated follower counts
      const statsResult = await client.query(`
        SELECT 
          (SELECT COUNT(*) FROM user_followers WHERE following_id = $1) as followers_count,
          (SELECT COUNT(*) FROM user_followers WHERE follower_id = $1) as following_count
        FROM users WHERE id = $1
      `, [userToFollow.id]);

      const stats = statsResult.rows[0];

      res.json({
        message,
        user: {
          id: userToFollow.id,
          username: userToFollow.username,
          firstName: userToFollow.first_name,
          lastName: userToFollow.last_name,
          fullName: `${userToFollow.first_name} ${userToFollow.last_name}`.trim()
        },
        isFollowing,
        stats: {
          followersCount: parseInt(stats.followers_count),
          followingCount: parseInt(stats.following_count)
        },
        timestamp: new Date().toISOString()
      });

    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ Toggle follow error:', error);
    res.status(500).json({
      error: 'Failed to toggle follow',
      message: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
};

// Get user's followers
const getUserFollowers = async (req, res) => {
  try {
    const { username } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const requestingUserId = req.user ? req.user.id : null;

    const client = await pool.connect();
    try {
      // Get the user
      const userResult = await client.query(
        'SELECT id, username, is_public_profile FROM users WHERE username = $1 AND is_active = true',
        [username.toLowerCase()]
      );

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

      // Get followers
      const followersResult = await client.query(`
        SELECT 
          u.id, u.username, u.first_name, u.last_name, u.profile_image_url, u.bio, u.is_verified,
          uf.created_at as followed_at,
          CASE WHEN $3 IS NOT NULL THEN 
            EXISTS(SELECT 1 FROM user_followers WHERE follower_id = $3 AND following_id = u.id)
          ELSE false END as is_following_back
        FROM user_followers uf
        JOIN users u ON uf.follower_id = u.id
        WHERE uf.following_id = $1 AND u.is_active = true
        ORDER BY uf.created_at DESC
        LIMIT $2 OFFSET $4
      `, [user.id, parseInt(limit), requestingUserId, offset]);

      // Get total count
      const countResult = await client.query(
        'SELECT COUNT(*) as total FROM user_followers uf JOIN users u ON uf.follower_id = u.id WHERE uf.following_id = $1 AND u.is_active = true',
        [user.id]
      );

      const totalFollowers = parseInt(countResult.rows[0].total);
      const totalPages = Math.ceil(totalFollowers / parseInt(limit));

      const followers = followersResult.rows.map(follower => ({
        id: follower.id,
        username: follower.username,
        firstName: follower.first_name,
        lastName: follower.last_name,
        fullName: `${follower.first_name} ${follower.last_name}`.trim(),
        profileImageUrl: follower.profile_image_url,
        bio: follower.bio,
        isVerified: follower.is_verified,
        followedAt: follower.followed_at,
        isFollowingBack: follower.is_following_back
      }));

      res.json({
        user: {
          id: user.id,
          username: user.username
        },
        followers,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalFollowers,
          limit: parseInt(limit),
          hasNextPage: parseInt(page) < totalPages,
          hasPrevPage: parseInt(page) > 1
        },
        timestamp: new Date().toISOString()
      });

    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ Get user followers error:', error);
    res.status(500).json({
      error: 'Failed to get followers',
      message: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
};

// Get user's following
const getUserFollowing = async (req, res) => {
  try {
    const { username } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const requestingUserId = req.user ? req.user.id : null;

    const client = await pool.connect();
    try {
      // Get the user
      const userResult = await client.query(
        'SELECT id, username, is_public_profile FROM users WHERE username = $1 AND is_active = true',
        [username.toLowerCase()]
      );

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

      // Get following
      const followingResult = await client.query(`
        SELECT 
          u.id, u.username, u.first_name, u.last_name, u.profile_image_url, u.bio, u.is_verified,
          uf.created_at as followed_at,
          CASE WHEN $3 IS NOT NULL THEN 
            EXISTS(SELECT 1 FROM user_followers WHERE follower_id = $3 AND following_id = u.id)
          ELSE false END as is_following
        FROM user_followers uf
        JOIN users u ON uf.following_id = u.id
        WHERE uf.follower_id = $1 AND u.is_active = true
        ORDER BY uf.created_at DESC
        LIMIT $2 OFFSET $4
      `, [user.id, parseInt(limit), requestingUserId, offset]);

      // Get total count
      const countResult = await client.query(
        'SELECT COUNT(*) as total FROM user_followers uf JOIN users u ON uf.following_id = u.id WHERE uf.follower_id = $1 AND u.is_active = true',
        [user.id]
      );

      const totalFollowing = parseInt(countResult.rows[0].total);
      const totalPages = Math.ceil(totalFollowing / parseInt(limit));

      const following = followingResult.rows.map(followedUser => ({
        id: followedUser.id,
        username: followedUser.username,
        firstName: followedUser.first_name,
        lastName: followedUser.last_name,
        fullName: `${followedUser.first_name} ${followedUser.last_name}`.trim(),
        profileImageUrl: followedUser.profile_image_url,
        bio: followedUser.bio,
        isVerified: followedUser.is_verified,
        followedAt: followedUser.followed_at,
        isFollowing: followedUser.is_following
      }));

      res.json({
        user: {
          id: user.id,
          username: user.username
        },
        following,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalFollowing,
          limit: parseInt(limit),
          hasNextPage: parseInt(page) < totalPages,
          hasPrevPage: parseInt(page) > 1
        },
        timestamp: new Date().toISOString()
      });

    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ Get user following error:', error);
    res.status(500).json({
      error: 'Failed to get following',
      message: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
};

// Get follow suggestions for a user
const getFollowSuggestions = async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const userId = req.user.id;

    const client = await pool.connect();
    try {
      // Get suggested users (users not already followed, with public profiles, ordered by recipe count)
      const suggestionsResult = await client.query(`
        SELECT 
          u.id, u.username, u.first_name, u.last_name, u.profile_image_url, u.bio, u.is_verified,
          (SELECT COUNT(*) FROM recipes WHERE author_id = u.id AND is_public = true) as recipe_count,
          (SELECT COUNT(*) FROM user_followers WHERE following_id = u.id) as followers_count
        FROM users u
        WHERE u.id != $1 
          AND u.is_active = true 
          AND u.is_public_profile = true
          AND NOT EXISTS (
            SELECT 1 FROM user_followers 
            WHERE follower_id = $1 AND following_id = u.id
          )
        ORDER BY 
          (SELECT COUNT(*) FROM recipes WHERE author_id = u.id AND is_public = true) DESC,
          (SELECT COUNT(*) FROM user_followers WHERE following_id = u.id) DESC
        LIMIT $2
      `, [userId, parseInt(limit)]);

      const suggestions = suggestionsResult.rows.map(user => ({
        id: user.id,
        username: user.username,
        firstName: user.first_name,
        lastName: user.last_name,
        fullName: `${user.first_name} ${user.last_name}`.trim(),
        profileImageUrl: user.profile_image_url,
        bio: user.bio,
        isVerified: user.is_verified,
        stats: {
          recipeCount: parseInt(user.recipe_count),
          followersCount: parseInt(user.followers_count)
        }
      }));

      res.json({
        suggestions,
        totalSuggestions: suggestions.length,
        timestamp: new Date().toISOString()
      });

    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ Get follow suggestions error:', error);
    res.status(500).json({
      error: 'Failed to get follow suggestions',
      message: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
};

module.exports = {
  toggleFollow,
  getUserFollowers,
  getUserFollowing,
  getFollowSuggestions
};