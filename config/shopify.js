import 'dotenv/config';
import { request } from 'graphql-request';

const shopifyConfig = {
  storeName: process.env.SHOPIFY_STORE_NAME,
  adminApiToken: process.env.SHOPIFY_ADMIN_API_TOKEN,
  apiVersion: process.env.SHOPIFY_API_VERSION || '2023-07',
  storeUrl: process.env.SHOPIFY_STORE_URL,
  endpoint: `https://${process.env.SHOPIFY_STORE_NAME}.myshopify.com/admin/api/${process.env.SHOPIFY_API_VERSION || '2023-07'}/graphql.json`,
  headers: {
    'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_API_TOKEN
  }
};

// Shopify client for making GraphQL requests
const shopifyClient = {
  async query(queryDocument, variables = {}) {
    try {
      return await request(
        shopifyConfig.endpoint,
        queryDocument,
        variables,
        shopifyConfig.headers
      );
    } catch (error) {
      console.error('Shopify API Error:', error);
      throw error;
    }
  }
};

export { shopifyConfig, shopifyClient }; 