const express = require('express');
const {
  register,
  login,
  getMe,
  updateProfile,
  changePassword,
  logout
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// Public routes
router.post('/register', register);
router.post('/login', login);

// Private routes
router.use(protect); // Protect all routes below
router.get('/me', getMe);
router.put('/profile', updateProfile);
router.put('/password', changePassword);
router.post('/logout', logout);

module.exports = router;