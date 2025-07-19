const express = require('express');
const {
  getDashboardStats,
  getAllUsers,
  updateUser,
  deleteUser,
  getAllReports,
  updateReport,
  resolveReport
} = require('../controllers/adminController');
const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

// Protect all admin routes
router.use(protect);
router.use(authorize('admin'));

// Dashboard
router.get('/dashboard', getDashboardStats);

// User management
router.get('/users', getAllUsers);
router.put('/users/:id', updateUser);
router.delete('/users/:id', deleteUser);

// Report management
router.get('/reports', getAllReports);
router.put('/reports/:id', updateReport);
router.post('/reports/:id/resolve', resolveReport);

module.exports = router;