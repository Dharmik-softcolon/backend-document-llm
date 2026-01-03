import fs from "fs";
import pdf from "pdf-parse";
import { runOCR } from "./ocr.service.js";
import path from "path";
import { createCanvas } from "canvas";

let pdfjsLib = null;

const getPdfJs = async () => {
    if (!pdfjsLib) {
        try {
            pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
            
            try {
                if (pdfjsLib.GlobalWorkerOptions) {
                    try {
                        pdfjsLib.GlobalWorkerOptions.workerSrc = '';
                    } catch (e1) {
                        try {
                            delete pdfjsLib.GlobalWorkerOptions.workerSrc;
                        } catch (e2) {
                        }
                    }
                }
            } catch (workerError) {
                console.warn("Could not configure PDF.js worker (this is usually fine for Node.js):", workerError.message);
            }
        } catch (error) {
            console.error("Failed to load pdfjs-dist:", error);
            throw new Error("PDF.js library not available. Please install pdfjs-dist.");
        }
    }
    return pdfjsLib;
};

const bufferToUint8Array = (buffer) => new Uint8Array(buffer);

const convertPdfPageToImage = async (pdfPath, pageNumber, outputDir) => {
    try {
        const pdfjs = await getPdfJs();
        const dataBuffer = fs.readFileSync(pdfPath);
        
        const uint8Array = bufferToUint8Array(dataBuffer);
        
        const loadingTask = pdfjs.getDocument({ 
            data: uint8Array,
            useSystemFonts: true,
            verbosity: 0,
            isEvalSupported: false
        });
        const pdfDocument = await loadingTask.promise;
        
        if (pageNumber < 1 || pageNumber > pdfDocument.numPages) {
            throw new Error(`Invalid page number: ${pageNumber}. PDF has ${pdfDocument.numPages} pages.`);
        }
        
        const page = await pdfDocument.getPage(pageNumber - 1);
        
        const scale = 2.0;
        const viewport = page.getViewport({ scale });
        
        const width = Math.ceil(viewport.width);
        const height = Math.ceil(viewport.height);
        const canvas = createCanvas(width, height);
        const context = canvas.getContext('2d');
        
        context.fillStyle = '#FFFFFF';
        context.fillRect(0, 0, width, height);
        
        const renderContext = {
            canvasContext: context,
            viewport: viewport
        };
        
        const renderTask = page.render(renderContext);
        await renderTask.promise;
        
        const imagePath = path.join(outputDir, `page-${pageNumber}.png`);
        const buffer = canvas.toBuffer('image/png');
        fs.writeFileSync(imagePath, buffer);
        
        console.log(`✓ Converted page ${pageNumber} to image (${canvas.width}x${canvas.height})`);
        return imagePath;
    } catch (error) {
        console.error(`Error converting PDF page ${pageNumber} to image:`, error.message);
        return null;
    }
};

export const extractPdfByPage = async (filePath) => {
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

        try {
            const pdfData = await pdf(dataBuffer, {
                pagerender: pageData => {
                    return pageData.getTextContent().then(textContent => {
                        const text = textContent.items
                            .map(item => item.str)
                            .join(" ")
                            .trim();

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

            if (pages.length > 0) {
                console.log(`Extracted text from ${pages.length} pages using text extraction`);
                return pages;
            }
        } catch (textExtractionError) {
            console.log("Text extraction failed, will try OCR:", textExtractionError.message);
            useOCR = true;
        }

        if (pages.length === 0 || useOCR) {
            console.log("No text found in PDF, attempting OCR on image-based PDF...");
            
            let totalPages = 1;
            try {
                const pdfData = await pdf(dataBuffer);
                totalPages = pdfData.numpages || 1;
                console.log(`PDF has ${totalPages} pages (from pdf-parse)`);
            } catch (error) {
                console.warn("Could not determine page count, assuming 1 page:", error.message);
            }
            
            const tempDir = path.join(path.dirname(filePath), 'temp_images');
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }

            let pdfjsInitialized = false;
            try {
                await getPdfJs();
                pdfjsInitialized = true;
            } catch (pdfjsError) {
                console.warn("Could not initialize pdfjs, will skip OCR:", pdfjsError.message);
            }

            if (pdfjsInitialized) {
                for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
                    try {
                        console.log(`Processing page ${pageNum}/${totalPages} with OCR...`);
                        
                        const imagePath = await convertPdfPageToImage(filePath, pageNum, tempDir);
                        
                        if (imagePath && fs.existsSync(imagePath)) {
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
                            
                            try {
                                fs.unlinkSync(imagePath);
                            } catch (unlinkError) {
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

            try {
                if (fs.existsSync(tempDir)) {
                    const files = fs.readdirSync(tempDir);
                    files.forEach(file => {
                        try {
                            fs.unlinkSync(path.join(tempDir, file));
                        } catch (e) {
                        }
                    });
                    fs.rmdirSync(tempDir);
                }
            } catch (cleanupError) {
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
};
