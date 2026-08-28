const prisma = require('../prisma/client');

class ProductService {
    async getAllProducts() {
        try {
            const products = await prisma.product.findMany({
                include: {
                    grade: {
                        select: {
                            name: true
                        }
                    }
                }
            });
            return products.map(product => ({
                ...product,
                grade_name: product.grade ? product.grade.name : null
            }));
        } catch (error) {
            console.error('Error fetching products:', error);
            throw error;
        }
    }

    async createProduct(data) {
        try {
            const product = await prisma.product.create({
                data,
                include: {
                    grade: {
                        select: {
                            name: true
                        }
                    }
                }
            });
            return {
                ...product,
                grade_name: product.grade ? product.grade.name : null
            };
        } catch (error) {
            console.error('Error creating product:', error);
            throw error;
        }
    }

    async updateProduct(id, data) {
        try {
            const product = await prisma.product.update({
                where: { id },
                data,
                include: {
                    grade: {
                        select: {
                            name: true
                        }
                    }
                }
            });
            return {
                ...product,
                grade_name: product.grade ? product.grade.name : null
            };
        } catch (error) {
            console.error('Error updating product:', error);
            throw error;
        }
    }

    async deleteProduct(id) {
        try {
            await prisma.product.delete({ where: { id } });
        } catch (error) {
            console.error('Error deleting product:', error);
            throw error;
        }
    }

}

module.exports = new ProductService();