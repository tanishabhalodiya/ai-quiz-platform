const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  reporter: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  targetType: {
    type: String,
    enum: ['quiz', 'question', 'user'],
    required: true
  },
  targetId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  reason: {
    type: String,
    required: [true, 'Report reason is required'],
    enum: [
      'inappropriate-content',
      'spam',
      'harassment',
      'copyright-violation',
      'misinformation',
      'technical-issue',
      'other'
    ]
  },
  description: {
    type: String,
    required: [true, 'Report description is required'],
    maxlength: [1000, 'Description cannot exceed 1000 characters']
  },
  status: {
    type: String,
    enum: ['pending', 'reviewing', 'resolved', 'rejected'],
    default: 'pending'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  adminNotes: String,
  resolution: {
    action: {
      type: String,
      enum: ['no-action', 'warning', 'content-removed', 'user-suspended', 'user-banned']
    },
    note: String,
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    resolvedAt: Date
  }
}, {
  timestamps: true
});

// Index for admin queries
reportSchema.index({ status: 1, priority: -1, createdAt: -1 });
reportSchema.index({ targetType: 1, targetId: 1 });

module.exports = mongoose.model('Report', reportSchema);