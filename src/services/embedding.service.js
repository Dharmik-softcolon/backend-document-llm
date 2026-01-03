import { config } from "../config/credential.js";

export const embed = async (text) => {
    try {
        if (!text || typeof text !== 'string' || text.trim().length === 0) {
            throw new Error("Text input is required for embedding");
        }

        const apiKey = config.key.gemini_key;
        if (!apiKey) {
            throw new Error("Gemini API key is not configured");
        }

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: "models/text-embedding-004",
                    content: {
                        parts: [{ text: text }]
                    }
                })
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Gemini Embedding API error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        const embedding = data.embedding?.values;
        
        if (!embedding || !Array.isArray(embedding) || embedding.length === 0) {
            throw new Error("Failed to generate embedding: invalid response from Gemini API");
        }

        return embedding;
    } catch (error) {
        console.error("Error in embed function:", error);
        throw new Error(`Embedding failed: ${error.message || "Unknown error"}`);
    }
};
