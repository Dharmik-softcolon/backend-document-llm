import express from "express";
import { ask } from "../services/rag.service.js";

const router = express.Router();

router.post("/", async (req, res) => {
    try {
        const { question } = req.body;
        
        if (!question || typeof question !== 'string' || question.trim().length === 0) {
            return res.status(400).json({ 
                error: "Question is required and must be a non-empty string" 
            });
        }

        const result = await ask(question.trim());
        
        // Support both old format (string) and new format (object)
        if (typeof result === 'string') {
            res.json({ answer: result, sources: [] });
        } else {
            res.json(result);
        }
    } catch (error) {
        console.error("Error in chat route:", error);
        res.status(500).json({ 
            error: "Failed to process question", 
            message: error.message || "Internal server error" 
        });
    }
});

export default router;
