const express = require('express');
const paymentInController = require('../controllers/paymentInController');

const router = express.Router();

router.get('/', paymentInController.getAllPaymentsIn);
router.get('/:id', paymentInController.getPaymentInById);
router.post('/', paymentInController.createPaymentIn);
router.put('/:id', paymentInController.updatePaymentIn);
router.delete('/:id', paymentInController.deletePaymentIn);

module.exports = router;