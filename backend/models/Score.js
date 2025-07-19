const mongoose = require('mongoose');

const scoreSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  quiz: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Quiz',
    required: true
  },
  answers: [{
    question: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Question',
      required: true
    },
    selectedAnswer: String,
    isCorrect: {
      type: Boolean,
      required: true
    },
    timeSpent: {
      type: Number, // seconds
      default: 0
    },
    points: {
      type: Number,
      default: 0
    }
  }],
  score: {
    type: Number,
    required: true,
    default: 0
  },
  maxScore: {
    type: Number,
    required: true
  },
  percentage: {
    type: Number,
    required: true,
    default: 0
  },
  timeSpent: {
    type: Number, // total seconds
    default: 0
  },
  completed: {
    type: Boolean,
    default: false
  },
  completedAt: Date,
  rank: Number,
  streak: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Calculate score before saving
scoreSchema.pre('save', function(next) {
  if (this.isModified('answers')) {
    this.score = this.answers.reduce((total, answer) => total + answer.points, 0);
    this.percentage = this.maxScore > 0 ? Math.round((this.score / this.maxScore) * 100) : 0;
    this.timeSpent = this.answers.reduce((total, answer) => total + answer.timeSpent, 0);
  }
  next();
});

// Index for leaderboard queries
scoreSchema.index({ quiz: 1, score: -1 });
scoreSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('Score', scoreSchema);