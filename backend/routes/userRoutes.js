const express = require('express');
const {
  getUserProfile,
  getLeaderboard,
  getUserStats,
  searchUsers
} = require('../controllers/userController');
const { protect, optionalAuth } = require('../middleware/authMiddleware');

const router = express.Router();

// Public routes
router.get('/search', searchUsers);
router.get('/leaderboard', getLeaderboard);
router.get('/:id', getUserProfile);

// Private routes
router.use(protect); // Protect all routes below
router.get('/me/stats', getUserStats);

module.exports = router;