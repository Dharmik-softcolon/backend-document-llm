import { qdrant } from "../config/qdrant.js";
import { v4 as uuid } from "uuid";

const COLLECTION_NAME = "documents";
const VECTOR_SIZE = 768;

export const ensureCollection = async () => {
    try {
        const collections = await qdrant.getCollections();

        const exists = collections.collections.some(
            c => c.name === COLLECTION_NAME
        );

        if (!exists) {
            console.log("Creating Qdrant collection:", COLLECTION_NAME);

            await qdrant.createCollection(COLLECTION_NAME, {
                vectors: {
                    size: VECTOR_SIZE,
                    distance: "Cosine"
                }
            });
        } else {
            console.log("Qdrant collection already exists:", COLLECTION_NAME);
        }
    } catch (error) {
        console.error("Error ensuring Qdrant collection:", error);
        throw new Error(`Failed to ensure Qdrant collection: ${error.message || "Unknown error"}`);
    }
};

export const storeChunks = async (chunks) => {
    if (!chunks || !Array.isArray(chunks)) {
        throw new Error("Chunks must be a non-empty array");
    }

    const validChunks = chunks.filter(c => {
        return c && 
               c.text && 
               typeof c.text === 'string' && 
               c.text.trim().length > 0 &&
               c.embedding && 
               Array.isArray(c.embedding) && 
               c.embedding.length > 0;
    });

    if (validChunks.length === 0) {
        throw new Error("No valid chunks to store. All chunks are empty or invalid.");
    }

    try {
        await qdrant.upsert(COLLECTION_NAME, {
            wait: true,
            points: validChunks.map(c => ({
                id: uuid(),
                vector: c.embedding,
                payload: {
                    text: c.text.trim(),
                    file: c.file || "unknown",
                    page: c.page ?? null
                }
            }))
        });
        
        console.log(`Successfully stored ${validChunks.length} chunks (filtered ${chunks.length - validChunks.length} empty chunks)`);
    } catch (error) {
        console.error("Error storing chunks in Qdrant:", error);
        throw new Error(`Failed to store chunks: ${error.message || "Unknown error"}`);
    }
};

export const search = async (vector, limit = 5) => {
    try {
        if (!vector || !Array.isArray(vector) || vector.length === 0) {
            throw new Error("Vector must be a non-empty array");
        }

        const results = await qdrant.search(COLLECTION_NAME, {
            vector,
            limit
        });

        return results || [];
    } catch (error) {
        console.error("Error in Qdrant search:", error);
        throw new Error(`Vector search failed: ${error.message || "Unknown error"}`);
    }
};
