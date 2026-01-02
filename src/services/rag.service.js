import { embed } from "./embedding.service.js";
import { search } from "./qdrant.service.js";
import { openai } from "../config/gemini.js";
import { buildRagPrompt } from "../utils/prompt.utils.js";
import { config } from "../config/credential.js";

// Cache for the working model name to avoid repeated API calls
let cachedWorkingModel = null;

/**
 * Helper function to list available Gemini models (for debugging)
 */
async function listAvailableModels() {
    try {
        const apiKey = config.key.gemini_key;
        if (!apiKey) return null;

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
        );

        if (response.ok) {
            const data = await response.json();
            return data.models || [];
        }
    } catch (error) {
        console.error("Failed to list models:", error);
    }
    return null;
}

/**
 * Get a working Gemini model, using cache if available
 */
async function getWorkingModel(apiKey) {
    // If we have a cached working model, try it first
    if (cachedWorkingModel) {
        return cachedWorkingModel;
    }

    // Try to fetch available models and find one that works
    const availableModels = await listAvailableModels();
    
    if (availableModels && availableModels.length > 0) {
        // Find a model that supports generateContent
        const generateContentModel = availableModels.find(m => 
            m.supportedGenerationMethods?.includes('generateContent')
        );
        
        if (generateContentModel) {
            const modelName = generateContentModel.name.replace('models/', '');
            cachedWorkingModel = { name: modelName, version: 'v1beta' };
            console.log(`Cached working model: ${modelName}`);
            return cachedWorkingModel;
        }
    }

    return null;
}

/**
 * Check if a question is general conversation (not document-related)
 */
function isGeneralConversation(question) {
    const trimmed = question.trim().toLowerCase();
    const conversationalPatterns = [
        /^(hello|hi|hey|good morning|good afternoon|good evening|greetings)/,
        /^(thanks|thank you|bye|goodbye|see you)/,
        /^(my name is|i am|i'm|myself|my self|i'm called)/,
        /^(how are you|what's up|how's it going)/,
        /^(yes|no|ok|okay|sure|alright)$/
    ];
    
    return conversationalPatterns.some(pattern => pattern.test(trimmed));
}

/**
 * Clean answer to remove chunk references and technical details
 * Preserves bullet points and formatting
 */
function cleanAnswer(answer) {
    if (!answer || typeof answer !== 'string') {
        return answer;
    }

    let cleaned = answer;

    // Remove chunk references (e.g., "chunk 1", "chunk 2", "[CHUNK 1]", etc.)
    cleaned = cleaned.replace(/\[?CHUNK\s*\d+\]?/gi, '');
    cleaned = cleaned.replace(/chunk\s*\d+/gi, '');
    cleaned = cleaned.replace(/section\s*\d+/gi, '');
    
    // Remove references to "the chunk", "this chunk", "these chunks"
    cleaned = cleaned.replace(/\b(this|these|the)\s+chunk(s)?\b/gi, '');
    
    // Remove standalone chunk mentions (but preserve bullet points)
    cleaned = cleaned.replace(/\bchunk(s)?\b/gi, '');
    
    // Remove patterns like "According to chunk..." or "In chunk..."
    cleaned = cleaned.replace(/\b(according to|in|from|based on)\s+chunk\s*\d*\b/gi, '');
    
    // Normalize bullet points - ensure consistent formatting
    cleaned = cleaned.replace(/^[\s]*[-*•]\s+/gm, '• '); // Standardize to bullet
    cleaned = cleaned.replace(/^[\s]*\d+[\.)]\s+/gm, (match) => {
        // Preserve numbered lists
        return match.trim() + ' ';
    });
    
    // Clean up excessive whitespace but preserve line breaks for bullet points
    cleaned = cleaned.replace(/[ \t]+/g, ' '); // Multiple spaces to single space
    cleaned = cleaned.replace(/\n{4,}/g, '\n\n\n'); // Max 3 consecutive newlines
    cleaned = cleaned.replace(/\n\s*\n\s*\n/g, '\n\n'); // Normalize triple newlines
    
    // Ensure proper spacing around bullet points
    cleaned = cleaned.replace(/([^\n])\n•/g, '$1\n\n•'); // Add blank line before bullet if missing
    cleaned = cleaned.replace(/•\s*\n\s*•/g, '•\n•'); // Remove extra lines between bullets
    
    // Clean up double commas and other artifacts
    cleaned = cleaned.replace(/\s*,\s*,/g, ',');
    cleaned = cleaned.replace(/^\s*[-•]\s*$/gm, ''); // Remove standalone bullet markers
    
    // Remove leading/trailing whitespace from each line
    cleaned = cleaned.split('\n').map(line => line.trim()).join('\n');
    
    // Final trim
    cleaned = cleaned.trim();
    
    return cleaned;
}

