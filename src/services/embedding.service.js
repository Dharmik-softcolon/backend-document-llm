import { gemini } from "../config/gemini.js";

/**
 * Generate embeddings for text with retry logic
 * @param {string} text - Text to embed
 * @param {number} retries - Number of retry attempts
 * @returns {Promise<number[]>} - Embedding vector
 */
export const embed = async (text, retries = 3) => {
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
        throw new Error("Text input is required for embedding");
    }

    // Truncate text if too long (Gemini embedding has limits)
    const maxLength = 10000;
    const truncatedText = text.length > maxLength 
        ? text.substring(0, maxLength) + '...' 
        : text;

    let lastError;
    
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            const response = await gemini.embed(truncatedText);
            
            if (!response?.data?.[0]?.embedding) {
                throw new Error("Invalid embedding response structure");
            }
            
            const embedding = response.data[0].embedding;
            
            // Validate embedding
            if (!Array.isArray(embedding) || embedding.length === 0) {
                throw new Error("Embedding is not a valid array");
            }
            
            // Check if all values are numbers
            if (!embedding.every(val => typeof val === 'number' && !isNaN(val))) {
                throw new Error("Embedding contains invalid values");
            }
            
            return embedding;
        } catch (error) {
            lastError = error;
            console.warn(`Embedding attempt ${attempt + 1}/${retries} failed:`, error.message);
            
            // Wait before retry (exponential backoff)
            if (attempt < retries - 1) {
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
            }
        }
    }
    
    throw new Error(`Failed to generate embedding after ${retries} attempts: ${lastError.message}`);
};

/**
 * Batch embed multiple texts
 * @param {string[]} texts - Array of texts to embed
 * @param {number} batchSize - Number of texts to process at once
 * @returns {Promise<number[][]>} - Array of embedding vectors
 */
export const batchEmbed = async (texts, batchSize = 5) => {
    if (!Array.isArray(texts) || texts.length === 0) {
        throw new Error("Texts must be a non-empty array");
    }

    const embeddings = [];
    
    for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        const batchPromises = batch.map(text => embed(text));
        
        try {
            const batchEmbeddings = await Promise.all(batchPromises);
            embeddings.push(...batchEmbeddings);
            console.log(`Processed batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(texts.length / batchSize)}`);
        } catch (error) {
            console.error(`Error processing batch starting at index ${i}:`, error);
            throw error;
        }
        
        // Small delay between batches to avoid rate limiting
        if (i + batchSize < texts.length) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }
    
    return embeddings;
};
