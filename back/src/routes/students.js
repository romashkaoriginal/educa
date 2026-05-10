const express = require('express');
const studentController = require('../controllers/studentController');

const router = express.Router();

// Получить всех студентов
router.get('/', studentController.getAllStudents);

// Создать студента
router.post('/', studentController.createStudent);

// Обновить предметы студента
router.put('/:studentId/subjects', studentController.updateStudentSubjects);

// Обновить даты доступа студента к приложению
router.put('/:studentId/access', studentController.updateStudentAccess);

// Продлить доступ студента
router.post('/:studentId/extend-access', studentController.extendStudentAccess);

// Назначить пользователя студентом
router.post('/:userId/assign-as-student', studentController.assignUserAsStudent);

// Удалить студента
router.delete('/:studentId', studentController.deleteStudent);

module.exports = router;