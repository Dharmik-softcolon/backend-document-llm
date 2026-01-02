import express from "express";
import { ask } from "../services/rag.service.js";

const router = express.Router();

router.post("/", async (req, res) => {
    try {
        // Validate input
        if (!req.body.question || typeof req.body.question !== 'string' || req.body.question.trim().length === 0) {
            return res.status(400).json({ 
                error: "Question is required and must be a non-empty string" 
            });
        }

        const answer = await ask(req.body.question.trim());
        res.json({ answer });
    } catch (error) {
        console.error("Error in chat route:", error);
        res.status(500).json({ 
            error: "Failed to process question", 
            message: error.message || "Internal server error" 
        });
    }
});

export default router;
