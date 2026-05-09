const express = require('express');
const studentController = require('../controllers/studentController');

const router = express.Router();

// Получить всех студентов
router.get('/', studentController.getAllStudents);

// Создать студента
router.post('/', studentController.createStudent);

// Обновить предметы студента
router.put('/:studentId/subjects', studentController.updateStudentSubjects);

// Удалить студента
router.delete('/:studentId', studentController.deleteStudent);

module.exports = router;