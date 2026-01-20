"""
Face matching module for matching webcam faces to Princeton embeddings.
Optimized for real-time performance.
"""

import cv2
import numpy as np
import insightface
from princeton_face_embeddings import load_embeddings

# Global model and embeddings cache
_model = None
_princeton_embeddings = None
_embeddings_matrix = None  # Pre-computed matrix for vectorized similarity
_embedding_names = None  # List of names matching matrix rows


def get_model():
    """Get or initialize InsightFace model."""
    global _model
    if _model is None:
        _model = insightface.app.FaceAnalysis(providers=['CPUExecutionProvider'])
        # Use smaller detection size for faster processing
        _model.prepare(ctx_id=-1, det_size=(320, 320))
    return _model


def get_princeton_embeddings():
    """Get or load Princeton embeddings (cached) with pre-computed matrix."""
    global _princeton_embeddings, _embeddings_matrix, _embedding_names

    if _princeton_embeddings is None:
        _princeton_embeddings = load_embeddings()

        if _princeton_embeddings:
            # Pre-compute matrix for vectorized similarity computation
            _embedding_names = list(_princeton_embeddings.keys())
            _embeddings_matrix = np.array([_princeton_embeddings[name] for name in _embedding_names])

    return _princeton_embeddings


def find_best_match_vectorized(embedding: np.ndarray) -> tuple[str, float] | None:
    """
    Find the best matching Princeton face using vectorized computation.
    Much faster than looping through each embedding.
    """
    global _embeddings_matrix, _embedding_names

    if _embeddings_matrix is None or len(_embedding_names) == 0:
        return None

    # Vectorized cosine similarity: dot product with all embeddings at once
    similarities = np.dot(_embeddings_matrix, embedding)

    # Find best match
    best_idx = np.argmax(similarities)
    best_score = max(0, float(similarities[best_idx]))

    return (_embedding_names[best_idx], best_score)


def extract_name_from_filename(filename: str) -> str:
    """
    Extract person's name from filename.
    Handles formats like:
    - "BUTLER_Firstname Lastname '26.jpg" -> "Firstname Lastname"
    - "FORBES_John Smith '28.png" -> "John Smith"
    """
    import os
    import re

    # Remove college prefix (e.g., "BUTLER_", "FORBES_")
    if '_' in filename:
        parts = filename.split('_', 1)
        if len(parts) > 1:
            filename = parts[1]

    # Remove file extension
    name = os.path.splitext(filename)[0]

    # Remove class year pattern (e.g., " '26", " '27", " '28", " '29")
    # This matches a space followed by apostrophe and 2 digits at the end
    name = re.sub(r"\s*'?\d{2}$", '', name)

    return name.strip()


def match_faces_from_bytes(image_bytes: bytes) -> list[dict]:
    """
    Detect faces in image bytes and find best Princeton match for each.
    Optimized for real-time webcam processing.
    """
    # Convert bytes to image
    nparr = np.frombuffer(image_bytes, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if image is None:
        return []

    # Convert BGR to RGB for InsightFace
    img_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)

    # Get model and detect faces
    model = get_model()
    faces = model.get(img_rgb)

    if len(faces) == 0:
        return []

    # Ensure embeddings are loaded (also pre-computes matrix)
    get_princeton_embeddings()

    # Process each face
    results = []
    for face in faces:
        bbox = face.bbox.astype(int)

        # Get embedding for this face (already computed by InsightFace)
        embedding = face.embedding
        embedding = embedding / np.linalg.norm(embedding)

        # Find best match using vectorized computation
        match = find_best_match_vectorized(embedding)

        # Use threshold of 0.35 - below this, return "Unknown"
        match_score = match[1] if match else 0.0
        if match and match_score >= 0.35:
            # Extract just the name from the full filename
            match_filename = extract_name_from_filename(match[0])
        else:
            match_filename = "Unknown"

        result = {
            "x": int(bbox[0]),
            "y": int(bbox[1]),
            "width": int(bbox[2] - bbox[0]),
            "height": int(bbox[3] - bbox[1]),
            "match_filename": match_filename,
            "match_score": match_score
        }
        results.append(result)

    return results