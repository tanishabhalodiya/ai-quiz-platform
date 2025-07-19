const axios = require('axios');

/**
 * Generate quiz questions using AI
 * @param {Object} options - Quiz generation options
 * @param {string} options.topic - Topic for the quiz
 * @param {string} options.difficulty - Difficulty level
 * @param {number} options.numberOfQuestions - Number of questions to generate
 * @param {string} options.category - Quiz category
 * @returns {Object} Generated quiz data
 */
const generateQuizWithAI = async ({
  topic,
  difficulty = 'Medium',
  numberOfQuestions = 10,
  category = 'General Knowledge'
}) => {
  try {
    // Check if AI API key is configured
    if (!process.env.AI_API_KEY) {
      throw new Error('AI API key not configured');
    }

    const prompt = `Create a quiz about "${topic}" with the following specifications:
    - Category: ${category}
    - Difficulty: ${difficulty}
    - Number of questions: ${numberOfQuestions}
    - Each question should have 4 multiple choice options
    - Include explanations for correct answers
    
    Please format the response as a JSON object with the following structure:
    {
      "title": "Quiz title",
      "description": "Brief description",
      "questions": [
        {
          "question": "Question text",
          "type": "multiple-choice",
          "options": [
            {"text": "Option 1", "isCorrect": false},
            {"text": "Option 2", "isCorrect": true},
            {"text": "Option 3", "isCorrect": false},
            {"text": "Option 4", "isCorrect": false}
          ],
          "explanation": "Explanation for the correct answer",
          "difficulty": "${difficulty}",
          "points": 10
        }
      ]
    }`;

    // Example using OpenAI API format - adjust based on your AI service
    const response = await axios.post(
      process.env.AI_API_URL + '/chat/completions',
      {
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a quiz generator that creates educational quizzes. Always respond with valid JSON only.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 3000,
        temperature: 0.7
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.AI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const generatedContent = response.data.choices[0].message.content;
    
    // Parse the JSON response
    let quizData;
    try {
      quizData = JSON.parse(generatedContent);
    } catch (parseError) {
      // Fallback: try to extract JSON from the response
      const jsonMatch = generatedContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        quizData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Failed to parse AI response');
      }
    }

    // Validate the generated quiz structure
    if (!quizData.questions || !Array.isArray(quizData.questions)) {
      throw new Error('Invalid quiz structure from AI');
    }

    // Ensure each question has the required fields
    quizData.questions = quizData.questions.map((question, index) => ({
      question: question.question || `Question ${index + 1}`,
      type: question.type || 'multiple-choice',
      options: question.options || [],
      explanation: question.explanation || '',
      difficulty: question.difficulty || difficulty,
      points: question.points || 10,
      order: index
    }));

    return {
      title: quizData.title || `${topic} Quiz`,
      description: quizData.description || `A quiz about ${topic}`,
      questions: quizData.questions.slice(0, numberOfQuestions) // Ensure we don't exceed requested number
    };

  } catch (error) {
    console.error('AI Quiz Generation Error:', error);
    
    // Fallback: Generate a simple quiz structure
    return generateFallbackQuiz({ topic, difficulty, numberOfQuestions });
  }
};

/**
 * Generate a fallback quiz when AI service is unavailable
 */
const generateFallbackQuiz = ({ topic, difficulty, numberOfQuestions }) => {
  const questions = [];
  
  for (let i = 1; i <= numberOfQuestions; i++) {
    questions.push({
      question: `Sample question ${i} about ${topic}`,
      type: 'multiple-choice',
      options: [
        { text: 'Option A', isCorrect: i % 4 === 1 },
        { text: 'Option B', isCorrect: i % 4 === 2 },
        { text: 'Option C', isCorrect: i % 4 === 3 },
        { text: 'Option D', isCorrect: i % 4 === 0 }
      ],
      explanation: `This is a sample explanation for question ${i}`,
      difficulty,
      points: 10,
      order: i - 1
    });
  }

  return {
    title: `${topic} Quiz (Sample)`,
    description: `A sample quiz about ${topic}. Please configure AI service for actual generated content.`,
    questions
  };
};

/**
 * Generate question variations for existing questions
 */
const generateQuestionVariations = async (questionText, count = 3) => {
  try {
    if (!process.env.AI_API_KEY) {
      return [];
    }

    const prompt = `Create ${count} variations of this quiz question while maintaining the same difficulty and topic:
    
    Original: "${questionText}"
    
    Return as JSON array of strings: ["variation 1", "variation 2", ...]`;

    const response = await axios.post(
      process.env.AI_API_URL + '/chat/completions',
      {
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a quiz question generator. Always respond with valid JSON only.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 500,
        temperature: 0.8
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.AI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const variations = JSON.parse(response.data.choices[0].message.content);
    return Array.isArray(variations) ? variations : [];

  } catch (error) {
    console.error('Question variation generation error:', error);
    return [];
  }
};

module.exports = {
  generateQuizWithAI,
  generateQuestionVariations
};