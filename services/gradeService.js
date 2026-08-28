const prisma = require('../prisma/client');

class GradeService {
    async getAllGrades() {
        try {
            const grades = await prisma.grade.findMany();
            return grades;
        } catch (error) {
            console.error('Error fetching grades:', error);
            throw error;
        }
    }

    async createGrade(data) {
        try {
            const grade = await prisma.grade.create({ data });
            return grade;
        } catch (error) {
            console.error('Error creating grade:', error);
            throw error;
        }
    }

    async updateGrade(id, data) {
        try {
            const grade = await prisma.grade.update({
                where: { id },
                data
            });
            return grade;
        } catch (error) {
            console.error('Error updating grade:', error);
            throw error;
        }
    }

    async deleteGrade(id) {
        try {
            await prisma.grade.delete({ where: { id } });
        } catch (error) {
            console.error('Error deleting grade:', error);
            throw error;
        }
    }
}

module.exports = new GradeService();