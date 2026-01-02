/**
 * Builds a strict RAG prompt using retrieved chunks
 * Supports text + image references
 */

export function buildRagPrompt({
                                   question,
                                   chunks,
                                   fileName
                               }) {
    const context = chunks
        .map(
            (c, i) => `
[CHUNK ${i + 1}]
Source File: ${c.file || fileName}
Page: ${c.page ?? "N/A"}
Content:
${c.text}
`
        )
        .join("\n");

    // Detect if question is general conversation vs document query
    const isGeneralConversation = /^(hello|hi|hey|good morning|good afternoon|good evening|thanks|thank you|bye|goodbye|my name is|i am|i'm|myself|my self)/i.test(question.trim());
    const isGreeting = /^(hello|hi|hey|good morning|good afternoon|good evening)/i.test(question.trim());
    const isIntroduction = /^(my name is|i am|i'm|myself|my self)/i.test(question.trim());

    return [
        {
            role: "system",
            content: `
You are a helpful document intelligence assistant.

RULES:
- If the user greets you or introduces themselves, respond politely and conversationally. You can acknowledge them and let them know you're ready to help with questions about their documents.
- For questions about the uploaded document(s), answer ONLY using the provided document context.
- If a document question cannot be answered from the context, say: "The document does not contain this information."
- If the question refers to images, explain what the image represents using OCR or description.
- Cite chunk numbers or page numbers when relevant for document questions.
- Do NOT hallucinate information that's not in the document.
- Be friendly and conversational for general interactions, but factual and precise for document queries.
`
        },
        {
            role: "user",
            content: isGeneralConversation ? 
                `QUESTION: ${question}\n\nANSWER:` :
                `
DOCUMENT CONTEXT:
${context}

QUESTION:
${question}

ANSWER:
`
        }
    ];
}
