import fs from "fs";
import pdf from "pdf-parse";
import { runOCR } from "./ocr.service.js";
import path from "path";
import { createCanvas, loadImage } from "canvas";
import "../utils/promise-polyfill.js"; // Polyfill for Promise.withResolvers

// Lazy load pdfjs-dist legacy build for Node.js compatibility
let pdfjsLib = null;

async function getPdfJs() {
    if (!pdfjsLib) {
        try {
            // Use legacy build for Node.js compatibility (works with Node.js < 22)
            pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
            
            // Try to configure worker - catch any errors and continue
            try {
                // For Node.js, we can disable worker by setting it to empty string or not setting it
                // Some versions require a string, others accept null/undefined
                if (pdfjsLib.GlobalWorkerOptions) {
                    // Try different approaches
                    try {
                        pdfjsLib.GlobalWorkerOptions.workerSrc = '';
                    } catch (e1) {
                        try {
                            delete pdfjsLib.GlobalWorkerOptions.workerSrc;
                        } catch (e2) {
                            // If all fail, just continue - pdfjs might work without explicit worker setup
                        }
                    }
                }
            } catch (workerError) {
                // Ignore worker setup errors - pdfjs might work without it
                console.warn("Could not configure PDF.js worker (this is usually fine for Node.js):", workerError.message);
            }
        } catch (error) {
            console.error("Failed to load pdfjs-dist:", error);
            throw new Error("PDF.js library not available. Please install pdfjs-dist.");
        }
    }
    return pdfjsLib;
}

/**
 * Convert Buffer to Uint8Array (required by pdfjs-dist)
 */
function bufferToUint8Array(buffer) {
    return new Uint8Array(buffer);
}

/**
 * Convert PDF page to image using pdfjs-dist and canvas (pure Node.js solution)
 */
async function convertPdfPageToImage(pdfPath, pageNumber, outputDir) {
    try {
        const pdfjs = await getPdfJs();
        const dataBuffer = fs.readFileSync(pdfPath);
        
        // Convert Buffer to Uint8Array (required by pdfjs-dist)
        const uint8Array = bufferToUint8Array(dataBuffer);
        
        // Use legacy build compatible method
        const loadingTask = pdfjs.getDocument({ 
            data: uint8Array,
            useSystemFonts: true,
            verbosity: 0, // Suppress warnings
            isEvalSupported: false // Disable eval for security
        });
        const pdfDocument = await loadingTask.promise;
        
        // Validate page number
        if (pageNumber < 1 || pageNumber > pdfDocument.numPages) {
            throw new Error(`Invalid page number: ${pageNumber}. PDF has ${pdfDocument.numPages} pages.`);
        }
        
        // Get the page (pageNumber is 1-indexed, but pdfjs uses 0-indexed)
        const page = await pdfDocument.getPage(pageNumber - 1);
        
        // Set scale for good quality (2x for 300 DPI equivalent)
        const scale = 2.0;
        const viewport = page.getViewport({ scale });
        
        // Create canvas with proper dimensions (ensure integers)
        const width = Math.ceil(viewport.width);
        const height = Math.ceil(viewport.height);
        const canvas = createCanvas(width, height);
        const context = canvas.getContext('2d');
        
        // Ensure canvas is properly initialized with white background
        context.fillStyle = '#FFFFFF';
        context.fillRect(0, 0, width, height);
        
        // Render PDF page to canvas - pass context directly
        // node-canvas should be compatible with pdfjs
        const renderContext = {
            canvasContext: context,
            viewport: viewport
        };
        
        // Render the page
        const renderTask = page.render(renderContext);
        await renderTask.promise;
        
        // Save as PNG
        const imagePath = path.join(outputDir, `page-${pageNumber}.png`);
        const buffer = canvas.toBuffer('image/png');
        fs.writeFileSync(imagePath, buffer);
        
        console.log(`✓ Converted page ${pageNumber} to image (${canvas.width}x${canvas.height})`);
        return imagePath;
    } catch (error) {
        console.error(`Error converting PDF page ${pageNumber} to image:`, error.message);
        return null;
    }
}

/**
 * Extract text from PDF with OCR fallback for image-based PDFs
 */
