import express from "express";
import { upload } from "../utils/file.utils.js";
import { extractPdfByPage } from "../services/pdf.service.js";
import { extractTextFromFile } from "../services/text.service.js";
import { scrapeWebsite } from "../services/website.service.js";
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

        let extractedContent;
        let fileTypeName;
        let totalTables = 0;

        // Handle different file types
        if (fileExtension === ".pdf") {
            fileTypeName = "PDF";
            extractedContent = await extractPdfByPage(filePath);
            
            if (!extractedContent || extractedContent.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: `No data extracted from PDF. The file might be empty or corrupted.`
                });
            }
        } else if (fileExtension === ".txt") {
            fileTypeName = "Text";
            const textContent = await extractTextFromFile(filePath);
            
            if (!textContent) {
                return res.status(400).json({
                    success: false,
                    error: `No data extracted from text file. The file might be empty.`
                });
            }

            // Convert text content to page-like structure for consistent processing
            extractedContent = [{
                page: 1,
                text: textContent,
                tables: []
            }];
        } else {
            return res.status(400).json({
                success: false,
                error: `Unsupported file type: ${fileExtension}. Supported types: .pdf, .txt`
            });
        }

        const chunksToStore = [];

        // Process extracted content
        for (const pageData of extractedContent) {
            const { text, page, tables } = pageData;
            
            if (!text || text.trim().length === 0) {
                console.log(`Skipping empty content on page ${page}`);
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
                        console.warn(`Skipping chunk with invalid embedding on page ${page}`);
                        continue;
                    }

                    chunksToStore.push({
                        text: chunk.trim(),
                        embedding,
                        file: fileName,
                        page,
                        type: 'text',
                        source: fileTypeName.toLowerCase()
                    });
                } catch (embedError) {
                    console.error(`Error embedding chunk on page ${page}:`, embedError);
                    continue;
                }
            }

            // Process tables separately (for PDF files)
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
                                source: fileTypeName.toLowerCase(),
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
                error: `No valid text chunks found in the ${fileTypeName} file. The file might be unreadable.`
            });
        }

        const pageCount = extractedContent.length;
        const chunkCount = chunksToStore.length;
        console.log(`Created ${chunkCount} valid chunks from ${pageCount} page(s)`);
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
            message: `Successfully indexed ${chunkCount} chunks from ${fileTypeName}${totalTables > 0 ? ` (including ${totalTables} tables)` : ''}`
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

// Website scraping route
router.post("/website", async (req, res) => {
    try {
        const { url } = req.body;
        
        if (!url || typeof url !== 'string' || url.trim().length === 0) {
            return res.status(400).json({
                success: false,
                error: "URL is required"
            });
        }

        console.log(`Processing website: ${url}`);

        // Scrape the website
        const websiteData = await scrapeWebsite(url.trim());
        
        if (!websiteData || !websiteData.text) {
            return res.status(400).json({
                success: false,
                error: "Failed to extract content from the website"
            });
        }

        // Chunk the text content
        const chunks = chunkText(websiteData.text);
        const chunksToStore = [];

        for (const chunk of chunks) {
            if (!chunk || chunk.trim().length === 0) {
                continue;
            }

            try {
                const embedding = await embed(chunk);
                
                if (!embedding || !Array.isArray(embedding) || embedding.length === 0) {
                    console.warn('Skipping chunk with invalid embedding');
                    continue;
                }

                chunksToStore.push({
                    text: chunk.trim(),
                    embedding,
                    file: websiteData.title,
                    page: 1,
                    type: 'text',
                    source: 'website',
                    metadata: {
                        url: websiteData.url,
                        scrapedAt: websiteData.scrapedAt
                    }
                });
            } catch (embedError) {
                console.error('Error embedding chunk:', embedError);
                continue;
            }
        }

        if (chunksToStore.length === 0) {
            return res.status(400).json({
                success: false,
                error: "No valid text chunks found from the website"
            });
        }

        console.log(`Created ${chunksToStore.length} valid chunks from website`);

        await storeChunks(chunksToStore);

        res.json({
            success: true,
            title: websiteData.title,
            url: websiteData.url,
            chunks: chunksToStore.length,
            fileType: "Website",
            message: `Successfully indexed ${chunksToStore.length} chunks from website`
        });
    } catch (error) {
        console.error("Error in website upload route:", error);
        res.status(500).json({
            success: false,
            error: "Failed to process website",
            message: error.message || "Unknown error occurred"
        });
    }
});

export default router;
