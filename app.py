"""
Hugging Face Spaces Entrypoint for Kolkata Pujo Parikrama.
Mounts the FastAPI app into Gradio so Hugging Face provides 2 vCPUs and 16 GB RAM for free,
while serving your custom festive HTML/CSS/JS frontend on '/' and API endpoints on '/api'.

Render continues running 'main.py' untouched on its own port.
"""

import os
import sys

# Ensure current directory is on sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from main import app

try:
    import gradio as gr
    # Mount Gradio interface on /gradio so Hugging Face recognizes a valid Gradio Space
    with gr.Blocks(title="Kolkata Puja Parikrama") as demo:
        gr.Markdown(
            "# 🌸 Kolkata Pujo Parikrama API & Web App\n"
            "This Space runs the full FastAPI backend with 16 GB RAM.\n\n"
            "- **Web UI**: Access the full festive interactive map & chat at the root URL `/`\n"
            "- **API Endpoints**: `/api/chat`, `/api/session`\n"
        )
    # Mount Gradio under /gradio without affecting root '/' or '/static'
    app = gr.mount_gradio_app(app, demo, path="/gradio")
except Exception as e:
    import logging
    logging.warning("Gradio mount warning (falling back to pure FastAPI): %s", e)

if __name__ == "__main__":
    import uvicorn
    # Hugging Face Spaces listens on port 7860 by default
    port = int(os.environ.get("PORT", 7860))
    uvicorn.run(app, host="0.0.0.0", port=port)
