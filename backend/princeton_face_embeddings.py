"""
Script to compute and store Princeton residential college face embeddings using NumPy .npz format.
Safe alternative to pickle.
"""

import os
import cv2
import numpy as np
from pathlib import Path
import insightface

# Paths - Base directory containing all residential college folders
BASE_DIR = "./PRINCETON_STUDENTS"
COLLEGE_FOLDERS = ["BUTLER", "FORBES", "MATHEY", "NCW", "ROCKY", "WHITMAN", "YEH"]
EMBEDDINGS_FILE = "princeton_face_embeddings.npz"
METADATA_FILE = "princeton_face_embeddings_metadata.txt"  # Store image names with college prefix

# Initialize InsightFace model (will download model on first run)
_model = None

def get_model():
    """Get or initialize InsightFace model."""
    global _model
    if _model is None:
        # Use BUFFALO_L model (good balance of accuracy and speed)
        # Will download model weights on first run (~100MB)
        _model = insightface.app.FaceAnalysis(providers=['CPUExecutionProvider'])
        _model.prepare(ctx_id=-1, det_size=(640, 640))
    return _model


def get_face_embedding(image_path):
    """Get face embedding from image using InsightFace."""
    try:
        # Load image
        img = cv2.imread(image_path)
        if img is None:
            raise ValueError(f"Could not load image: {image_path}")
        
        # Convert BGR to RGB (InsightFace expects RGB)
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        
        # Get model and detect faces
        model = get_model()
        faces = model.get(img_rgb)
        
        if len(faces) == 0:
            raise ValueError(f"No face detected in image: {image_path}")
        if len(faces) > 1:
            print(f"⚠️  Warning: Multiple faces detected in {image_path}, using first face")
        
        # Get embedding from first face
        embedding = faces[0].embedding
        
        # Normalize embedding
        embedding = embedding / np.linalg.norm(embedding)
        
        return embedding
    except Exception as e:
        raise ValueError(f"Error processing image {image_path}: {e}")


def get_image_files(directory, extensions=None):
    """Get all image files from a directory."""
    if extensions is None:
        extensions = {'.jpg', '.jpeg', '.png', '.webp', '.JPG', '.JPEG', '.PNG', '.WEBP'}
    
    image_files = []
    for file in os.listdir(directory):
        if any(file.endswith(ext) for ext in extensions):
            image_files.append(os.path.join(directory, file))
    
    return sorted(image_files)


def compute_all_embeddings(base_dir=BASE_DIR, college_folders=COLLEGE_FOLDERS):
    """
    Compute face embeddings for all Princeton residential college images.
    Returns tuple: (embeddings_array, image_names_list)
    Image names are prefixed with college name (e.g., "BUTLER_image001.jpg")
    """
    embeddings_list = []
    image_names = []
    successful = 0
    failed = 0
    total_images = 0

    # First, count total images across all colleges
    all_college_images = []
    for college in college_folders:
        college_dir = os.path.join(base_dir, college)
        if not os.path.exists(college_dir):
            print(f"⚠️  Directory not found: {college_dir}")
            continue

        college_images = get_image_files(college_dir)
        for img_path in college_images:
            all_college_images.append((college, img_path))

    total_images = len(all_college_images)

    if total_images == 0:
        print(f"❌ No images found in any college folders")
        return None, None

    print(f"📸 Computing embeddings for {total_images} images across {len(college_folders)} colleges...")

    for idx, (college, image_path) in enumerate(all_college_images, 1):
        image_name = os.path.basename(image_path)
        # Prefix with college name for uniqueness
        prefixed_name = f"{college}_{image_name}"

        try:
            embedding = get_face_embedding(image_path)
            embeddings_list.append(embedding)
            image_names.append(prefixed_name)
            successful += 1

            if idx % 50 == 0 or idx == total_images:
                print(f"  [{idx}/{total_images}] Processed: {prefixed_name}")
        except Exception as e:
            print(f"  [{idx}/{total_images}] ⚠️  Error processing {prefixed_name}: {e}")
            failed += 1
            continue

    print(f"\n✅ Successfully computed {successful} embeddings")
    if failed > 0:
        print(f"⚠️  Failed to compute {failed} embeddings")

    if embeddings_list:
        embeddings_array = np.array(embeddings_list)
        return embeddings_array, image_names
    return None, None


