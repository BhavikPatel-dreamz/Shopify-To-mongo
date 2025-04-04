import 'dotenv/config';
import { Pinecone } from "@pinecone-database/pinecone";

const pineconeConfig = {
  apiKey: process.env.PINECONE_API_KEY,
  environment: process.env.PINECONE_ENVIRONMENT,
  indexName: process.env.PINECONE_INDEX
};

// Initialize Pinecone
const pc = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY,
  environment: process.env.PINECONE_ENVIRONMENT,
});

const PineconeIndex = pc.index(pineconeConfig.indexName);
console.log(`✅ Pinecone connected to index: ${pineconeConfig.indexName}`);

export { pineconeConfig, pc, PineconeIndex }; 