const paymentInService = require('../services/paymentInService');

class PaymentInController {
    async getAllPaymentsIn(req, res) {
        try {
            const paymentsIn = await paymentInService.getAllPaymentsIn();
            return res.json({
                success: true,
                data: paymentsIn
            });
        } catch (error) {
            console.error('Get all payments in error:', error);
            return res.status(400).json({
                success: false,
                error: error.message
            });
        }
    }

    async getPaymentInById(req, res) {
        try {
            const { id } = req.params;
            const paymentIn = await paymentInService.getPaymentInById(id);
            return res.json({
                success: true,
                data: paymentIn
            });
        } catch (error) {
            console.error('Get payment in by id error:', error);
            return res.status(400).json({
                success: false,
                error: error.message
            });
        }
    }

    async createPaymentIn(req, res) {
        try {
            const paymentInData = req.body;
            const newPaymentIn = await paymentInService.createPaymentIn(paymentInData);
            return res.status(201).json({
                success: true,
                data: newPaymentIn
            });
        } catch (error) {
            console.error('Create payment in error:', error);
            return res.status(400).json({
                success: false,
                error: error.message
            });
        }
    }

    async updatePaymentIn(req, res) {
        try {
            const { id } = req.params;
            const paymentInData = req.body;
            const updatedPaymentIn = await paymentInService.updatePaymentIn(id, paymentInData);
            return res.json({
                success: true,
                data: updatedPaymentIn
            });
        } catch (error) {
            console.error('Update payment in error:', error);
            return res.status(400).json({
                success: false,
                error: error.message
            });
        }
    }

    async deletePaymentIn(req, res) {
        try {
            const { id } = req.params;
            const result = await paymentInService.deletePaymentIn(id);
            return res.json({
                success: true,
                message: result.message
            });
        } catch (error) {
            console.error('Delete payment in error:', error);
            return res.status(400).json({
                success: false,
                error: error.message
            });
        }
    }
}

module.exports = new PaymentInController();