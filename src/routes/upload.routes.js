import express from "express";
import { upload } from "../utils/file.utils.js";
import { extractPdfByPage } from "../services/pdf.service.js";
import { chunkText } from "../services/chunk.service.js";
import { embed } from "../services/embedding.service.js";
import { storeChunks } from "../services/qdrant.service.js";

const router = express.Router();

router.post("/", upload.single("file"), async (req, res) => {
    const fileName = req.file.originalname;

    // 1️⃣ Extract page-wise text
    const pages = await extractPdfByPage(req.file.path);

    const chunksToStore = [];

    // 2️⃣ Chunk each page separately
    for (const pageObj of pages) {
        const chunks = chunkText(pageObj.text);

        for (const chunk of chunks) {
            const embedding = await embed(chunk);

            chunksToStore.push({
                text: chunk,
                embedding,
                file: fileName,
                page: pageObj.page
            });
        }
    }

    // 3️⃣ Store in Qdrant
    await storeChunks(chunksToStore);

    res.json({
        success: true,
        pages: pages.length,
        chunks: chunksToStore.length
    });
});

export default router;
