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

# --- LOAD THE AI MODEL (runs only once on startup) ---
try:
    logging.info(f"Loading model '{MODEL_NAME}'...")
    processor = AutoImageProcessor.from_pretrained(MODEL_NAME)
    model = AutoModelForImageClassification.from_pretrained(MODEL_NAME)
    logging.info("✅ Model and processor loaded successfully!")
except Exception as e:
    logging.error(f"❌ Failed to load model: {e}")
    processor, model = None, None

# --- IMAGE CLASSIFICATION LOGIC ---
def classify_image_logic(image_bytes):
    if not model or not processor:
        raise RuntimeError("Model is not loaded.")
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
