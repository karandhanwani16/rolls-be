const express = require('express');
const gradeController = require('../controllers/gradeController');
const { getUserFromToken } = require('../middleware/auth');

const router = express.Router();

router.get('/', getUserFromToken, gradeController.getAllGrades);
router.post('/', getUserFromToken, gradeController.createGrade);
router.put('/:id', getUserFromToken, gradeController.updateGrade);
router.delete('/:id', getUserFromToken, gradeController.deleteGrade);

module.exports = router;