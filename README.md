# Tiger Dorm Security

A real-time face recognition system for Princeton University dormitory access control. The application uses webcam input to detect and identify individuals, allowing authorized access management for different rooms and spaces.

**Live Demo:** [https://tiger-dorm-security-frontend.vercel.app](https://tiger-dorm-security-frontend.vercel.app)

## Face Embeddings

The system uses **InsightFace** to generate 512-dimensional face embeddings from student photos. These embeddings are stored in:
- `princeton_face_embeddings.npz` - NumPy compressed array of all face embeddings
- `princeton_face_embeddings_metadata.txt` - Text file mapping each embedding to the person's name

The two files listed above are not included in the repository and are ignored via .gitignore, but at runtime, when a face is detected via webcam, its embedding is compared against the stored embeddings using cosine similarity to identify the person.

## Technology Stack
- **Frontend:** Next.js, TypeScript, Tailwind CSS
- **Backend:** FastAPI, Python, InsightFace, OpenCV
- **Deployment:** Vercel (frontend), Fly.io (backend)
