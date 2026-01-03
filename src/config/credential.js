import dotenvFlow from 'dotenv-flow';

dotenvFlow.config();

export const config = {
    common: {
        port: process.env.PORT,
    },
    key: {
        gemini_key: process.env.GEMINI_API_KEY,
        qdrnt_key: process.env.QDRANT_API_KEY,
    },
    url: {
        qdrnt_url: process.env.QDRANT_URL,
    }
};
