import 'dotenv/config';

const embeddingConfig = {
  provider: process.env.EMBEDDING_PROVIDER || 'huggingface',
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_EMBEDDING_MODEL
  },
  huggingface: {
    apiKey: process.env.HUGGINGFACE_API_KEY,
    apiUrl: process.env.HUGGINGFACE_API_URL
  },
  embeddingApiUrl: process.env.EMBEDDING_API_URL
};

export default embeddingConfig; 