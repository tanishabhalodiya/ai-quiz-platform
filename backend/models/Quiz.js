const mongoose = require('mongoose');

const quizSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Quiz title is required'],
    trim: true,
    maxlength: [100, 'Title cannot exceed 100 characters']
  },
  description: {
    type: String,
    required: [true, 'Quiz description is required'],
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    enum: ['Science', 'Technology', 'Sports', 'History', 'Geography', 'Entertainment', 'General Knowledge', 'Math', 'Literature', 'Art']
  },
  difficulty: {
    type: String,
    required: [true, 'Difficulty level is required'],
    enum: ['Easy', 'Medium', 'Hard'],
    default: 'Medium'
  },
  creator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  questions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Question'
  }],
  settings: {
    timeLimit: {
      type: Number,
      default: 30, // seconds per question
      min: 10,
      max: 120
    },
    totalQuestions: {
      type: Number,
      default: 10,
      min: 5,
      max: 50
    },
    pointsPerQuestion: {
      type: Number,
      default: 10,
      min: 1,
      max: 100
    },
    showCorrectAnswer: {
      type: Boolean,
      default: true
    },
    randomizeQuestions: {
      type: Boolean,
      default: true
    },
    allowRetake: {
      type: Boolean,
      default: true
    }
  },
  isPublic: {
    type: Boolean,
    default: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  tags: [String],
  thumbnail: String,
  stats: {
    totalAttempts: {
      type: Number,
      default: 0
    },
    averageScore: {
      type: Number,
      default: 0
    },
    completionRate: {
      type: Number,
      default: 0
    }
  },
  aiGenerated: {
    type: Boolean,
    default: false
  },
  generationPrompt: String
}, {
  timestamps: true
});

// Update quiz stats
quizSchema.methods.updateStats = async function() {
  const Score = mongoose.model('Score');
  const scores = await Score.find({ quiz: this._id });
  
  this.stats.totalAttempts = scores.length;
  this.stats.averageScore = scores.length > 0 ? 
    Math.round(scores.reduce((total, score) => total + score.score, 0) / scores.length) : 0;
  
  const completedScores = scores.filter(score => score.completed);
  this.stats.completionRate = scores.length > 0 ? 
    Math.round((completedScores.length / scores.length) * 100) : 0;
  
  await this.save();
};

module.exports = mongoose.model('Quiz', quizSchema);