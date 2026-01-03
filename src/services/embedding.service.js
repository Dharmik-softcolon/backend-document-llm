import { gemini } from "../config/gemini.js";

export const embed = async (text) => {
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
        throw new Error("Text input is required for embedding");
    }

    const response = await gemini.embed(text);
    return response.data[0].embedding;
};
