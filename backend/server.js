const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
require('dotenv').config();

// Import database connection
const connectDB = require('./config/db');

// Import middleware
const { errorHandler, notFound } = require('./middleware/errorHandler');

// Import routes
const authRoutes = require('./routes/authRoutes');
const quizRoutes = require('./routes/quizRoutes');
const userRoutes = require('./routes/userRoutes');
const adminRoutes = require('./routes/adminRoutes');

// Import models for socket functionality
const Quiz = require('./models/Quiz');
const Question = require('./models/Question');
const Score = require('./models/Score');

const app = express();
app.use(cors());

const server = http.createServer(app);

// Socket.IO setup
const io = socketIo(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Connect to database
connectDB();

// Security middleware
app.use(helmet());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.'
  }
});
app.use(limiter);

// CORS
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  credentials: true
}));

// Body parser middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/quiz', quizRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);

// Health check route
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Socket.IO real-time quiz functionality
const activeQuizSessions = new Map(); // Store active quiz sessions

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Join quiz room
  socket.on('join-quiz', async (data) => {
    try {
      const { quizId, userId, username } = data;
      
      // Validate quiz exists
      const quiz = await Quiz.findById(quizId).populate('questions');
      if (!quiz) {
        socket.emit('error', { message: 'Quiz not found' });
        return;
      }

      const roomId = `quiz-${quizId}`;
      socket.join(roomId);
      
      // Store user info in socket
      socket.userId = userId;
      socket.username = username;
      socket.quizId = quizId;
      socket.roomId = roomId;

      // Initialize quiz session if not exists
      if (!activeQuizSessions.has(roomId)) {
        activeQuizSessions.set(roomId, {
          quiz,
          participants: new Map(),
          currentQuestion: 0,
          isActive: false,
          startTime: null
        });
      }

      const session = activeQuizSessions.get(roomId);
      session.participants.set(socket.id, {
        userId,
        username,
        score: 0,
        answers: []
      });

      // Notify room about new participant
      socket.to(roomId).emit('user-joined', {
        userId,
        username,
        participantCount: session.participants.size
      });

      // Send current session state to the user
      socket.emit('quiz-joined', {
        quiz: {
          id: quiz._id,
          title: quiz.title,
          description: quiz.description,
          settings: quiz.settings
        },
        participantCount: session.participants.size,
        isActive: session.isActive
      });

    } catch (error) {
      console.error('Join quiz error:', error);
      socket.emit('error', { message: 'Failed to join quiz' });
    }
  });

  // Start quiz (host only)
  socket.on('start-quiz', (data) => {
    const session = activeQuizSessions.get(socket.roomId);
    if (!session) return;

    session.isActive = true;
    session.startTime = new Date();
    session.currentQuestion = 0;

    // Send first question to all participants
    const question = session.quiz.questions[0];
    const questionData = {
      questionNumber: 1,
      totalQuestions: session.quiz.questions.length,
      question: question.question,
      type: question.type,
      options: question.options.map(opt => ({ text: opt.text })), // Hide correct answers
      timeLimit: question.timeLimit || session.quiz.settings.timeLimit,
      points: question.points
    };

    io.to(socket.roomId).emit('quiz-started', questionData);

    // Auto-advance to next question after time limit
    setTimeout(() => {
      socket.emit('next-question');
    }, (question.timeLimit || session.quiz.settings.timeLimit) * 1000);
  });

  // Submit answer
  socket.on('submit-answer', async (data) => {
    try {
      const { questionId, selectedAnswer, timeSpent } = data;
      const session = activeQuizSessions.get(socket.roomId);
      
      if (!session || !session.isActive) return;

      const participant = session.participants.get(socket.id);
      if (!participant) return;

      const question = await Question.findById(questionId);
      if (!question) return;

      // Check if answer is correct
      let isCorrect = false;
      if (question.type === 'multiple-choice') {
        const correctOption = question.options.find(opt => opt.isCorrect);
        isCorrect = correctOption && correctOption.text === selectedAnswer;
      } else if (question.type === 'true-false') {
        const correctOption = question.options.find(opt => opt.isCorrect);
        isCorrect = correctOption && correctOption.text === selectedAnswer;
      } else if (question.type === 'fill-in-blank') {
        isCorrect = question.correctAnswer.toLowerCase().trim() === selectedAnswer.toLowerCase().trim();
      }

      const points = isCorrect ? question.points : 0;
      
      // Update participant data
      participant.answers.push({
        question: questionId,
        selectedAnswer,
        isCorrect,
        timeSpent,
        points
      });
      participant.score += points;

      // Update question stats
      question.stats.totalAnswers += 1;
      if (isCorrect) {
        question.stats.correctAnswers += 1;
      }
      question.updateStats();
      await question.save();

      // Send answer result to participant
      socket.emit('answer-result', {
        isCorrect,
        points,
        totalScore: participant.score,
        correctAnswer: question.type === 'fill-in-blank' ? 
          question.correctAnswer : 
          question.options.find(opt => opt.isCorrect)?.text
      });

    } catch (error) {
      console.error('Submit answer error:', error);
      socket.emit('error', { message: 'Failed to submit answer' });
    }
  });

  // Next question
  socket.on('next-question', () => {
    const session = activeQuizSessions.get(socket.roomId);
    if (!session || !session.isActive) return;

    session.currentQuestion += 1;

    if (session.currentQuestion >= session.quiz.questions.length) {
      // Quiz finished
      socket.emit('finish-quiz');
      return;
    }

    const question = session.quiz.questions[session.currentQuestion];
    const questionData = {
      questionNumber: session.currentQuestion + 1,
      totalQuestions: session.quiz.questions.length,
      question: question.question,
      type: question.type,
      options: question.options.map(opt => ({ text: opt.text })),
      timeLimit: question.timeLimit || session.quiz.settings.timeLimit,
      points: question.points
    };

    io.to(socket.roomId).emit('next-question', questionData);

    // Auto-advance after time limit
    setTimeout(() => {
      socket.emit('next-question');
    }, (question.timeLimit || session.quiz.settings.timeLimit) * 1000);
  });

  // Finish quiz
  socket.on('finish-quiz', async () => {
    try {
      const session = activeQuizSessions.get(socket.roomId);
      if (!session) return;

      const participant = session.participants.get(socket.id);
      if (!participant) return;

      // Save score to database
      const maxScore = session.quiz.questions.reduce((total, q) => total + q.points, 0);
      
      const score = await Score.create({
        user: participant.userId,
        quiz: session.quiz._id,
        answers: participant.answers,
        score: participant.score,
        maxScore,
        percentage: Math.round((participant.score / maxScore) * 100),
        completed: true,
        completedAt: new Date()
      });

      // Update quiz stats
      await session.quiz.updateStats();

      // Get leaderboard for this quiz
      const leaderboard = Array.from(session.participants.values())
        .map(p => ({
          username: p.username,
          score: p.score,
          percentage: Math.round((p.score / maxScore) * 100)
        }))
        .sort((a, b) => b.score - a.score);

      // Send final results
      socket.emit('quiz-completed', {
        finalScore: participant.score,
        maxScore,
        percentage: Math.round((participant.score / maxScore) * 100),
        leaderboard,
        rank: leaderboard.findIndex(p => p.username === participant.username) + 1
      });

      // Remove participant from session
      session.participants.delete(socket.id);

      // Clean up session if empty
      if (session.participants.size === 0) {
        activeQuizSessions.delete(socket.roomId);
      }

    } catch (error) {
      console.error('Finish quiz error:', error);
      socket.emit('error', { message: 'Failed to finish quiz' });
    }
  });

  // Get real-time leaderboard
  socket.on('get-leaderboard', () => {
    const session = activeQuizSessions.get(socket.roomId);
    if (!session) return;

    const leaderboard = Array.from(session.participants.values())
      .map(p => ({
        username: p.username,
        score: p.score
      }))
      .sort((a, b) => b.score - a.score);

    socket.emit('leaderboard-update', leaderboard);
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    if (socket.roomId) {
      const session = activeQuizSessions.get(socket.roomId);
      if (session) {
        session.participants.delete(socket.id);
        
        // Notify room about participant leaving
        socket.to(socket.roomId).emit('user-left', {
          username: socket.username,
          participantCount: session.participants.size
        });

        // Clean up empty sessions
        if (session.participants.size === 0) {
          activeQuizSessions.delete(socket.roomId);
        }
      }
    }
  });
});

// Error handling middleware (must be last)
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
  console.log(`Error: ${err.message}`);
  server.close(() => {
    process.exit(1);
  });
});