export async function extractPdfByPage(filePath) {
    try {
        if (!fs.existsSync(filePath)) {
            throw new Error(`File not found: ${filePath}`);
        }

        const dataBuffer = fs.readFileSync(filePath);

        if (!dataBuffer || dataBuffer.length === 0) {
            throw new Error("PDF file is empty");
        }

        const pages = [];
        let useOCR = false;

        // First, try to extract text normally
        try {
            const pdfData = await pdf(dataBuffer, {
                pagerender: pageData => {
                    return pageData.getTextContent().then(textContent => {
                        const text = textContent.items
                            .map(item => item.str)
                            .join(" ")
                            .trim();

                        // Only add pages with text content
                        if (text.length > 0) {
                            pages.push({
                                page: pageData.pageIndex + 1,
                                text
                            });
                        }

                        return text;
                    }).catch(error => {
                        console.error(`Error extracting text from page ${pageData.pageIndex + 1}:`, error);
                        return "";
                    });
                }
            });

            // If we got pages with text, return them
            if (pages.length > 0) {
                console.log(`Extracted text from ${pages.length} pages using text extraction`);
                return pages;
            }
        } catch (textExtractionError) {
            console.log("Text extraction failed, will try OCR:", textExtractionError.message);
            useOCR = true;
        }

        // If no text was found, try OCR
        if (pages.length === 0 || useOCR) {
            console.log("No text found in PDF, attempting OCR on image-based PDF...");
            
            // Get total number of pages using pdf-parse (more reliable)
            let totalPages = 1;
            try {
                const pdfData = await pdf(dataBuffer);
                totalPages = pdfData.numpages || 1;
                console.log(`PDF has ${totalPages} pages (from pdf-parse)`);
            } catch (error) {
                console.warn("Could not determine page count, assuming 1 page:", error.message);
            }
            
            // Create temp directory for images
            const tempDir = path.join(path.dirname(filePath), 'temp_images');
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }

            // Try to initialize pdfjs once
            let pdfjsInitialized = false;
            try {
                await getPdfJs();
                pdfjsInitialized = true;
            } catch (pdfjsError) {
                console.warn("Could not initialize pdfjs, will skip OCR:", pdfjsError.message);
            }

            // Process each page with OCR (only if pdfjs is available)
            if (pdfjsInitialized) {
                for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
                    try {
                        console.log(`Processing page ${pageNum}/${totalPages} with OCR...`);
                        
                        // Convert PDF page to image
                        const imagePath = await convertPdfPageToImage(filePath, pageNum, tempDir);
                        
                        if (imagePath && fs.existsSync(imagePath)) {
                            // Run OCR on the image
                            const ocrText = await runOCR(imagePath);
                            
                            if (ocrText && ocrText.trim().length > 0) {
                                pages.push({
                                    page: pageNum,
                                    text: ocrText.trim()
                                });
                                console.log(`✓ OCR extracted text from page ${pageNum} (${ocrText.trim().length} characters)`);
                            } else {
                                console.log(`⚠ No text found via OCR on page ${pageNum}`);
                            }
                            
                            // Clean up image file
                            try {
                                fs.unlinkSync(imagePath);
                            } catch (unlinkError) {
                                // Ignore cleanup errors
                            }
                        } else {
                            console.warn(`Could not convert page ${pageNum} to image`);
                        }
                    } catch (pageError) {
                        console.error(`Error processing page ${pageNum} with OCR:`, pageError.message);
                        continue;
                    }
                }
            } else {
                console.warn("PDF.js not available - OCR cannot be performed. Please ensure pdfjs-dist is properly installed.");
            }

            // Clean up temp directory
            try {
                if (fs.existsSync(tempDir)) {
                    const files = fs.readdirSync(tempDir);
                    files.forEach(file => {
                        try {
                            fs.unlinkSync(path.join(tempDir, file));
                        } catch (e) {
                            // Ignore
                        }
                    });
                    fs.rmdirSync(tempDir);
                }
            } catch (cleanupError) {
                // Ignore cleanup errors
            }
        }

        if (pages.length === 0) {
            throw new Error("No text content found in PDF even after OCR. The PDF might be corrupted, unreadable, or contain only images without text. If this is an image-based PDF, ensure pdfjs-dist and canvas are properly installed.");
        }

        console.log(`Successfully extracted text from ${pages.length} pages (using ${useOCR ? 'OCR' : 'text extraction'})`);
        return pages;
    } catch (error) {
        console.error("Error extracting PDF:", error);
        throw new Error(`Failed to extract PDF content: ${error.message || "Unknown error"}`);
    }
}
