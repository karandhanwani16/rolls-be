const gradeService = require('../services/gradeService');

class GradeController {
    async getAllGrades(req, res) {
        try {
            const grades = await gradeService.getAllGrades();
            res.json({
                status: 'success',
                message: 'Grades retrieved successfully',
                data: grades
            });
        } catch (error) {
            res.status(400).json({
                status: 'error',
                message: error.message,
                data: null
            });
        }
    }

    async createGrade(req, res) {
        try {
            const { name } = req.body;
            const grade = await gradeService.createGrade({
                name: name,
            });
            res.status(201).json({
                status: 'success',
                message: 'Grade created successfully',
                data: grade
            });
        } catch (error) {
            res.status(400).json({
                status: 'error',
                message: error.message,
                data: null
            });
        }
    }

    async updateGrade(req, res) {
        try {
            const { name } = req.body;
            const grade = await gradeService.updateGrade(req.params.id, {
                name: name,
            });
            res.json({
                status: 'success',
                message: 'Grade updated successfully',
                data: grade
            });
        } catch (error) {
            res.status(400).json({
                status: 'error',
                message: error.message,
                data: null
            });
        }
    }

    async deleteGrade(req, res) {
        try {
            await gradeService.deleteGrade(req.params.id);
            res.status(200).json({
                status: 'success',
                message: 'Grade deleted successfully',
                data: null
            });
        } catch (error) {
            res.status(400).json({
                status: 'error',
                message: error.message,
                data: null
            });
        }
    }
}

module.exports = new GradeController();