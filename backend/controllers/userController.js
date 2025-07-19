const User = require('../models/User');
const Score = require('../models/Score');
const Quiz = require('../models/Quiz');

// @desc    Get user profile
// @route   GET /api/users/:id
// @access  Public
const getUserProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-password -resetPasswordToken -resetPasswordExpire')
      .populate('achievements');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Get user's recent scores
    const recentScores = await Score.find({ user: user._id })
      .populate('quiz', 'title category')
      .sort({ createdAt: -1 })
      .limit(5);

    // Get user's created quizzes count
    const createdQuizzes = await Quiz.countDocuments({ creator: user._id, isPublic: true });

    res.json({
      success: true,
      data: {
        user: {
          id: user._id,
          username: user.username,
          profile: user.profile,
          stats: user.stats,
          achievements: user.achievements,
          createdAt: user.createdAt,
          createdQuizzes
        },
        recentScores
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get leaderboard
// @route   GET /api/users/leaderboard
// @access  Public
const getLeaderboard = async (req, res, next) => {
  try {
    const {
      period = 'all', // all, month, week
      category,
      limit = 50
    } = req.query;

    let dateFilter = {};
    
    if (period === 'month') {
      const lastMonth = new Date();
      lastMonth.setMonth(lastMonth.getMonth() - 1);
      dateFilter.createdAt = { $gte: lastMonth };
    } else if (period === 'week') {
      const lastWeek = new Date();
      lastWeek.setDate(lastWeek.getDate() - 7);
      dateFilter.createdAt = { $gte: lastWeek };
    }

    // Aggregate user scores
    const pipeline = [
      {
        $match: {
          completed: true,
          ...dateFilter
        }
      }
    ];

    if (category) {
      // Join with Quiz to filter by category
      pipeline.push(
        {
          $lookup: {
            from: 'quizzes',
            localField: 'quiz',
            foreignField: '_id',
            as: 'quizData'
          }
        },
        {
          $match: {
            'quizData.category': category
          }
        }
      );
    }

    pipeline.push(
      {
        $group: {
          _id: '$user',
          totalScore: { $sum: '$score' },
          totalQuizzes: { $sum: 1 },
          averageScore: { $avg: '$percentage' },
          bestScore: { $max: '$percentage' }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      {
        $unwind: '$user'
      },
      {
        $match: {
          'user.isActive': true
        }
      },
      {
        $project: {
          _id: 1,
          totalScore: 1,
          totalQuizzes: 1,
          averageScore: { $round: ['$averageScore', 1] },
          bestScore: { $round: ['$bestScore', 1] },
          user: {
            username: '$user.username',
            profile: '$user.profile'
          }
        }
      },
      {
        $sort: {
          totalScore: -1,
          averageScore: -1
        }
      },
      {
        $limit: parseInt(limit)
      }
    );

    const leaderboard = await Score.aggregate(pipeline);

    // Add ranks
    const rankedLeaderboard = leaderboard.map((entry, index) => ({
      ...entry,
      rank: index + 1
    }));

    res.json({
      success: true,
      data: {
        leaderboard: rankedLeaderboard,
        period,
        category: category || 'all'
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get user statistics
// @route   GET /api/users/stats
// @access  Private
const getUserStats = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Get detailed statistics
    const stats = await Score.aggregate([
      {
        $match: {
          user: userId,
          completed: true
        }
      },
      {
        $lookup: {
          from: 'quizzes',
          localField: 'quiz',
          foreignField: '_id',
          as: 'quizData'
        }
      },
      {
        $unwind: '$quizData'
      },
      {
        $group: {
          _id: null,
          totalQuizzes: { $sum: 1 },
          totalScore: { $sum: '$score' },
          averageScore: { $avg: '$percentage' },
          bestScore: { $max: '$percentage' },
          totalTimeSpent: { $sum: '$timeSpent' },
          categoriesPlayed: { $addToSet: '$quizData.category' },
          difficultiesPlayed: { $addToSet: '$quizData.difficulty' }
        }
      }
    ]);

    // Get category-wise performance
    const categoryStats = await Score.aggregate([
      {
        $match: {
          user: userId,
          completed: true
        }
      },
      {
        $lookup: {
          from: 'quizzes',
          localField: 'quiz',
          foreignField: '_id',
          as: 'quizData'
        }
      },
      {
        $unwind: '$quizData'
      },
      {
        $group: {
          _id: '$quizData.category',
          count: { $sum: 1 },
          averageScore: { $avg: '$percentage' },
          bestScore: { $max: '$percentage' }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);

    // Get recent activity
    const recentActivity = await Score.find({ user: userId })
      .populate('quiz', 'title category difficulty')
      .sort({ createdAt: -1 })
      .limit(10);

    // Update user stats
    await req.user.updateStats();

    const userStats = stats[0] || {
      totalQuizzes: 0,
      totalScore: 0,
      averageScore: 0,
      bestScore: 0,
      totalTimeSpent: 0,
      categoriesPlayed: [],
      difficultiesPlayed: []
    };

    res.json({
      success: true,
      data: {
        overview: {
          ...userStats,
          averageScore: Math.round(userStats.averageScore || 0),
          bestScore: Math.round(userStats.bestScore || 0)
        },
        categoryStats,
        recentActivity
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Search users
// @route   GET /api/users/search
// @access  Public
const searchUsers = async (req, res, next) => {
  try {
    const { q, limit = 10 } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Search query must be at least 2 characters'
      });
    }

    const searchRegex = new RegExp(q.trim(), 'i');

    const users = await User.find({
      $and: [
        { isActive: true },
        {
          $or: [
            { username: searchRegex },
            { 'profile.firstName': searchRegex },
            { 'profile.lastName': searchRegex }
          ]
        }
      ]
    })
    .select('username profile stats')
    .limit(parseInt(limit));

    res.json({
      success: true,
      data: { users }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getUserProfile,
  getLeaderboard,
  getUserStats,
  searchUsers
};