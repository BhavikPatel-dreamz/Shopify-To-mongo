import 'dotenv/config';
import express, { json } from 'express';
import cors from 'cors';
import connectDB from './config/database.js';
import routes from './routes/index.js';
import webhookRoutes from './routes/webhookRoutes.js';
import { startOrderCleanupJob } from './cron/cleanupOrders.js';
//import ipWhitelist from './middleware/ipWhitelist.js'; // Import the middleware

const app = express();
const PORT = process.env.PORT || 3000;

// Connect to MongoDB
connectDB();

// Start the order cleanup cron job
startOrderCleanupJob();

// Middleware
app.use(cors());
app.use(json());
//app.use(ipWhitelist); // Apply the IP whitelist middleware

// Routes
app.use('/api', routes);

// Webhook routes - no IP whitelist for Shopify webhooks
app.use('/webhooks', webhookRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 