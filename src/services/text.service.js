import fs from "fs";

/**
 * Extract text from a plain text file
 * @param {string} filePath - Path to the text file
 * @returns {Promise<string>} - Extracted text content
 */
export const extractTextFromFile = async (filePath) => {
    try {
        if (!fs.existsSync(filePath)) {
            throw new Error(`File not found: ${filePath}`);
        }

        const content = fs.readFileSync(filePath, 'utf-8');

        if (!content || content.trim().length === 0) {
            throw new Error("Text file is empty");
        }

        console.log(`Extracted ${content.length} characters from text file`);
        return content.trim();
    } catch (error) {
        console.error("Error extracting text from file:", error);
        throw new Error(`Failed to extract text content: ${error.message || "Unknown error"}`);
    }
};

