import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import uploadRoutes from "./routes/upload.routes.js";
import chatRoutes from "./routes/chat.routes.js";
import { ensureCollection } from "./services/qdrant.service.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Global error handler middleware
app.use((err, req, res, next) => {
    console.error("Unhandled error:", err);
    res.status(500).json({ 
        error: "Internal server error", 
        message: err.message || "An unexpected error occurred" 
    });
});

// Initialize server
async function startServer() {
    try {
        // 🔑 ENSURE QDRANT COLLECTION EXISTS
        await ensureCollection();
        console.log("Qdrant collection initialized successfully");

        app.use("/api/upload", uploadRoutes);
        app.use("/api/chat", chatRoutes);

        const PORT = process.env.PORT || 5000;
        app.listen(PORT, () => {
            console.log(`Backend running on port ${PORT}`);
        });
    } catch (error) {
        console.error("Failed to start server:", error);
        process.exit(1);
    }
}

startServer();
