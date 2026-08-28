const jwt = require('jsonwebtoken');
const prisma = require('../prisma/client');

const getUserFromToken = async(req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            return res.status(401).json({
                success: false,
                error: 'No authorization header'
            });
        }

        // Extract JWT token from authorization header
        const token = authHeader.split(' ')[1];

        // Verify the JWT token using our secret
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Get user from database
        const user = await prisma.profile.findUnique({
            where: { id: decoded.id }
        });
        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'User not found'
            });
        }

        req.user = {
            id: user.id,
            email: decoded.email,
            role: user.role
        };

        next();
    } catch (error) {
        console.error('Auth error:', error);
        return res.status(401).json({
            success: false,
            error: 'Authentication error'
        });
    }
};

module.exports = {
    getUserFromToken
};