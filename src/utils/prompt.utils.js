export const buildRagPrompt = ({
    question,
    chunks,
    fileName
}) => {
    // Separate text and table chunks
    const textChunks = chunks.filter(c => c.type !== 'table');
    const tableChunks = chunks.filter(c => c.type === 'table');
    
    let context = '';
    
    // Add text content
    if (textChunks.length > 0) {
        context += textChunks
            .map((c, idx) => {
                const pageInfo = c.page ? ` (Page ${c.page})` : '';
                return `[TEXT SECTION ${idx + 1}]${pageInfo}\n${c.text}`;
            })
            .join("\n\n---\n\n");
    }
    
    // Add table content separately
    if (tableChunks.length > 0) {
        if (context.length > 0) {
            context += "\n\n---\n\n";
        }
        context += tableChunks
            .map((c, idx) => {
                const pageInfo = c.page ? ` (Page ${c.page})` : '';
                return `[TABLE ${idx + 1}]${pageInfo}\n${c.text}`;
            })
            .join("\n\n---\n\n");
    }

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
3. When presenting tabular data:
   - Format tables clearly with proper alignment
   - Preserve table structure when relevant to the question
   - Explain the data if it needs context
4. Break down complex information into clear, digestible points.
5. Use proper spacing between bullet points for clarity.
6. If the information is not in the document, politely state: "The document does not contain information about this."
7. If multiple relevant passages exist, organize them into structured bullet points (only if 3+ items).
8. Maintain a professional yet friendly tone.
9. Do NOT reference chunk numbers, section numbers, TEXT SECTION, TABLE markers, or any internal processing details.
10. Do NOT make up information that isn't in the document context.
11. For general greetings or introductions, respond naturally and let the user know you're ready to help with their documents.
12. Do NOT use asterisks (*) for formatting - use bullet points (•) instead if needed.
13. When citing information, mention the page number in a natural way (e.g., "According to page 5..." or "On page 3...").

ANSWER FORMATTING GUIDELINES:
- For 1-2 items: Write in natural, flowing paragraph form
- For 3+ items: Use bullet points (•) for better readability
- For tables: Present data clearly, preserving structure when needed
- Use numbered lists (1., 2., 3.) only for sequential steps
- Keep each bullet point concise (1-2 sentences maximum)
- Group related information together
- Use line breaks between different sections or topics
- Make the answer scannable and easy to read
- NEVER use asterisks (*) - use bullet points (•) or write in paragraph form
- Include page references naturally in your response

Example for 1-2 items (no bullets):
According to page 5, revenue increased by 15% compared to the previous quarter. Operating expenses decreased by 8% during the same period (page 7).

Example for 3+ items (use bullets):
The document outlines three key findings:
• Revenue increased by 15% compared to the previous quarter (page 5)
• Operating expenses decreased by 8% during the same period (page 7)
• Net profit margin improved to 12% (page 9)

Example for tables:
The quarterly results (page 3) show:
- Q1: $1.2M revenue
- Q2: $1.5M revenue
- Q3: $1.8M revenue`
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
- If the answer involves tabular data, format it clearly
- Do NOT use asterisks (*) - use bullet points (•) or write in paragraph form
- Do NOT mention "TEXT SECTION", "TABLE", or any chunk markers
- Include page references naturally in your answer (e.g., "page 5" or "on page 3")
- Format your answer to be easy to read and understand:`
        }
    ];
};
