# RheusInterface — server terpisah untuk SiLengkap.
# Build:  docker build -t rheus ./rheus      Jalankan: docker run -p 8000:8000 rheus
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 RHEUS_DATA_DIR=/data
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY rheus ./rheus

# Pelatihan awal saat build (Wikipedia Indonesia + berita). Bila sumber tidak bisa dihubungi,
# build tetap berhasil dan otak mulai belajar dari nol saat server berjalan.
ARG RHEUS_TRAIN_PAGES=1500
RUN python -m rheus.train --wiki-pages ${RHEUS_TRAIN_PAGES} --out rheus/models/brain.pkl || echo "Pelatihan awal dilewati"

RUN useradd -m rheus && mkdir -p /data && chown -R rheus /data /app
USER rheus
ENV PORT=8000
EXPOSE 8000
CMD uvicorn rheus.app:app --host 0.0.0.0 --port ${PORT} --proxy-headers --no-access-log
