/**
 * Builds a strict RAG prompt using retrieved chunks
 * Supports text + image references
 */

export function buildRagPrompt({
                                   question,
                                   chunks,
                                   fileName
                               }) {
    // Build clean context without chunk labels
    const context = chunks
        .map((c) => {
            const pageInfo = c.page ? ` (Page ${c.page})` : '';
            return `${c.text}${pageInfo}`;
        })
        .join("\n\n---\n\n");

    // Detect if question is general conversation vs document query
    const isGeneralConversation = /^(hello|hi|hey|good morning|good afternoon|good evening|thanks|thank you|bye|goodbye|my name is|i am|i'm|myself|my self)/i.test(question.trim());

    return [
        {
            role: "system",
            content: `You are an intelligent document analysis assistant. Your role is to help users understand and extract information from their documents.

IMPORTANT RULES:
1. Answer questions using ONLY the information provided in the document context below.
2. Format your answers using bullet points (•) or numbered lists for better readability.
3. Break down complex information into clear, digestible points.
4. Use proper spacing between bullet points for clarity.
5. If the information is not in the document, politely state: "The document does not contain information about this."
6. If multiple relevant passages exist, organize them into structured bullet points.
7. Maintain a professional yet friendly tone.
8. Do NOT reference chunk numbers, section numbers, or any internal processing details.
9. Do NOT make up information that isn't in the document context.
10. For general greetings or introductions, respond naturally and let the user know you're ready to help with their documents.

ANSWER FORMATTING GUIDELINES:
- Use bullet points (•) for lists and key points
- Use numbered lists (1., 2., 3.) for sequential steps or ordered information
- Keep each bullet point concise (1-2 sentences maximum)
- Group related information together
- Use line breaks between different sections or topics
- Make the answer scannable and easy to read

Example format:
• First key point or finding
• Second important point
• Third relevant information

Or for steps:
1. First step or action
2. Second step or action
3. Third step or action`
        },
        {
            role: "user",
            content: isGeneralConversation ? 
                `User: ${question}\n\nAssistant:` :
                `Based on the following document content, please answer the user's question using bullet points for better readability:

DOCUMENT CONTENT:
${context}

USER'S QUESTION:
${question}

Please provide a clear, well-structured answer with bullet points (•) based on the document content above. Format your answer to be easy to read and understand:`
        }
    ];
}
