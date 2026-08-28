const supplierService = require('../services/supplierService');

class SupplierController {
    async getAllSuppliers(req, res) {
        try {
            const suppliers = await supplierService.getAllSuppliers();
            res.json({
                status: 'success',
                message: 'Suppliers retrieved successfully',
                data: suppliers
            });
        } catch (error) {
            res.status(400).json({
                status: 'error',
                message: error.message,
                data: null
            });
        }
    }

    async createSupplier(req, res) {
        try {
            const { supplier_name, supplier_city, supplier_description, supplier_phone } = req.body;
            const supplier = await supplierService.createSupplier({
                name: supplier_name,
                city: supplier_city,
                description: supplier_description,
                phone: supplier_phone
            });
            res.status(201).json({
                status: 'success',
                message: 'Supplier created successfully',
                data: supplier
            });
        } catch (error) {
            res.status(400).json({
                status: 'error',
                message: error.message,
                data: null
            });
        }
    }

    async updateSupplier(req, res) {
        try {
            const { supplier_name, supplier_city, supplier_description, supplier_phone } = req.body;
            const supplier = await supplierService.updateSupplier(req.params.id, {
                name: supplier_name,
                city: supplier_city,
                description: supplier_description,
                phone: supplier_phone
            });
            res.json({
                status: 'success',
                message: 'Supplier updated successfully',
                data: supplier
            });
        } catch (error) {
            res.status(400).json({
                status: 'error',
                message: error.message,
                data: null
            });
        }
    }

    async deleteSupplier(req, res) {
        try {
            await supplierService.deleteSupplier(req.params.id);
            res.status(200).json({
                status: 'success',
                message: 'Supplier deleted successfully',
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

    async getPurchasesAndPayments(req, res) {
        try {
            const { supplierIds, startDate, endDate } = req.query;
            const purchasesAndPayments = await supplierService.getPurchasesAndPaymentsService(supplierIds, startDate, endDate);
            res.json({
                status: 'success',
                message: 'Purchases and payments retrieved successfully',
                data: purchasesAndPayments
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

module.exports = new SupplierController();