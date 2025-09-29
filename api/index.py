from fastapi import FastAPI, File, UploadFile, HTTPException
import logging
from io import BytesIO
import torch
from PIL import Image
from transformers import AutoImageProcessor, AutoModelForImageClassification

# --- CONFIGURATION ---
CONFIDENCE_THRESHOLD = 0.80
MODEL_NAME = "umm-maybe/AI-image-detector"
logging.basicConfig(level=logging.INFO)

# --- SETUP FASTAPI APP ---
app = FastAPI()

# --- MODIFICATION START ---
# We initialize the model and processor as None.
# They will only be loaded into memory when the first request comes in.
# This prevents the "Out of Memory" error during Vercel's build process.
model = None
processor = None

def load_model():
    """Loads the model and processor on-demand."""
    global model, processor
    if model is None or processor is None:
        logging.info(f"Cold start: Loading model '{MODEL_NAME}' for the first time...")
        try:
            processor = AutoImageProcessor.from_pretrained(MODEL_NAME)
            model = AutoModelForImageClassification.from_pretrained(MODEL_NAME)
            logging.info("✅ Model and processor loaded successfully!")
        except Exception as e:
            logging.error(f"❌ Failed to load model: {e}")
            # If loading fails, we set them back to None to allow a retry on the next request.
            model, processor = None, None
# --- MODIFICATION END ---

# --- IMAGE CLASSIFICATION LOGIC ---
def classify_image_logic(image_bytes):
    # This function now assumes the model is loaded.
    if not model or not processor:
        raise RuntimeError("Model is not available. Check logs for loading errors.")
    try:
        image = Image.open(BytesIO(image_bytes)).convert("RGB")
    except Exception as e:
        raise ValueError("Invalid or corrupt image file.")

    inputs = processor(images=image, return_tensors="pt")
    with torch.no_grad():
        outputs = model(**inputs)
    
    probabilities = torch.nn.functional.softmax(outputs.logits, dim=-1)
    real_confidence = probabilities[0][0].item()
    ai_confidence = probabilities[0][1].item()

    if real_confidence >= CONFIDENCE_THRESHOLD:
        prediction = "Real"
        final_confidence = real_confidence
    else:
        prediction = "AI Generated"
        final_confidence = ai_confidence
        
    return {"prediction": prediction, "confidence": f"{final_confidence:.2%}"}

# --- API ENDPOINT ---
@app.post("/api/detect")
async def detect(file: UploadFile = File(...)):
    # --- MODIFICATION ---
    # We ensure the model is loaded before processing the image.
    load_model() 

    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File is not an image.")
    try:
        image_bytes = await file.read()
        result = classify_image_logic(image_bytes)
        return result
    except (RuntimeError, ValueError) as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- ROOT ENDPOINT FOR VERCEL HEALTH CHECK ---
@app.get("/")
def root():
    return {"status": "ok"}
