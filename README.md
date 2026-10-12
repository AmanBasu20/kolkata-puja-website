# Kolkata Pujo Parikrama - Web Application

A clean, minimalist public website for Kolkata Durga Puja Parikrama inspired by Google's classic homepage.

## Features
- **Minimalist Google-Inspired UI**: Centered search experience with Durga Puja cultural accents (Sindoor Red, Ivory, Marigold Gold).
- **Dual AI Providers**: Support for **Google Gemini** (`gemini-3.7-flash` with multi-model fallback) and **Groq** (`openai/gpt-oss-20b`).
- **Live 25 MCP Tools Integration**: Grounded in real-time pandal data, metro routes, schedules, and live traffic updates via the deployed MCP server at `https://kolkata-puja-mcp-server2.onrender.com/mcp`.
- **Interactive Leaflet Mini-Maps**: Real-time rendering of pandal locations with clickable popups and direct [Open in Google Maps] navigation buttons.
- **English / Bengali Language Switcher**: 1-click `🌐 বাংলা` toggle that transforms both UI and AI responses into natural Bengali script.
- **WhatsApp Itinerary Sharing**: One-tap share to WhatsApp and clipboard copy for group pandal-hopping.
- **Current Location / GPS Detection**: Auto-detects nearest pandals and metro stations using device geolocation with smart area fallback.
- **Shared 5-Question Guest Quota**: 5 free questions per user enforced on the backend via session cookies and hashed client IP across both AI providers.
- **100% Secure**: API keys remain strictly in backend environment variables.


---

## Local Development

1. Create a virtual environment and install dependencies:
   ```bash
   cd web
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   pip install -r requirements.txt
   ```

2. Copy `.env.example` to `.env` and fill in your keys:
   ```bash
   cp .env.example .env
   ```
   - `GEMINI_API_KEY`: Get from [Google AI Studio](https://aistudio.google.com/)
   - `GROQ_API_KEY`: Get from [Groq Console](https://console.groq.com/)
   - `MCP_SERVER_URL`: `https://kolkata-puja-mcp-server2.onrender.com/mcp`
   - `GUEST_LIMIT`: `5`

3. Start the local server:
   ```bash
   uvicorn main:app --reload --port 8000
   ```
4. Open [http://localhost:8000](http://localhost:8000) in your browser.

---

## Deploying to a Separate GitHub Repository & Render / Railway

### 1. Initialize as a Separate Repository
```bash
cd web
git init
git add .
git commit -m "Initial commit of Kolkata Pujo Parikrama Web"
git branch -M main
git remote add origin https://github.com/<your-username>/kolkata-pujo-parikrama-web.git
git push -u origin main
```

### 2. Deploy on Render
1. Go to [Render Dashboard](https://dashboard.render.com/) -> **New Web Service**.
2. Connect your new GitHub repository.
3. Configure settings:
   - **Environment**: Python
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
4. Add **Environment Variables**:
   - `GEMINI_API_KEY`: your Google Gemini API key
   - `GROQ_API_KEY`: your Groq API key
   - `MCP_SERVER_URL`: `https://kolkata-puja-mcp-server2.onrender.com/mcp`
   - `GUEST_LIMIT`: `5`
5. Click **Create Web Service**. Your public website will be live in 2 minutes!
