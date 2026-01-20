import base64
from pathlib import Path
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from face_matching import match_faces_from_bytes

app = FastAPI(title="Hackathon API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://tiger-dorm-security-frontend-64sazxfvt-mahir-majids-projects.vercel.app",  # Vercel preview deployment
        "https://tiger-dorm-security-frontend-o3qdp3ibq-mahir-majids-projects.vercel.app",  # Vercel preview deployment (new)
        "https://tiger-dorm-security-frontend.vercel.app",  # Vercel production domain
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Load names once at startup
NAMES_FILE = Path(__file__).parent / "princeton_names.txt"
ALL_NAMES: list[str] = []

@app.on_event("startup")
def load_names():
    global ALL_NAMES
    if NAMES_FILE.exists():
        with open(NAMES_FILE, "r") as f:
            ALL_NAMES = [line.strip() for line in f if line.strip()]


class ImageData(BaseModel):
    image: str  # Base64 encoded image data


@app.get("/api/health")
def health_check():
    return {"status": "ok", "message": "Backend is running!"}


@app.get("/api/people")
def search_people(q: str = Query(default="", description="Search query for names")):
    """Search for people by name. Returns all names if no query provided."""
    if not q:
        return {"people": ALL_NAMES}

    query_lower = q.lower()
    matches = [name for name in ALL_NAMES if query_lower in name.lower()]
    return {"people": matches[:50]}  # Limit to 50 results


@app.post("/api/process-frame")
async def process_frame(data: ImageData):
    # Decode the base64 image (remove data URL prefix if present)
    image_data = data.image
    if "," in image_data:
        image_data = image_data.split(",")[1]

    image_bytes = base64.b64decode(image_data)

    # Match faces from the image
    face_matches = match_faces_from_bytes(image_bytes)

    return {
        "status": "ok",
        "face_count": len(face_matches),
        "faces": face_matches
    }
