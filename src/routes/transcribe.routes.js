import express from "express";
import multer from "multer";
import { transcribeAudio } from "../services/transcription.service.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post("/", upload.single('audio'), async (req, res) => {
    try {
        if (!req.file || !req.file.buffer) {
            return res.status(400).json({ 
                error: "Audio file is required" 
            });
        }

        const audioBuffer = req.file.buffer;
        const transcript = await transcribeAudio(audioBuffer);
        
        res.json({ transcript });
    } catch (error) {
        console.error("Error in transcribe route:", error);
        res.status(500).json({ 
            error: "Failed to transcribe audio", 
            message: error.message || "Internal server error" 
        });
    }
});

export default router;

