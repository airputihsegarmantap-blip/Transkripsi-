# TranskripKu — siap untuk hosting gratis (Render, Koyeb, Hugging Face Spaces, dll.)
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py transcriber.py ./
COPY templates ./templates
COPY static ./static
COPY shared ./shared

# Hugging Face Spaces memakai port 7860; Render/Koyeb mengisi $PORT sendiri.
ENV PORT=7860
EXPOSE 7860
RUN useradd -m appuser
USER appuser
CMD gunicorn --bind 0.0.0.0:${PORT} --workers 2 --threads 4 --timeout 60 app:app
