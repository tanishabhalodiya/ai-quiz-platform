const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  quiz: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Quiz',
    required: true
  },
  question: {
    type: String,
    required: [true, 'Question text is required'],
    trim: true
  },
  type: {
    type: String,
    enum: ['multiple-choice', 'true-false', 'fill-in-blank'],
    default: 'multiple-choice'
  },
  options: [{
    text: {
      type: String,
      required: true
    },
    isCorrect: {
      type: Boolean,
      default: false
    }
  }],
  correctAnswer: {
    type: String,
    required: function() {
      return this.type === 'fill-in-blank';
    }
  },
  explanation: String,
  difficulty: {
    type: String,
    enum: ['Easy', 'Medium', 'Hard'],
    default: 'Medium'
  },
  points: {
    type: Number,
    default: 10,
    min: 1,
    max: 100
  },
  timeLimit: {
    type: Number,
    default: 30, // seconds
    min: 10,
    max: 120
  },
  media: {
    type: {
      type: String,
      enum: ['image', 'video', 'audio']
    },
    url: String,
    caption: String
  },
  tags: [String],
  order: {
    type: Number,
    default: 0
  },
  aiGenerated: {
    type: Boolean,
    default: false
  },
  stats: {
    correctAnswers: {
      type: Number,
      default: 0
    },
    totalAnswers: {
      type: Number,
      default: 0
    },
    accuracyRate: {
      type: Number,
      default: 0
    }
  }
}, {
  timestamps: true
});

// Validate that at least one option is correct for multiple choice
questionSchema.pre('save', function(next) {
  if (this.type === 'multiple-choice') {
    const hasCorrectAnswer = this.options.some(option => option.isCorrect);
    if (!hasCorrectAnswer) {
      return next(new Error('At least one option must be marked as correct'));
    }
  }
  
  if (this.type === 'true-false') {
    if (this.options.length !== 2) {
      return next(new Error('True/False questions must have exactly 2 options'));
    }
  }
  
  next();
});

// Update question stats
questionSchema.methods.updateStats = function() {
  if (this.stats.totalAnswers > 0) {
    this.stats.accuracyRate = Math.round((this.stats.correctAnswers / this.stats.totalAnswers) * 100);
  }
};

module.exports = mongoose.model('Question', questionSchema);