import { qdrant } from "../config/qdrant.js";
import { v4 as uuid } from "uuid";

const COLLECTION_NAME = "documents";
const VECTOR_SIZE = 768; // Gemini embedding size

/**
 * Ensure collection exists (run once at startup)
 */
export async function ensureCollection() {
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
}

/**
 * Store document chunks
 */
export async function storeChunks(chunks) {
    await qdrant.upsert(COLLECTION_NAME, {
        wait: true,
        points: chunks.map(c => ({
            id: uuid(),
            vector: c.embedding,
            payload: {
                text: c.text,
                file: c.file || "unknown",
                page: c.page ?? null
            }
        }))
    });
}

/**
 * Search similar chunks
 */
export async function search(vector, limit = 5) {
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
}