export async function ask(question) {
    try {
        // Check if this is general conversation
        const isConversational = isGeneralConversation(question);
        
        // For conversational queries, respond directly without document search
        if (isConversational) {
            const apiKey = config.key.gemini_key;
            if (!apiKey) {
                throw new Error("Gemini API key is not configured");
            }

            // Use cached model or get working model
            let workingModel = await getWorkingModel(apiKey);
            if (!workingModel) {
                workingModel = { name: 'gemini-2.5-flash', version: 'v1beta' };
            }

            // Build conversational message with context
            const conversationalPrompt = `You are a friendly and helpful document analysis assistant. 
Respond naturally and conversationally to greetings and general questions. 
If the user introduces themselves, acknowledge them warmly.
If they ask about documents, let them know you're ready to help answer questions about uploaded documents.
Keep your responses concise and friendly.

User: ${question}
Assistant:`;

            const conversationalMessages = [
                {
                    role: "user",
                    parts: [{ text: conversationalPrompt }]
                }
            ];

            const url = `https://generativelanguage.googleapis.com/${workingModel.version}/models/${workingModel.name}:generateContent?key=${apiKey}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: conversationalMessages
                })
            });

            if (response.ok) {
                const data = await response.json();
                const answer = data.candidates?.[0]?.content?.parts?.[0]?.text;
                if (answer) {
                    return cleanAnswer(answer);
                }
            }
        }

        // For document-related queries, use RAG
        // 1️⃣ Embed query
        const vector = await embed(question);

        // 2️⃣ Vector search - get more chunks for better context
        const hits = await search(vector, 7);

        if (!hits || hits.length === 0) {
            return "No relevant information found in the uploaded document.";
        }

        const chunks = hits.map(h => ({
            text: h.payload.text,
            page: h.payload.page,
            file: h.payload.file
        }));

        // 3️⃣ Build RAG prompt
        const messages = buildRagPrompt({
            question,
            chunks
        });

        // 4️⃣ Gemini API - Direct API call with correct model names
        const apiKey = config.key.gemini_key;
        if (!apiKey) {
            throw new Error("Gemini API key is not configured");
        }

        // Convert messages to Gemini format
        const geminiContents = [];
        
        // Add system instruction as first user message if exists
        const systemMessage = messages.find(m => m.role === 'system');
        if (systemMessage) {
            geminiContents.push({
                role: 'user',
                parts: [{ text: systemMessage.content }]
            });
            geminiContents.push({
                role: 'model',
                parts: [{ text: 'I understand. I will answer based only on the provided document context.' }]
            });
        }

        // Add user messages
        messages
            .filter(m => m.role === 'user')
            .forEach(m => {
                geminiContents.push({
                    role: 'user',
                    parts: [{ text: m.content }]
                });
            });

        // Try to get working model (from cache or by fetching available models)
        let workingModel = await getWorkingModel(apiKey);
        
        // If no cached model, try common model names first (with gemini-2.5-flash prioritized)
        const modelAttempts = [
            { name: 'gemini-2.5-flash', version: 'v1beta' }, // Known working model
            { name: 'gemini-2.0-flash-exp', version: 'v1beta' },
            { name: 'gemini-1.5-pro', version: 'v1beta' },
            { name: 'gemini-pro', version: 'v1beta' },
            { name: 'gemini-1.5-flash', version: 'v1beta' }
        ];

        let answer;
        let lastError;
        let successfulModel = null;

        // If we have a cached working model, try it first
        if (workingModel) {
            try {
                const url = `https://generativelanguage.googleapis.com/${workingModel.version}/models/${workingModel.name}:generateContent?key=${apiKey}`;
                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        contents: geminiContents
                    })
                });

                if (response.ok) {
                    const data = await response.json();
                    answer = data.candidates?.[0]?.content?.parts?.[0]?.text;
                    if (answer) {
                        successfulModel = workingModel;
                    }
                }
            } catch (error) {
                // Cache might be stale, clear it and try other models
                cachedWorkingModel = null;
                workingModel = null;
            }
        }

        // If cached model didn't work, try the list of common models
        if (!answer) {
            for (const attempt of modelAttempts) {
                // Skip if we already tried this (cached model)
                if (workingModel && attempt.name === workingModel.name && attempt.version === workingModel.version) {
                    continue;
                }

                try {
                    const url = `https://generativelanguage.googleapis.com/${attempt.version}/models/${attempt.name}:generateContent?key=${apiKey}`;
                    
                    const response = await fetch(url, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            contents: geminiContents
                        })
                    });

                    if (!response.ok) {
                        const errorText = await response.text();
                        lastError = `Model ${attempt.name} (${attempt.version}): ${response.status}`;
                        continue; // Try next model
                    }

                    const data = await response.json();
                    answer = data.candidates?.[0]?.content?.parts?.[0]?.text;
                    
                    if (answer) {
                        successfulModel = attempt;
                        // Cache the working model for future requests
                        cachedWorkingModel = attempt;
                        console.log(`Successfully used and cached model: ${attempt.name} (${attempt.version})`);
                        break; // Success!
                    }
                } catch (error) {
                    lastError = `Model ${attempt.name} (${attempt.version}): ${error.message}`;
                    continue; // Try next model
                }
            }
        }

        // If still no answer, fetch available models and try them
        if (!answer && !workingModel) {
            console.log("All standard model attempts failed, fetching available models...");
            workingModel = await getWorkingModel(apiKey);
            
            if (workingModel) {
                try {
                    const url = `https://generativelanguage.googleapis.com/${workingModel.version}/models/${workingModel.name}:generateContent?key=${apiKey}`;
                    const response = await fetch(url, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            contents: geminiContents
                        })
                    });

                    if (response.ok) {
                        const data = await response.json();
                        answer = data.candidates?.[0]?.content?.parts?.[0]?.text;
                        if (answer) {
                            successfulModel = workingModel;
                            console.log(`Successfully used model from available list: ${workingModel.name}`);
                        }
                    }
                } catch (error) {
                    console.error(`Failed with available model ${workingModel.name}:`, error);
                }
            }
        }

        if (!answer) {
            throw new Error(`All Gemini model attempts failed. Last error: ${lastError || 'Unknown error'}`);
        }
        
        // Clean the answer to remove chunk references and technical details
        const cleanedAnswer = cleanAnswer(answer);
        
        return cleanedAnswer;
    } catch (error) {
        console.error("Error in ask function:", error);
        throw new Error(`Failed to process question: ${error.message || "Unknown error"}`);
    }
}
