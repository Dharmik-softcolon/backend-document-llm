import { embed } from "./embedding.service.js";
import { search } from "./qdrant.service.js";
import { buildRagPrompt } from "../utils/prompt.utils.js";
import { config } from "../config/credential.js";

const MODEL_NAME = 'gemini-2.5-flash';
const MODEL_VERSION = 'v1';

const isGeneralConversation = (question) => {
    const trimmed = question.trim().toLowerCase();
    const conversationalPatterns = [
        /^(hello|hi|hey|good morning|good afternoon|good evening|greetings)/,
        /^(thanks|thank you|bye|goodbye|see you)/,
        /^(my name is|i am|i'm|myself|my self|i'm called)/,
        /^(how are you|what's up|how's it going)/,
        /^(yes|no|ok|okay|sure|alright)$/
    ];
    
    return conversationalPatterns.some(pattern => pattern.test(trimmed));
};

const cleanAnswer = (answer) => {
    if (!answer || typeof answer !== 'string') {
        return answer;
    }

    let cleaned = answer;

    cleaned = cleaned.replace(/\[?CHUNK\s*\d+\]?/gi, '');
    cleaned = cleaned.replace(/chunk\s*\d+/gi, '');
    cleaned = cleaned.replace(/section\s*\d+/gi, '');
    
    cleaned = cleaned.replace(/\b(this|these|the)\s+chunk(s)?\b/gi, '');
    
    cleaned = cleaned.replace(/\bchunk(s)?\b/gi, '');
    
    cleaned = cleaned.replace(/\b(according to|in|from|based on)\s+chunk\s*\d*\b/gi, '');
    
    cleaned = cleaned.replace(/\*\s+/g, '• ');
    cleaned = cleaned.replace(/\*\*/g, '');
    cleaned = cleaned.replace(/\*([^*]+)\*/g, '$1');
    cleaned = cleaned.replace(/^\s*\*\s*$/gm, '');
    
    cleaned = cleaned.replace(/^[\s]*[-*•]\s+/gm, '• ');
    cleaned = cleaned.replace(/^[\s]*\d+[\.)]\s+/gm, (match) => {
        return match.trim() + ' ';
    });
    
    cleaned = cleaned.replace(/[ \t]+/g, ' ');
    cleaned = cleaned.replace(/\n{4,}/g, '\n\n\n');
    cleaned = cleaned.replace(/\n\s*\n\s*\n/g, '\n\n');
    
    cleaned = cleaned.replace(/([^\n])\n•/g, '$1\n\n•');
    cleaned = cleaned.replace(/•\s*\n\s*•/g, '•\n•');
    
    cleaned = cleaned.replace(/\s*,\s*,/g, ',');
    cleaned = cleaned.replace(/^\s*[-•]\s*$/gm, '');
    
    cleaned = cleaned.replace(/\*\s*/g, '');
    cleaned = cleaned.replace(/\s*\*/g, '');
    
    cleaned = cleaned.split('\n').map(line => line.trim()).join('\n');
    
    cleaned = cleaned.trim();
    
    return cleaned;
};

export const ask = async (question) => {
    try {
        const isConversational = isGeneralConversation(question);
        
        if (isConversational) {
            const apiKey = config.key.gemini_key;
            if (!apiKey) {
                throw new Error("Gemini API key is not configured");
            }

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

            const url = `https://generativelanguage.googleapis.com/${MODEL_VERSION}/models/${MODEL_NAME}:generateContent?key=${apiKey}`;
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

        const vector = await embed(question);

        const hits = await search(vector, 7);

        if (!hits || hits.length === 0) {
            return "No relevant information found in the uploaded document.";
        }

        const chunks = hits.map(h => ({
            text: h.payload.text,
            page: h.payload.page,
            file: h.payload.file
        }));

        const messages = buildRagPrompt({
            question,
            chunks
        });

        const apiKey = config.key.gemini_key;
        if (!apiKey) {
            throw new Error("Gemini API key is not configured");
        }

        const geminiContents = [];
        
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

        messages
            .filter(m => m.role === 'user')
            .forEach(m => {
                geminiContents.push({
                    role: 'user',
                    parts: [{ text: m.content }]
                });
            });

        const url = `https://generativelanguage.googleapis.com/${MODEL_VERSION}/models/${MODEL_NAME}:generateContent?key=${apiKey}`;
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
            throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        const answer = data.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!answer) {
            throw new Error("No answer received from Gemini API");
        }
        
        const cleanedAnswer = cleanAnswer(answer);
        
        return cleanedAnswer;
    } catch (error) {
        console.error("Error in ask function:", error);
        throw new Error(`Failed to process question: ${error.message || "Unknown error"}`);
    }
};
