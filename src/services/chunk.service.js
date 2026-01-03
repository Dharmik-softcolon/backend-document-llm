/**
 * Intelligent text chunking with semantic awareness
 * Preserves context by respecting sentence and paragraph boundaries
 * @param {string} text - Text to chunk
 * @param {number} maxChunkSize - Maximum chunk size in characters
 * @param {number} overlap - Overlap between chunks in characters
 * @returns {Array<string>} - Array of text chunks
 */
export const chunkText = (text, maxChunkSize = 1000, overlap = 200) => {
    if (!text || typeof text !== 'string') {
        return [];
    }

    const trimmedText = text.trim();
    if (trimmedText.length === 0) {
        return [];
    }

    // If text is smaller than maxChunkSize, return as single chunk
    if (trimmedText.length <= maxChunkSize) {
        return [trimmedText];
    }

    const chunks = [];
    let currentPosition = 0;

    while (currentPosition < trimmedText.length) {
        let endPosition = currentPosition + maxChunkSize;

        // If we're at the end of the text, take the rest
        if (endPosition >= trimmedText.length) {
            const finalChunk = trimmedText.slice(currentPosition).trim();
            if (finalChunk.length > 0) {
                chunks.push(finalChunk);
            }
            break;
        }

        // Try to find a good breaking point (semantic chunking)
        let breakPoint = findSemanticBreakpoint(
            trimmedText, 
            currentPosition, 
            endPosition,
            maxChunkSize
        );

        // Extract the chunk
        const chunk = trimmedText.slice(currentPosition, breakPoint).trim();
        if (chunk.length > 0) {
            chunks.push(chunk);
        }

        // Move position forward with overlap
        currentPosition = breakPoint - overlap;
        
        // Ensure we're making progress
        if (currentPosition <= chunks[chunks.length - 1]?.length || currentPosition < 0) {
            currentPosition = breakPoint;
        }
    }

    return chunks.filter(chunk => chunk.length > 50); // Filter out very small chunks
};

/**
 * Find semantic breakpoint to preserve context
 * Priority: paragraph > sentence > word boundary
 */
const findSemanticBreakpoint = (text, start, idealEnd, maxSize) => {
    const searchStart = idealEnd - Math.min(200, maxSize * 0.3);
    const searchEnd = Math.min(idealEnd + 100, text.length);
    const searchText = text.slice(searchStart, searchEnd);

    // Look for paragraph break (double newline or single newline with significant indent)
    const paragraphBreaks = [
        /\n\n+/g,
        /\n\s{4,}/g,
        /\n\t+/g
    ];

    for (const pattern of paragraphBreaks) {
        const matches = [...searchText.matchAll(pattern)];
        if (matches.length > 0) {
            const match = matches[0];
            return searchStart + match.index + match[0].length;
        }
    }

    // Look for sentence boundary
    const sentenceEndPattern = /[.!?]\s+(?=[A-Z])/g;
    const sentenceMatches = [...searchText.matchAll(sentenceEndPattern)];
    
    if (sentenceMatches.length > 0) {
        // Prefer sentence breaks closer to ideal end
        const closestMatch = sentenceMatches.reduce((closest, match) => {
            const matchPos = searchStart + match.index + match[0].length;
            const closestPos = searchStart + closest.index + closest[0].length;
            return Math.abs(matchPos - idealEnd) < Math.abs(closestPos - idealEnd) 
                ? match : closest;
        });
        return searchStart + closestMatch.index + closestMatch[0].length;
    }

    // Look for single newline
    const newlineIndex = searchText.lastIndexOf('\n', searchText.length - searchStart + idealEnd);
    if (newlineIndex !== -1 && newlineIndex > searchText.length / 3) {
        return searchStart + newlineIndex + 1;
    }

    // Look for word boundary (space)
    const spaceIndex = searchText.lastIndexOf(' ', searchText.length - searchStart + idealEnd);
    if (spaceIndex !== -1 && spaceIndex > searchText.length / 3) {
        return searchStart + spaceIndex + 1;
    }

    // Fallback to ideal end
    return idealEnd;
};
