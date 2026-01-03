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
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: "No file uploaded"
            });
        }

        const { originalname: fileName, path: filePath } = req.file;
        const fileExtension = path.extname(fileName).toLowerCase();
        console.log(`Processing file: ${fileName} (${fileExtension})`);

        let pages = [];

        if (fileExtension === '.pdf') {
            pages = await extractPdfByPage(filePath);
        } else if (fileExtension === '.csv') {
            pages = await parseCSV(filePath);
        } else {
            return res.status(400).json({
                success: false,
                error: `Unsupported file type: ${fileExtension}. Supported types: .pdf, .csv`
            });
        }
        
        if (!pages || pages.length === 0) {
            const fileTypeName = fileExtension === '.pdf' ? 'PDF' : 'CSV';
            return res.status(400).json({
                success: false,
                error: `No data extracted from ${fileTypeName}. The file might be empty or corrupted.`
            });
        }

        const fileTypeLabel = fileExtension === '.pdf' ? 'pages' : 'rows';
        const fileTypeName = fileExtension === '.pdf' ? 'PDF' : 'CSV';
        console.log(`Extracted ${pages.length} ${fileTypeLabel} from ${fileTypeName}`);

        const chunksToStore = [];

        for (const { text, page } of pages) {
            if (!text || text.trim().length === 0) {
                console.log(`Skipping empty ${fileTypeLabel} ${page}`);
                continue;
            }

            const chunks = chunkText(text);

            for (const chunk of chunks) {
                if (!chunk || chunk.trim().length === 0) {
                    continue;
                }

                try {
                    const embedding = await embed(chunk);
                    
                    if (!embedding || !Array.isArray(embedding) || embedding.length === 0) {
                        console.warn(`Skipping chunk with invalid embedding on ${fileTypeLabel} ${page}`);
                        continue;
                    }

                    chunksToStore.push({
                        text: chunk.trim(),
                        embedding,
                        file: fileName,
                        page
                    });
                } catch (embedError) {
                    console.error(`Error embedding chunk on ${fileTypeLabel} ${page}:`, embedError);
                    continue;
                }
            }
        }

        if (chunksToStore.length === 0) {
            return res.status(400).json({
                success: false,
                error: `No valid text chunks found in the ${fileTypeName}. The file might be unreadable.`
            });
        }

        const pageCount = pages.length;
        const chunkCount = chunksToStore.length;
        console.log(`Created ${chunkCount} valid chunks from ${pageCount} ${fileTypeLabel}`);

        await storeChunks(chunksToStore);

        res.json({
            success: true,
            pages: pageCount,
            chunks: chunkCount,
            fileType: fileTypeName,
            message: `Successfully indexed ${chunkCount} chunks from ${pageCount} ${fileTypeLabel}`
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
