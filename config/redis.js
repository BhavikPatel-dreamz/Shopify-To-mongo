import 'dotenv/config';

const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD,
  
  // Default TTLs in seconds
  ttls: {
    filter: 30 * 60, // 30 minutes
    count: 5 * 60,   // 5 minutes
    product: 60 * 60 // 1 hour
  },
  
  // Key prefixes for different types of data
  prefixes: {
    filter: 'filter:',
    count: 'count:',
    product: 'product:'
  }
};

export default redisConfig; 