import express from 'express';
import multer from 'multer';
import { AssemblyAI } from 'assemblyai';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Initialize AssemblyAI client
// You'll need to add your API key in environment variables
const client = new AssemblyAI({
    apiKey: process.env.ASSEMBLYAI_API_KEY || 'your-api-key-here'
});

/**
 * POST /api/speech-to-text
 * Transcribe audio using AssemblyAI
 */
router.post('/speech-to-text', upload.single('audio'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No audio file provided' });
        }

        console.log('Transcribing audio with AssemblyAI...');
        
        // Upload audio buffer to AssemblyAI
        const uploadUrl = await client.files.upload(req.file.buffer);
        
        // Create transcript
        const transcript = await client.transcripts.transcribe({
            audio: uploadUrl,
            language_code: 'en_us'
        });

        if (transcript.status === 'error') {
            throw new Error(transcript.error);
        }

        console.log('Transcription completed:', transcript.text);

        res.json({
            success: true,
            text: transcript.text,
            confidence: transcript.confidence
        });

    } catch (error) {
        console.error('Speech-to-text error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Transcription failed'
        });
    }
});

export default router;

