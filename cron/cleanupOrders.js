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
        return { success: true, deletedCount: result.deletedCount };
    } catch (error) {
        console.error('Error cleaning up old orders:', error);
        return { success: false, error: error.message };
    }
};

// Schedule both cleanup jobs to run daily at midnight
export const startOrderCleanupJob = () => {
    cron.schedule('0 0 * * *', cleanupOldOrders);
    console.log('Daily cleanup jobs scheduled');
};
;


