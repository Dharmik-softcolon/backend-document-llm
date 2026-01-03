import { embed } from "./embedding.service.js";
import { search } from "./qdrant.service.js";
import { buildRagPrompt } from "../utils/prompt.utils.js";
import { gemini } from "../config/gemini.js";

const isGeneralConversation = (question) => {
    const trimmed = question.trim().toLowerCase();
    const patterns = [
        /^(hello|hi|hey|good morning|good afternoon|good evening|greetings)/,
        /^(thanks|thank you|bye|goodbye|see you)/,
        /^(my name is|i am|i'm|myself|my self|i'm called)/,
        /^(how are you|what's up|how's it going)/,
        /^(yes|no|ok|okay|sure|alright)$/
    ];
    return patterns.some(pattern => pattern.test(trimmed));
};

const cleanAnswer = (answer) => {
    if (!answer || typeof answer !== 'string') return answer;
    
    return answer
        .replace(/\[?CHUNK\s*\d+\]?/gi, '')
        .replace(/chunk\s*\d+/gi, '')
        .replace(/section\s*\d+/gi, '')
        .replace(/\b(this|these|the)\s+chunk(s)?\b/gi, '')
        .replace(/\bchunk(s)?\b/gi, '')
        .replace(/\b(according to|in|from|based on)\s+chunk\s*\d*\b/gi, '')
        .replace(/\*\s+/g, '• ')
        .replace(/\*\*/g, '')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/^\s*\*\s*$/gm, '')
        .replace(/^[\s]*[-*•]\s+/gm, '• ')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{4,}/g, '\n\n\n')
        .replace(/\n\s*\n\s*\n/g, '\n\n')
        .replace(/([^\n])\n•/g, '$1\n\n•')
        .replace(/•\s*\n\s*•/g, '•\n•')
        .replace(/\s*,\s*,/g, ',')
        .replace(/^\s*[-•]\s*$/gm, '')
        .replace(/\*\s*/g, '')
        .replace(/\s*\*/g, '')
        .split('\n')
        .map(line => line.trim())
        .join('\n')
        .trim();
};

export const ask = async (question) => {
    try {
        // Handle general conversation
        if (isGeneralConversation(question)) {
            const messages = [{
                role: 'system',
                content: 'You are a friendly and helpful document analysis assistant. Respond naturally and conversationally to greetings and general questions. If the user introduces themselves, acknowledge them warmly. If they ask about documents, let them know you\'re ready to help answer questions about uploaded documents. Keep your responses concise and friendly.'
            }, {
                role: 'user',
                content: question
            }];

            const response = await gemini.chat(messages);
            return cleanAnswer(response.choices[0].message.content);
        }

        // RAG flow: embed -> search -> generate
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

        const messages = buildRagPrompt({ question, chunks });
        const response = await gemini.chat(messages);
        
        return cleanAnswer(response.choices[0].message.content);
    } catch (error) {
        console.error("Error in ask function:", error);
        throw new Error(`Failed to process question: ${error.message || "Unknown error"}`);
    }
};