def save_embeddings(embeddings_array, image_names, filepath=EMBEDDINGS_FILE, metadata_file=METADATA_FILE):
    """
    Save embeddings using NumPy compressed format (.npz).
    Also saves image names to a text file for mapping.
    """
    try:
        # Save embeddings array (compressed)
        np.savez_compressed(filepath, embeddings=embeddings_array)
        
        # Save image names mapping (one per line)
        with open(metadata_file, 'w') as f:
            for name in image_names:
                f.write(f"{name}\n")
        
        print(f"💾 Saved {len(image_names)} embeddings to {filepath}")
        print(f"💾 Saved metadata to {metadata_file}")
        return True
    except Exception as e:
        print(f"❌ Error saving embeddings: {e}")
        return False


def load_embeddings(filepath=EMBEDDINGS_FILE, metadata_file=METADATA_FILE):
    """
    Load embeddings from .npz file.
    Returns dictionary mapping image name to embedding vector, or None if file doesn't exist.
    """
    if not os.path.exists(filepath) or not os.path.exists(metadata_file):
        return None
    
    try:
        # Load embeddings array
        data = np.load(filepath)
        embeddings_array = data['embeddings']
        
        # Load image names
        with open(metadata_file, 'r') as f:
            image_names = [line.strip() for line in f.readlines()]
        
        print(f"📂 Loading {len(image_names)} embeddings from {filepath}...")
        
        # Create dictionary mapping image name to embedding
        embeddings_dict = {}
        for i, name in enumerate(image_names, 1):
            embeddings_dict[name] = embeddings_array[i - 1]
            if i % 50 == 0 or i == len(image_names):
                print(f"  [{i}/{len(image_names)}] Loaded: {name}")
        
        print(f"✅ Successfully loaded {len(embeddings_dict)} embeddings")
        return embeddings_dict
    except Exception as e:
        print(f"❌ Error loading embeddings: {e}")
        return None


def get_embeddings_dict(force_recompute=False, base_dir=BASE_DIR,
                       college_folders=COLLEGE_FOLDERS,
                       filepath=EMBEDDINGS_FILE, metadata_file=METADATA_FILE):
    """
    Get embeddings dictionary, loading from cache if available.

    Args:
        force_recompute: If True, recompute all embeddings even if cache exists
        base_dir: Base directory containing college folders
        college_folders: List of college folder names to process
        filepath: Path to save/load embeddings file
        metadata_file: Path to save/load image names

    Returns:
        Dictionary mapping image name to embedding vector
    """
    # Try to load from cache first (unless forcing recompute)
    if not force_recompute:
        cached_embeddings = load_embeddings(filepath, metadata_file)
        if cached_embeddings is not None:
            return cached_embeddings

    # Compute embeddings
    embeddings_array, image_names = compute_all_embeddings(base_dir, college_folders)

    # Save to disk for future runs
    if embeddings_array is not None and image_names:
        save_embeddings(embeddings_array, image_names, filepath, metadata_file)

        # Create dictionary for return
        embeddings_dict = {}
        for i, name in enumerate(image_names):
            embeddings_dict[name] = embeddings_array[i]
        return embeddings_dict

    return {}


def main():
    """Main function to compute and save Princeton residential college embeddings."""
    print("🔍 Princeton Residential Colleges Face Embeddings Generator (NumPy Format)")
    print("=" * 70)
    print(f"Processing colleges: {', '.join(COLLEGE_FOLDERS)}")
    print("=" * 70)

    # Check if embeddings file already exists
    if os.path.exists(EMBEDDINGS_FILE):
        print(f"📂 Found existing embeddings file: {EMBEDDINGS_FILE}")
        response = input("Recompute all embeddings? (y/n): ").strip().lower()
        force_recompute = response == 'y'
    else:
        force_recompute = False

    # Get embeddings (load from cache or compute)
    embeddings = get_embeddings_dict(force_recompute=force_recompute)

    if embeddings:
        print(f"\n✅ Total embeddings stored: {len(embeddings)}")
        print(f"💾 Embeddings file: {EMBEDDINGS_FILE}")
        print(f"💾 Metadata file: {METADATA_FILE}")
        print("\nTo use these embeddings in other scripts:")
        print("  from princeton_face_embeddings import load_embeddings")
        print("  embeddings = load_embeddings()")
    else:
        print("\n❌ No embeddings were computed")


if __name__ == "__main__":
    main()

