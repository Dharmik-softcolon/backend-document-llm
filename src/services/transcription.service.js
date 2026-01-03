import { AssemblyAI } from 'assemblyai';
import { config } from '../config/credential.js';

const client = new AssemblyAI({
    apiKey: config.key.assemblyai_key
});

export const transcribeAudio = async (audioBuffer) => {
    try {
        if (!config.key.assemblyai_key) {
            throw new Error("AssemblyAI API key is not configured");
        }

        // Upload the audio file
        const uploadResponse = await client.files.upload(audioBuffer);
        
        // Transcribe the audio
        const transcript = await client.transcripts.transcribe({
            audio: uploadResponse,
            language_detection: true
        });

        // Wait for transcription to complete
        let finalTranscript = transcript;
        while (finalTranscript.status !== 'completed' && finalTranscript.status !== 'error') {
            await new Promise(resolve => setTimeout(resolve, 1000));
            finalTranscript = await client.transcripts.get(finalTranscript.id);
        }

        if (finalTranscript.status === 'error') {
            throw new Error(finalTranscript.error || 'Transcription failed');
        }

        return finalTranscript.text || '';
    } catch (error) {
        console.error("Error in transcription service:", error);
        throw new Error(`Transcription failed: ${error.message || "Unknown error"}`);
    }
};

