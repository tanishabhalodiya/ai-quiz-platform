const Quiz = require('../models/Quiz');
const Question = require('../models/Question');
const Score = require('../models/Score');
const { generateQuizWithAI } = require('../utils/aiGenerator');

// @desc    Get all public quizzes
// @route   GET /api/quiz
// @access  Public
const getQuizzes = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      category,
      difficulty,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const filter = { isPublic: true, isActive: true };

    if (category) filter.category = category;
    if (difficulty) filter.difficulty = difficulty;
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const quizzes = await Quiz.find(filter)
      .populate('creator', 'username profile.firstName profile.lastName')
      .populate('questions', 'question type difficulty')
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Quiz.countDocuments(filter);

    res.json({
      success: true,
      data: {
        quizzes,
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

// @desc    Get quiz by ID
// @route   GET /api/quiz/:id
// @access  Public
const getQuizById = async (req, res, next) => {
  try {
    const quiz = await Quiz.findById(req.params.id)
      .populate('creator', 'username profile')
      .populate({
        path: 'questions',
        select: '-options.isCorrect -correctAnswer' // Hide correct answers for public view
      });

    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: 'Quiz not found'
      });
    }

    // If user is the creator or admin, show all details
    if (req.user && (req.user.id === quiz.creator._id.toString() || req.user.role === 'admin')) {
      await quiz.populate({
        path: 'questions',
        select: '+options.isCorrect +correctAnswer'
      });
    }

    res.json({
      success: true,
      data: { quiz }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create new quiz
// @route   POST /api/quiz
// @access  Private
const createQuiz = async (req, res, next) => {
  try {
    const {
      title,
      description,
      category,
      difficulty,
      settings,
      questions,
      tags,
      isPublic = true
    } = req.body;

    // Create quiz
    const quiz = await Quiz.create({
      title,
      description,
      category,
      difficulty,
      creator: req.user.id,
      settings: {
        ...settings,
        totalQuestions: questions?.length || settings?.totalQuestions || 10
      },
      tags,
      isPublic
    });

    // Create questions if provided
    if (questions && questions.length > 0) {
      const createdQuestions = await Promise.all(
        questions.map(async (questionData, index) => {
          return await Question.create({
            ...questionData,
            quiz: quiz._id,
            order: index
          });
        })
      );

      quiz.questions = createdQuestions.map(q => q._id);
      await quiz.save();
    }

    // Populate the created quiz
    await quiz.populate('questions');

    res.status(201).json({
      success: true,
      message: 'Quiz created successfully',
      data: { quiz }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Generate quiz with AI
// @route   POST /api/quiz/generate
// @access  Private
const generateQuiz = async (req, res, next) => {
  try {
    const {
      topic,
      difficulty = 'Medium',
      numberOfQuestions = 10,
      category = 'General Knowledge'
    } = req.body;

    if (!topic) {
      return res.status(400).json({
        success: false,
        message: 'Topic is required for AI generation'
      });
    }

    // Generate quiz using AI
    const generatedQuiz = await generateQuizWithAI({
      topic,
      difficulty,
      numberOfQuestions,
      category
    });

    // Create quiz in database
    const quiz = await Quiz.create({
      title: generatedQuiz.title,
      description: generatedQuiz.description,
      category,
      difficulty,
      creator: req.user.id,
      settings: {
        totalQuestions: numberOfQuestions,
        timeLimit: 30,
        pointsPerQuestion: 10
      },
      aiGenerated: true,
      generationPrompt: topic
    });

    // Create questions
    const createdQuestions = await Promise.all(
      generatedQuiz.questions.map(async (questionData, index) => {
        return await Question.create({
          ...questionData,
          quiz: quiz._id,
          order: index,
          aiGenerated: true
        });
      })
    );

    quiz.questions = createdQuestions.map(q => q._id);
    await quiz.save();

    await quiz.populate('questions');

    res.status(201).json({
      success: true,
      message: 'AI quiz generated successfully',
      data: { quiz }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update quiz
// @route   PUT /api/quiz/:id
// @access  Private
const updateQuiz = async (req, res, next) => {
  try {
    const quiz = await Quiz.findById(req.params.id);

    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: 'Quiz not found'
      });
    }

    // Check if user owns the quiz or is admin
    if (quiz.creator.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this quiz'
      });
    }

    const updatedQuiz = await Quiz.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate('questions');

    res.json({
      success: true,
      message: 'Quiz updated successfully',
      data: { quiz: updatedQuiz }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete quiz
// @route   DELETE /api/quiz/:id
// @access  Private
const deleteQuiz = async (req, res, next) => {
  try {
    const quiz = await Quiz.findById(req.params.id);

    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: 'Quiz not found'
      });
    }

    // Check if user owns the quiz or is admin
    if (quiz.creator.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this quiz'
      });
    }

    // Delete associated questions and scores
    await Question.deleteMany({ quiz: quiz._id });
    await Score.deleteMany({ quiz: quiz._id });
    await Quiz.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Quiz deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get user's quizzes
// @route   GET /api/quiz/my-quizzes
// @access  Private
const getMyQuizzes = async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const quizzes = await Quiz.find({ creator: req.user.id })
      .populate('questions', 'question type')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Quiz.countDocuments({ creator: req.user.id });

    res.json({
      success: true,
      data: {
        quizzes,
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

module.exports = {
  getQuizzes,
  getQuizById,
  createQuiz,
  generateQuiz,
  updateQuiz,
  deleteQuiz,
  getMyQuizzes
};