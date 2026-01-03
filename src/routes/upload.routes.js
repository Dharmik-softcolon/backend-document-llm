import express from "express";
import { upload } from "../utils/file.utils.js";
import { extractPdfByPage } from "../services/pdf.service.js";
import { chunkText } from "../services/chunk.service.js";
import { embed } from "../services/embedding.service.js";
import { storeChunks } from "../services/qdrant.service.js";
import path from "path";

const router = express.Router();

router.post("/", (req, res, next) => {
    upload.single("file")(req, res, (err) => {
        if (err) {
            return res.status(400).json({
                success: false,
                error: err.message || "Failed to upload file"
            });
        }
        next();
    });
}, async (req, res) => {
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

        if (fileExtension !== ".pdf") {
            return res.status(400).json({
                success: false,
                error: `Unsupported file type: ${fileExtension}. Supported type: .pdf`
            });
        }

        const pages = await extractPdfByPage(filePath);
        
        if (!pages || pages.length === 0) {
            return res.status(400).json({
                success: false,
                error: `No data extracted from PDF. The file might be empty or corrupted.`
            });
        }

        const fileTypeLabel = "pages";
        const fileTypeName = "PDF";
        console.log(`Extracted ${pages.length} ${fileTypeLabel} from ${fileTypeName}`);

        const chunksToStore = [];
        let totalTables = 0;

        for (const pageData of pages) {
            const { text, page, tables } = pageData;
            
            if (!text || text.trim().length === 0) {
                console.log(`Skipping empty ${fileTypeLabel} ${page}`);
                continue;
            }

            // Process main text content
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
                        page,
                        type: 'text'
                    });
                } catch (embedError) {
                    console.error(`Error embedding chunk on ${fileTypeLabel} ${page}:`, embedError);
                    continue;
                }
            }

            // Process tables separately with special handling
            if (tables && tables.length > 0) {
                totalTables += tables.length;
                
                for (const table of tables) {
                    try {
                        const tableText = `[TABLE]\n${table.content}\n[/TABLE]`;
                        const embedding = await embed(tableText);
                        
                        if (embedding && Array.isArray(embedding) && embedding.length > 0) {
                            chunksToStore.push({
                                text: tableText,
                                embedding,
                                file: fileName,
                                page,
                                type: 'table',
                                metadata: {
                                    rows: table.rows
                                }
                            });
                            console.log(`✓ Embedded table from page ${page} (${table.rows} rows)`);
                        }
                    } catch (tableEmbedError) {
                        console.error(`Error embedding table on page ${page}:`, tableEmbedError);
                        continue;
                    }
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
        if (totalTables > 0) {
            console.log(`Processed ${totalTables} tables from the document`);
        }

        await storeChunks(chunksToStore);

        res.json({
            success: true,
            pages: pageCount,
            chunks: chunkCount,
            tables: totalTables,
            fileType: fileTypeName,
            message: `Successfully indexed ${chunkCount} chunks from ${pageCount} ${fileTypeLabel}${totalTables > 0 ? ` (including ${totalTables} tables)` : ''}`
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
