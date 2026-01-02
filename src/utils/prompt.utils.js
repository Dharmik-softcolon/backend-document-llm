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
2. Format your answers intelligently:
   - Use bullet points (•) ONLY when you have 3 or more distinct points to list
   - For 1-2 items, write in natural paragraph form without bullets
   - Use numbered lists (1., 2., 3.) only for sequential steps or ordered information
3. Break down complex information into clear, digestible points.
4. Use proper spacing between bullet points for clarity.
5. If the information is not in the document, politely state: "The document does not contain information about this."
6. If multiple relevant passages exist, organize them into structured bullet points (only if 3+ items).
7. Maintain a professional yet friendly tone.
8. Do NOT reference chunk numbers, section numbers, or any internal processing details.
9. Do NOT make up information that isn't in the document context.
10. For general greetings or introductions, respond naturally and let the user know you're ready to help with their documents.
11. Do NOT use asterisks (*) for formatting - use bullet points (•) instead if needed.

ANSWER FORMATTING GUIDELINES:
- For 1-2 items: Write in natural, flowing paragraph form
- For 3+ items: Use bullet points (•) for better readability
- Use numbered lists (1., 2., 3.) only for sequential steps
- Keep each bullet point concise (1-2 sentences maximum)
- Group related information together
- Use line breaks between different sections or topics
- Make the answer scannable and easy to read
- NEVER use asterisks (*) - use bullet points (•) or write in paragraph form

Example for 1-2 items (no bullets):
The document shows that revenue increased by 15% compared to the previous quarter. Operating expenses decreased by 8% during the same period.

Example for 3+ items (use bullets):
• Revenue increased by 15% compared to the previous quarter
• Operating expenses decreased by 8% during the same period
• Net profit margin improved to 12%`
        },
        {
            role: "user",
            content: isGeneralConversation ? 
                `User: ${question}\n\nAssistant:` :
                `Based on the following document content, please answer the user's question:

DOCUMENT CONTENT:
${context}

USER'S QUESTION:
${question}

Please provide a clear, well-structured answer based on the document content above:
- If you have 1-2 points to share, write in natural paragraph form (no bullets)
- If you have 3 or more distinct points, use bullet points (•) for better readability
- Do NOT use asterisks (*) - use bullet points (•) or write in paragraph form
- Format your answer to be easy to read and understand:`
        }
    ];
}
