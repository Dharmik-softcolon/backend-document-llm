import { config } from "./credential.js";

const MODEL_NAME = 'gemini-2.5-flash';
const MODEL_VERSION = 'v1';
const EMBEDDING_MODEL = 'text-embedding-004';

class GeminiClient {
    constructor() {
        this.apiKey = config.key.gemini_key;
        if (!this.apiKey) {
            throw new Error("Gemini API key is not configured");
        }
    }

    async chat(messages) {
        const url = `https://generativelanguage.googleapis.com/${MODEL_VERSION}/models/${MODEL_NAME}:generateContent?key=${this.apiKey}`;
        
        // Convert OpenAI format messages to Gemini format
        const geminiContents = this.convertMessagesToGeminiFormat(messages);
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: geminiContents })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!content) {
            throw new Error("No response from Gemini API");
        }

        return {
            choices: [{
                message: { content }
            }]
        };
    }

    async embed(text) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${this.apiKey}`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: `models/${EMBEDDING_MODEL}`,
                content: { parts: [{ text }] }
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Gemini Embedding API error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        const embedding = data.embedding?.values;
        
        if (!embedding || !Array.isArray(embedding) || embedding.length === 0) {
            throw new Error("Invalid embedding response");
        }

        return {
            data: [{ embedding }]
        };
    }

    convertMessagesToGeminiFormat(messages) {
        const geminiContents = [];
        
        for (const msg of messages) {
            if (msg.role === 'system') {
                // Gemini doesn't have system role, so we add it as user with model acknowledgment
                geminiContents.push({
                    role: 'user',
                    parts: [{ text: msg.content }]
                });
                geminiContents.push({
                    role: 'model',
                    parts: [{ text: 'I understand. I will follow these instructions.' }]
                });
            } else if (msg.role === 'user') {
                geminiContents.push({
                    role: 'user',
                    parts: [{ text: msg.content }]
                });
            } else if (msg.role === 'assistant') {
                geminiContents.push({
                    role: 'model',
                    parts: [{ text: msg.content }]
                });
            }
        }
        
        return geminiContents;
    }
}

export const gemini = new GeminiClient();
