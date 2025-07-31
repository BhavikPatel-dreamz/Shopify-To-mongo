import cron from 'node-cron';
import Product from '../models/Product.js';

const cleanupProducts = async () => {
    try {
        const now = new Date();
        
        const result = await Product.deleteMany({
            updatedAt: {$lte: now },
            isAvailable: false
        });

        console.log(`Cleaned up ${result.deletedCount} unavailable products`);
        return { success: true, deletedCount: result.deletedCount };
    } catch (error) {
        console.error('Error cleaning up products:', error);
        return { success: false, error: error.message };
    }
};

export const startProductCleanupJob = () => {
     cron.schedule('0 */3 * * *', cleanupProducts);
    console.log('Cleanup jobs scheduled every 3 hours');
}
