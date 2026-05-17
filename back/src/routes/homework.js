const express = require('express');
const { Homework, HomeworkQuestion, HomeworkSubmission, HomeworkAnswer, User, Subject } = require('../models');
const { Op } = require('sequelize');

const router = express.Router();

// Get all homeworks (for admin)
router.get('/all', async (req, res) => {
  try {
    const homeworks = await Homework.findAll({
      include: [
        {
          model: Subject,
          as: 'subject',
          attributes: ['id', 'name', 'icon']
        },
        {
          model: HomeworkQuestion,
          as: 'questions',
          attributes: ['id']
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    res.json({ homeworks });
  } catch (error) {
    console.error('Get all homeworks error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get homework by ID with questions
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const homework = await Homework.findByPk(id, {
      include: [
        {
          model: Subject,
          as: 'subject',
          attributes: ['id', 'name', 'icon']
        },
        {
          model: HomeworkQuestion,
          as: 'questions',
          order: [['order', 'ASC']]
        }
      ]
    });

    if (!homework) {
      return res.status(404).json({ message: 'Homework not found' });
    }

    res.json({ homework });
  } catch (error) {
    console.error('Get homework error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get homeworks for student (by their subjects)
router.get('/student/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;

    const student = await User.findByPk(studentId, {
      include: [{
        model: Subject,
        as: 'subjects',
        attributes: ['id']
      }]
    });

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const subjectIds = student.subjects.map(s => s.id);
    const now = new Date();

    const homeworks = await Homework.findAll({
      where: {
        subjectId: { [Op.in]: subjectIds },
        isActive: true,
        openDate: { [Op.lte]: now },
        closeDate: { [Op.gte]: now }
      },
      include: [
        {
          model: Subject,
          as: 'subject',
          attributes: ['id', 'name', 'icon']
        },
        {
          model: HomeworkQuestion,
          as: 'questions',
          attributes: ['id', 'points']
        }
      ],
      order: [['closeDate', 'ASC']]
    });

    // Get student's submissions to check attempts
    const submissions = await HomeworkSubmission.findAll({
      where: {
        userId: studentId,
        homeworkId: { [Op.in]: homeworks.map(h => h.id) }
      },
      attributes: ['homeworkId', 'attemptNumber', 'totalScore', 'maxScore'],
      order: [['attemptNumber', 'DESC']]
    });

    const submissionsMap = {};
    submissions.forEach(sub => {
      if (!submissionsMap[sub.homeworkId]) {
        submissionsMap[sub.homeworkId] = {
          attempts: 0,
          bestScore: 0,
          maxScore: sub.maxScore
        };
      }
      submissionsMap[sub.homeworkId].attempts++;
      submissionsMap[sub.homeworkId].bestScore = Math.max(
        submissionsMap[sub.homeworkId].bestScore, 
        sub.totalScore
      );
    });

    const homeworksWithStats = homeworks.map(hw => ({
      ...hw.toJSON(),
      stats: submissionsMap[hw.id] || null
    }));

    res.json({ homeworks: homeworksWithStats });
  } catch (error) {
    console.error('Get student homeworks error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create homework
router.post('/create', async (req, res) => {
  try {
    const { title, description, subjectId, openDate, closeDate, maxAttempts, questions } = req.body;

    if (!title || !subjectId || !openDate || !closeDate || !questions || questions.length === 0) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Create homework
    const homework = await Homework.create({
      title,
      description,
      subjectId,
      openDate,
      closeDate,
      maxAttempts,
      createdBy: 1, // TODO: Get from auth
      isActive: true
    });

    // Create questions
    const questionPromises = questions.map(q => 
      HomeworkQuestion.create({
        homeworkId: homework.id,
        questionType: q.questionType,
        questionText: q.questionText,
        options: q.options,
        correctAnswer: q.correctAnswer,
        explanation: q.explanation,
        points: q.points || 10,
        order: q.order || 0
      })
    );

    await Promise.all(questionPromises);

    res.status(201).json({ 
      message: 'Homework created successfully',
      homeworkId: homework.id
    });
  } catch (error) {
    console.error('Create homework error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update homework
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, subjectId, openDate, closeDate, maxAttempts, questions } = req.body;

    const homework = await Homework.findByPk(id);
    if (!homework) {
      return res.status(404).json({ message: 'Homework not found' });
    }

    // Update homework
    await homework.update({
      title,
      description,
      subjectId,
      openDate,
      closeDate,
      maxAttempts
    });

    // Delete old questions and create new ones
    await HomeworkQuestion.destroy({ where: { homeworkId: id } });

    const questionPromises = questions.map(q => 
      HomeworkQuestion.create({
        homeworkId: id,
        questionType: q.questionType,
        questionText: q.questionText,
        options: q.options,
        correctAnswer: q.correctAnswer,
        explanation: q.explanation,
        points: q.points || 10,
        order: q.order || 0
      })
    );

    await Promise.all(questionPromises);

    res.json({ message: 'Homework updated successfully' });
  } catch (error) {
    console.error('Update homework error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Toggle homework active status
router.patch('/:id/toggle', async (req, res) => {
  try {
    const { id } = req.params;

    const homework = await Homework.findByPk(id);
    if (!homework) {
      return res.status(404).json({ message: 'Homework not found' });
    }

    await homework.update({ isActive: !homework.isActive });

    res.json({ message: 'Status updated', isActive: homework.isActive });
  } catch (error) {
    console.error('Toggle homework error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete homework
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const homework = await Homework.findByPk(id);
    if (!homework) {
      return res.status(404).json({ message: 'Homework not found' });
    }

    await homework.destroy();

    res.json({ message: 'Homework deleted successfully' });
  } catch (error) {
    console.error('Delete homework error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Submit homework
router.post('/submit', async (req, res) => {
  try {
    const { homeworkId, studentId, answers, timeSpent } = req.body;

    // Get homework with questions
    const homework = await Homework.findByPk(homeworkId, {
      include: [{
        model: HomeworkQuestion,
        as: 'questions',
        order: [['order', 'ASC']]
      }]
    });

    if (!homework) {
      return res.status(404).json({ message: 'Homework not found' });
    }

    // Check if homework is open
    const now = new Date();
    if (now < new Date(homework.openDate) || now > new Date(homework.closeDate)) {
      return res.status(400).json({ message: 'Homework is not open for submissions' });
    }

    // Check attempts
    const submissionCount = await HomeworkSubmission.count({
      where: { homeworkId, userId: studentId }
    });

    if (homework.maxAttempts && submissionCount >= homework.maxAttempts) {
      return res.status(400).json({ message: 'Maximum attempts reached' });
    }

    // Calculate score
    let totalScore = 0;
    let maxScore = 0;
    const gradedAnswers = [];

    homework.questions.forEach((question, index) => {
      const userAnswer = answers[index];
      const isCorrect = checkAnswer(question, userAnswer);
      
      maxScore += question.points;
      if (isCorrect) {
        totalScore += question.points;
      }

      gradedAnswers.push({
        questionId: question.id,
        userAnswer: userAnswer,
        isCorrect: isCorrect
      });
    });

    // Create submission
    const submission = await HomeworkSubmission.create({
      homeworkId,
      userId: studentId,
      attemptNumber: submissionCount + 1,
      totalScore,
      maxScore,
      timeSpent,
      status: 'submitted'
    });

    // Create answers
    const answerPromises = gradedAnswers.map(ans =>
      HomeworkAnswer.create({
        submissionId: submission.id,
        questionId: ans.questionId,
        userAnswer: ans.userAnswer,
        isCorrect: ans.isCorrect
      })
    );

    await Promise.all(answerPromises);

    res.json({ 
      message: 'Homework submitted successfully',
      submissionId: submission.id,
      totalScore,
      maxScore,
      percentage: Math.round((totalScore / maxScore) * 100)
    });
  } catch (error) {
    console.error('Submit homework error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get homework submission with answers
router.get('/submission/:submissionId', async (req, res) => {
  try {
    const { submissionId } = req.params;

    const submission = await HomeworkSubmission.findByPk(submissionId, {
      include: [
        {
          model: Homework,
          as: 'homework',
          include: [
            {
              model: Subject,
              as: 'subject'
            },
            {
              model: HomeworkQuestion,
              as: 'questions',
              order: [['order', 'ASC']]
            }
          ]
        },
        {
          model: HomeworkAnswer,
          as: 'answers',
          include: [{
            model: HomeworkQuestion,
            as: 'question'
          }]
        }
      ]
    });

    if (!submission) {
      return res.status(404).json({ message: 'Submission not found' });
    }

    res.json({ submission });
  } catch (error) {
    console.error('Get submission error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get homework results (for admin)
router.get('/:id/results', async (req, res) => {
  try {
    const { id } = req.params;

    const results = await HomeworkSubmission.findAll({
      where: { homeworkId: id },
      include: [{
        model: User,
        as: 'student',
        attributes: ['id', 'name', 'email']
      }],
      order: [['submittedAt', 'DESC']]
    });

    res.json({ results });
  } catch (error) {
    console.error('Get results error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Helper function to check answers
function checkAnswer(question, userAnswer) {
  switch (question.questionType) {
    case 'single_choice':
      return userAnswer === question.correctAnswer;

    case 'multiple_choice':
      if (!Array.isArray(userAnswer) || !Array.isArray(question.correctAnswer)) return false;
      if (userAnswer.length !== question.correctAnswer.length) return false;
      const sorted1 = [...userAnswer].sort();
      const sorted2 = [...question.correctAnswer].sort();
      return sorted1.every((val, idx) => val === sorted2[idx]);

    case 'short_answer':
      if (!userAnswer) return false;
      const normalizedUser = userAnswer.toString().toLowerCase().trim().replace(/\s+/g, ' ');
      return question.correctAnswer.some(ans => 
        ans.toLowerCase().trim().replace(/\s+/g, ' ') === normalizedUser
      );

    case 'numeric':
      if (typeof userAnswer !== 'number') return false;
      const tolerance = question.correctAnswer.tolerance || 0;
      return Math.abs(userAnswer - question.correctAnswer.value) <= tolerance;

    case 'matching':
      if (!Array.isArray(userAnswer)) return false;
      return userAnswer.every((pair, idx) => {
        const correctPair = question.correctAnswer[idx];
        return pair.left === correctPair.left && pair.right === correctPair.right;
      });

    case 'ordering':
      if (!Array.isArray(userAnswer)) return false;
      return userAnswer.every((item, idx) => item === question.correctAnswer[idx]);

    case 'fill_blanks':
      if (!Array.isArray(userAnswer)) return false;
      return userAnswer.every((answer, idx) => {
        const normalizedUser = answer.toLowerCase().trim().replace(/\s+/g, ' ');
        const possibleAnswers = question.correctAnswer[idx];
        return possibleAnswers.some(ans => 
          ans.toLowerCase().trim().replace(/\s+/g, ' ') === normalizedUser
        );
      });

    case 'true_false':
      return userAnswer === question.correctAnswer;

    default:
      return false;
  }
}

module.exports = router;