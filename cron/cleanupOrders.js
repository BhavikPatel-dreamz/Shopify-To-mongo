import cron from 'node-cron';
import Order from '../models/Order.js';

// Run every day at midnight
const cleanupOldOrders = async () => {
    try {
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 36);

        const result = await Order.deleteMany({
            createdAt: { $lt: threeMonthsAgo }
        });

        console.log(`Cleaned up ${result.deletedCount} old orders`);
    } catch (error) {
        console.error('Error cleaning up old orders:', error);
    }
};

// Schedule the cleanup job to run daily at midnight
export const startOrderCleanupJob = () => {
    cron.schedule('0 0 * * *', cleanupOldOrders);
    console.log('Order cleanup job scheduled');
}; 