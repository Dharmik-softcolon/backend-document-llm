export const chunkText = (text, size = 800, overlap = 200) => {
    if (!text || typeof text !== 'string') {
        return [];
    }

    const trimmedText = text.trim();
    if (trimmedText.length === 0) {
        return [];
    }

    let chunks = [];
    let start = 0;

    while (start < trimmedText.length) {
        const chunk = trimmedText.slice(start, start + size).trim();
        if (chunk.length > 0) {
            chunks.push(chunk);
        }
        start += size - overlap;
    }

    return chunks;
};
