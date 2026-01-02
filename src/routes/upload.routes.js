import express from "express";
import { upload } from "../utils/file.utils.js";
import { extractPdfByPage } from "../services/pdf.service.js";
import { parseCSV } from "../services/csv.service.js";
import { chunkText } from "../services/chunk.service.js";
import { embed } from "../services/embedding.service.js";
import { storeChunks } from "../services/qdrant.service.js";
import path from "path";

const router = express.Router();

router.post("/", upload.single("file"), async (req, res) => {
    try {
        // Validate file
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: "No file uploaded"
            });
        }

        const fileName = req.file.originalname;
        const fileExtension = path.extname(fileName).toLowerCase();
        console.log(`Processing file: ${fileName} (${fileExtension})`);

        let pages = [];

        // Handle different file types
        if (fileExtension === '.pdf') {
            // 1️⃣ Extract page-wise text from PDF (with OCR fallback)
            pages = await extractPdfByPage(req.file.path);
        } else if (fileExtension === '.csv') {
            // 1️⃣ Parse CSV file
            pages = await parseCSV(req.file.path);
        } else {
            return res.status(400).json({
                success: false,
                error: `Unsupported file type: ${fileExtension}. Supported types: .pdf, .csv`
            });
        }
        
        if (!pages || pages.length === 0) {
            return res.status(400).json({
                success: false,
                error: `No data extracted from ${fileExtension === '.pdf' ? 'PDF' : 'CSV'}. The file might be empty or corrupted.`
            });
        }

        console.log(`Extracted ${pages.length} ${fileExtension === '.pdf' ? 'pages' : 'rows'} from ${fileExtension === '.pdf' ? 'PDF' : 'CSV'}`);

        const chunksToStore = [];
        let totalChunksCreated = 0;

        // 2️⃣ Chunk each page/row separately
        for (const pageObj of pages) {
            // Skip empty pages/rows
            if (!pageObj.text || pageObj.text.trim().length === 0) {
                console.log(`Skipping empty ${fileExtension === '.pdf' ? 'page' : 'row'} ${pageObj.page}`);
                continue;
            }

            const chunks = chunkText(pageObj.text);
            totalChunksCreated += chunks.length;

            for (const chunk of chunks) {
                // Skip empty chunks
                if (!chunk || chunk.trim().length === 0) {
                    continue;
                }

                try {
                    const embedding = await embed(chunk);
                    
                    // Validate embedding
                    if (!embedding || !Array.isArray(embedding) || embedding.length === 0) {
                        console.warn(`Skipping chunk with invalid embedding on ${fileExtension === '.pdf' ? 'page' : 'row'} ${pageObj.page}`);
                        continue;
                    }

                    chunksToStore.push({
                        text: chunk.trim(),
                        embedding,
                        file: fileName,
                        page: pageObj.page
                    });
                } catch (embedError) {
                    console.error(`Error embedding chunk on ${fileExtension === '.pdf' ? 'page' : 'row'} ${pageObj.page}:`, embedError);
                    // Continue with other chunks
                    continue;
                }
            }
        }

        if (chunksToStore.length === 0) {
            return res.status(400).json({
                success: false,
                error: `No valid text chunks found in the ${fileExtension === '.pdf' ? 'PDF' : 'CSV'}. The file might be unreadable.`
            });
        }

        console.log(`Created ${chunksToStore.length} valid chunks from ${pages.length} ${fileExtension === '.pdf' ? 'pages' : 'rows'}`);

        // 3️⃣ Store in Qdrant
        await storeChunks(chunksToStore);

        res.json({
            success: true,
            pages: pages.length,
            chunks: chunksToStore.length,
            fileType: fileExtension === '.pdf' ? 'PDF' : 'CSV',
            message: `Successfully indexed ${chunksToStore.length} chunks from ${pages.length} ${fileExtension === '.pdf' ? 'pages' : 'rows'}`
        });
    } catch (error) {
        console.error("Error in upload route:", error);
        res.status(500).json({
            success: false,
            error: "Failed to process and index document",
            message: error.message || "Unknown error occurred"
        });
    }
});

export default router;
