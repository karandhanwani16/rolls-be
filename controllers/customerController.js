const customerService = require('../services/customerService');

class CustomerController {
    async getAllCustomers(req, res) {
        try {
            const customers = await customerService.getAllCustomers();
            res.json({
                status: 'success',
                message: 'Customers retrieved successfully',
                data: customers
            });
        } catch (error) {
            res.status(400).json({
                status: 'error',
                message: error.message,
                data: null
            });
        }
    }

    async createCustomer(req, res) {
        try {
            const { customer_name, customer_city, customer_description, customer_phone, customer_type } = req.body;
            const customer = await customerService.createCustomer({
                name: customer_name,
                city: customer_city,
                description: customer_description,
                phone: customer_phone,
                type: customer_type
            });
            res.status(201).json({
                status: 'success',
                message: 'Customer created successfully',
                data: customer
            });
        } catch (error) {
            res.status(400).json({
                status: 'error',
                message: error.message,
                data: null
            });
        }
    }

    async updateCustomer(req, res) {
        try {
            const { customer_name, customer_city, customer_description, customer_phone, customer_type } = req.body;
            const customer = await customerService.updateCustomer(req.params.id, {
                name: customer_name,
                city: customer_city,
                description: customer_description,
                phone: customer_phone,
                type: customer_type
            });
            res.json({
                status: 'success',
                message: 'Customer updated successfully',
                data: customer
            });
        } catch (error) {
            res.status(400).json({
                status: 'error',
                message: error.message,
                data: null
            });
        }
    }

    async deleteCustomer(req, res) {
        try {
            await customerService.deleteCustomer(req.params.id);
            res.status(200).json({
                status: 'success',
                message: 'Customer deleted successfully',
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

    async getSalesAndPayments(req, res) {
        try {
            const { customerIds, startDate, endDate, customerType } = req.query;
            const salesAndPayments = await customerService.getSalesAndPaymentsService(customerIds, startDate, endDate, customerType);
            res.json({
                status: 'success',
                message: 'Sales and payments retrieved successfully',
                data: salesAndPayments
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

module.exports = new CustomerController();