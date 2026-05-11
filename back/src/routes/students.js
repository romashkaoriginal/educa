const express = require('express');
const studentController = require('../controllers/studentController');

const router = express.Router();

// Получить всех студентов
router.get('/', studentController.getAllStudents);

// Создать студента
router.post('/', studentController.createStudent);

// Обновить студента (ВСЕ данные)
router.put('/:studentId', studentController.updateStudent);

// Обновить предметы студента
router.put('/:studentId/subjects', studentController.updateStudentSubjects);

// Обновить доступ студента
router.put('/:studentId/access', studentController.updateStudentAccess);

// Продлить доступ
router.post('/:studentId/extend-access', studentController.extendStudentAccess);

// Удалить студента
router.delete('/:studentId', studentController.deleteStudent);

module.exports = router;