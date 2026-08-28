const { PurchaseItemStatus } = require('@prisma/client');
const prisma = require('../prisma/client');
const transactionService = require('./transactions');

class PurchaseService {
    async getAllPurchases() {
        return await prisma.purchase.findMany({
            include: {
                supplier: true,
                items: true
            },
            orderBy: {
                created_at: 'desc'
            }
        });
    }

    async getPurchaseById(id) {
        const purchase = await prisma.purchase.findUnique({
            where: { id },
            include: {
                supplier: true,
                items: true
            }
        });

        if (!purchase) {
            throw new Error('Purchase not found');
        }

        return purchase;
    }

    async createPurchase(purchaseData) {
        const { items, ...purchaseDetails } = purchaseData;

        return await prisma.$transaction(async(prisma) => {
            // Create the purchase record
            const purchase = await prisma.purchase.create({
                data: {
                    supplier_id: purchaseDetails.supplier_id,
                    supplier_name: purchaseDetails.supplier_name || '',
                    date: new Date(purchaseDetails.purchase_date), // Convert string date to Date object
                    total: purchaseDetails.total_amount,
                    purchase_no: purchaseDetails.purchase_no,
                    description: purchaseDetails.description,
                    godown: purchaseDetails.godown_no,
                    transport: purchaseDetails.transport,
                    received_by: purchaseDetails.received_by,
                    created_at: new Date(),
                    updated_at: new Date()
                }
            });

            // Create all purchase items
            if (items && items.length > 0) {
                const purchaseItemsData = items.map(item => ({
                    purchase_id: purchase.id,
                    product_id: item.product_id,
                    product_name: item.product_name,
                    grade_id: item.grade_id,
                    grade_name: item.grade_name,
                    roll_no: item.roll_no,
                    meters: item.meters,
                    price: item.price,
                    total: item.total_price,
                    status: PurchaseItemStatus.UNSOLD,
                    created_at: new Date(),
                    updated_at: new Date()
                }));

                await prisma.purchaseItem.createMany({
                    data: purchaseItemsData
                });
            }

            // Create transaction record
            await transactionService.createTransactionRecord(
                'outgoing',
                `Purchase ${purchase.purchase_no} from ${purchase.supplier_name}`,
                null,
                purchase.supplier_id,
                purchase.total
            );

            // Return the full purchase with items
            return await prisma.purchase.findUnique({
                where: { id: purchase.id },
                include: { items: true }
            });
        });
    }

    async updatePurchase(id, purchaseData) {
        const { items, ...purchaseDetails } = purchaseData;

        return await prisma.$transaction(async(prisma) => {
            // Update the purchase record
            const purchase = await prisma.purchase.update({
                where: { id },
                data: {
                    supplier_id: purchaseDetails.supplier_id,
                    supplier_name: purchaseDetails.supplier_name,
                    date: new Date(purchaseDetails.purchase_date),
                    total: purchaseDetails.total_amount,
                    purchase_no: purchaseDetails.purchase_no,
                    description: purchaseDetails.description,
                    godown: purchaseDetails.godown,
                    transport: purchaseDetails.transport,
                    received_by: purchaseDetails.received_by,
                    updated_at: new Date()
                }
            });

            // Delete existing items to replace with new ones
            await prisma.purchaseItem.deleteMany({
                where: { purchase_id: id }
            });

            // Add new items
            if (items && items.length > 0) {
                const purchaseItemsData = items.map(item => ({
                    purchase_id: purchase.id,
                    product_id: item.product_id,
                    product_name: item.product_name,
                    grade_id: item.grade_id,
                    grade_name: item.grade_name,
                    roll_no: item.roll_no,
                    meters: item.meters,
                    price: item.price,
                    total: item.total_price,
                    status: PurchaseItemStatus.UNSOLD,
                    created_at: new Date(),
                    updated_at: new Date()
                }));

                await prisma.purchaseItem.createMany({
                    data: purchaseItemsData
                });
            }

            // Create transaction record for the update
            await transactionService.createTransactionRecord(
                'outgoing',
                `Purchase updated ${purchase.purchase_no} from ${purchase.supplier_name}`,
                null,
                purchase.supplier_id,
                purchase.total
            );

            // Return the updated purchase with items
            return await prisma.purchase.findUnique({
                where: { id: purchase.id },
                include: { items: true }
            });
        });
    }

    async deletePurchase(id) {
        const purchase = await prisma.purchase.findUnique({
            where: { id },
            include: {
                supplier: true
            }
        });

        if (!purchase) {
            throw new Error('Purchase not found');
        }

        // Create transaction record for the deletion
        await transactionService.createTransactionRecord(
            'incoming',
            `Purchase deleted ${purchase.purchase_no} from ${purchase.supplier_name}`,
            null,
            purchase.supplier_id,
            purchase.total
        );

        // Items will cascade delete due to the relation setup
        await prisma.purchase.delete({
            where: { id }
        });

        return { message: 'Purchase deleted successfully' };
    }

    async getRollsByProductId(productId) {
        // get the rolls which are having status UNSOLD from purchase_items table
        const rolls = await prisma.purchaseItem.findMany({
            where: {
                product_id: productId,
                status: PurchaseItemStatus.UNSOLD
            }
        });

        return rolls;
    }

    async getPurchaseReport({ supplierIds, startDate, endDate }) {
        const where = {
            date: {
                gte: startDate,
                lte: endDate
            }
        };

        if (supplierIds && supplierIds.length > 0) {
            where.supplier_id = { in: supplierIds };
        }

        const purchases = await prisma.purchase.findMany({
            where,
            select: {
                id: true,
                purchase_no: true,
                godown: true,
                date: true,
                total: true,
                transport: true,
                received_by: true,
                supplier: {
                    select: {
                        id: true,
                        name: true
                    }
                }
            },
            orderBy: {
                date: 'desc'
            }
        });
        console.log(purchases);

        const purchasesWithGodown = await Promise.all(purchases.map(async purchase => ({
            ...purchase,
            godown: await this.getPurchaseGodownName(purchase.godown)
        })));

        return purchasesWithGodown;
    }
    async getPurchaseGodownName(godown) {
        const godownDetails = await prisma.godown.findUnique({
            where: { id: godown }
        });
        return godownDetails.name;
    }
}

module.exports = new PurchaseService();