const express = require('express');
const {
  getQuizzes,
  getQuizById,
  createQuiz,
  generateQuiz,
  updateQuiz,
  deleteQuiz,
  getMyQuizzes
} = require('../controllers/quizController');
const { protect, optionalAuth } = require('../middleware/authMiddleware');

const router = express.Router();

// Public routes
router.get('/', optionalAuth, getQuizzes);
router.get('/:id', optionalAuth, getQuizById);

// Private routes
router.use(protect); // Protect all routes below
router.post('/', createQuiz);
router.post('/generate', generateQuiz);
router.get('/my/quizzes', getMyQuizzes);
router.put('/:id', updateQuiz);
router.delete('/:id', deleteQuiz);

module.exports = router;