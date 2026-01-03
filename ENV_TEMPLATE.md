# Environment Variables Template
# Copy this file to .env and fill in your values

# Server Configuration
PORT=5000

# Gemini API (Required)
# Get your API key from: https://makersuite.google.com/app/apikey
GEMINI_API_KEY=your-gemini-api-key-here

# Qdrant Vector Database (Required)
# Option 1: Local Qdrant (default)
QDRANT_URL=http://localhost:6333

# Option 2: Qdrant Cloud (if using cloud)
# QDRANT_URL=your-qdrant-cloud-url
# QDRANT_API_KEY=your-qdrant-api-key

# AssemblyAI (Required for voice features)
# Get your API key from: https://www.assemblyai.com/
# Free tier: 5 hours/month
ASSEMBLYAI_API_KEY=your-assemblyai-api-key-here

