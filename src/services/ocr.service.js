import Tesseract from "tesseract.js";
import fs from "fs";

/**
 * Run OCR on an image file
 */
export async function runOCR(imagePath) {
    try {
        if (!fs.existsSync(imagePath)) {
            throw new Error(`Image file not found: ${imagePath}`);
        }

        console.log(`Running OCR on: ${imagePath}`);
        
        const { data: { text } } = await Tesseract.recognize(imagePath, "eng", {
            logger: m => {
                // Only log progress for long operations
                if (m.status === 'recognizing text') {
                    console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`);
                }
            }
        });

        return text.trim();
    } catch (error) {
        console.error("OCR Error:", error);
        throw new Error(`OCR failed: ${error.message || "Unknown error"}`);
    }
}
