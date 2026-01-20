FROM python:3.12-slim AS builder

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# Install system dependencies needed for building Python packages and running OpenCV
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    libxcb1 \
    && rm -rf /var/lib/apt/lists/*

# Create virtual environment and install dependencies
RUN python -m venv .venv
COPY requirements.txt ./
RUN .venv/bin/pip install --upgrade pip && \
    .venv/bin/pip install -r requirements.txt

# Pre-download InsightFace model during build (so it's in the image)
RUN .venv/bin/python -c "import insightface; app = insightface.app.FaceAnalysis(providers=['CPUExecutionProvider']); app.prepare(ctx_id=-1, det_size=(320, 320))"

# Final stage
FROM python:3.12-slim

WORKDIR /app

# Install runtime dependencies for opencv-python and other packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    libxcb1 \
    && rm -rf /var/lib/apt/lists/*

# Copy virtual environment from builder
COPY --from=builder /app/.venv .venv/

# Copy InsightFace models from builder (if they exist)
COPY --from=builder /root/.insightface /root/.insightface

# Copy application code
COPY . .

# Expose port
EXPOSE 8000

# Use uvicorn to run the FastAPI app
CMD ["/app/.venv/bin/uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
