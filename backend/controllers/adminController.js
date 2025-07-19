const User = require('../models/User');
const Quiz = require('../models/Quiz');
const Question = require('../models/Question');
const Score = require('../models/Score');
const Report = require('../models/Report');

// @desc    Get admin dashboard stats
// @route   GET /api/admin/dashboard
// @access  Private/Admin
const getDashboardStats = async (req, res, next) => {
  try {
    // Get basic counts
    const totalUsers = await User.countDocuments();
    const totalQuizzes = await Quiz.countDocuments();
    const totalQuestions = await Question.countDocuments();
    const totalScores = await Score.countDocuments();

    // Get active users (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const activeUsers = await User.countDocuments({
      lastLogin: { $gte: thirtyDaysAgo }
    });

    // Get recent registrations
    const recentUsers = await User.countDocuments({
      createdAt: { $gte: thirtyDaysAgo }
    });

    // Get quiz completion rate
    const completedQuizzes = await Score.countDocuments({ completed: true });
    const completionRate = totalScores > 0 ? Math.round((completedQuizzes / totalScores) * 100) : 0;

    // Get category distribution
    const categoryStats = await Quiz.aggregate([
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    // Get daily activity for last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const dailyActivity = await Score.aggregate([
      {
        $match: {
          createdAt: { $gte: sevenDaysAgo }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Get pending reports
    const pendingReports = await Report.countDocuments({ status: 'pending' });

    res.json({
      success: true,
      data: {
        overview: {
          totalUsers,
          totalQuizzes,
          totalQuestions,
          totalScores,
          activeUsers,
          recentUsers,
          completionRate,
          pendingReports
        },
        categoryStats,
        dailyActivity
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all users with pagination
// @route   GET /api/admin/users
// @access  Private/Admin
const getAllUsers = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      search,
      role,
      isActive,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const filter = {};

    if (search) {
      const searchRegex = new RegExp(search, 'i');
      filter.$or = [
        { username: searchRegex },
        { email: searchRegex },
        { 'profile.firstName': searchRegex },
        { 'profile.lastName': searchRegex }
      ];
    }

    if (role) filter.role = role;
    if (isActive !== undefined) filter.isActive = isActive === 'true';

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const users = await User.find(filter)
      .select('-password -resetPasswordToken -resetPasswordExpire')
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await User.countDocuments(filter);

    res.json({
      success: true,
      data: {
        users,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / parseInt(limit)),
          total,
          limit: parseInt(limit)
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update user role/status
// @route   PUT /api/admin/users/:id
// @access  Private/Admin
const updateUser = async (req, res, next) => {
  try {
    const { role, isActive } = req.body;
    const userId = req.params.id;

    if (userId === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'Cannot modify your own account'
      });
    }

    const updateData = {};
    if (role) updateData.role = role;
    if (isActive !== undefined) updateData.isActive = isActive;

    const user = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      message: 'User updated successfully',
      data: { user }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete user
// @route   DELETE /api/admin/users/:id
// @access  Private/Admin
const deleteUser = async (req, res, next) => {
  try {
    const userId = req.params.id;

    if (userId === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete your own account'
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Delete user's data
    await Quiz.deleteMany({ creator: userId });
    await Score.deleteMany({ user: userId });
    await Report.deleteMany({ reporter: userId });
    await User.findByIdAndDelete(userId);

    res.json({
      success: true,
      message: 'User and associated data deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all reports
// @route   GET /api/admin/reports
// @access  Private/Admin
const getAllReports = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      targetType,
      priority,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (targetType) filter.targetType = targetType;
    if (priority) filter.priority = priority;

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const reports = await Report.find(filter)
      .populate('reporter', 'username email')
      .populate('assignedTo', 'username')
      .populate('resolution.resolvedBy', 'username')
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Report.countDocuments(filter);

    res.json({
      success: true,
      data: {
        reports,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / parseInt(limit)),
          total,
          limit: parseInt(limit)
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update report status
// @route   PUT /api/admin/reports/:id
// @access  Private/Admin
const updateReport = async (req, res, next) => {
  try {
    const { status, priority, assignedTo, adminNotes } = req.body;

    const updateData = {};
    if (status) updateData.status = status;
    if (priority) updateData.priority = priority;
    if (assignedTo) updateData.assignedTo = assignedTo;
    if (adminNotes) updateData.adminNotes = adminNotes;

    const report = await Report.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    ).populate('reporter', 'username email');

    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }

    res.json({
      success: true,
      message: 'Report updated successfully',
      data: { report }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Resolve report
// @route   POST /api/admin/reports/:id/resolve
// @access  Private/Admin
const resolveReport = async (req, res, next) => {
  try {
    const { action, note } = req.body;

    const report = await Report.findByIdAndUpdate(
      req.params.id,
      {
        status: 'resolved',
        resolution: {
          action,
          note,
          resolvedBy: req.user.id,
          resolvedAt: new Date()
        }
      },
      { new: true }
    ).populate('reporter', 'username email');

    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }

    res.json({
      success: true,
      message: 'Report resolved successfully',
      data: { report }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getDashboardStats,
  getAllUsers,
  updateUser,
  deleteUser,
  getAllReports,
  updateReport,
  resolveReport
};