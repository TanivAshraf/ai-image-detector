from fastapi import FastAPI, File, UploadFile, HTTPException
import logging
from io import BytesIO
from PIL import Image

# --- CONFIGURATION ---
CONFIDENCE_THRESHOLD = 0.80
MODEL_NAME = "umm-maybe/AI-image-detector"
logging.basicConfig(level=logging.INFO)

# --- SETUP FASTAPI APP ---
app = FastAPI()

# --- MODEL CACHING ---
# We start with None. The model will be loaded and stored here on the first API call.
model = None
processor = None

def load_model_on_demand():
    """
    Loads the model and processor. Heavy libraries are imported here to prevent
    Vercel from running out of memory during the build process.
    """
    global model, processor
    # If the model is already loaded, do nothing.
    if model is not None:
        return

    logging.info(f"Cold start: Loading model '{MODEL_NAME}'...")
    try:
        # --- CRITICAL FIX: Import heavy libraries only when needed ---
        from transformers import AutoImageProcessor, AutoModelForClassification
        import torch
        
        processor = AutoImageProcessor.from_pretrained(MODEL_NAME)
        model = AutoModelForClassification.from_pretrained(MODEL_NAME)
        logging.info("✅ Model and processor loaded successfully!")
    except Exception as e:
        logging.error(f"❌ Failed to load model: {e}")
        raise RuntimeError(f"Could not load model: {e}")

# --- API ENDPOINT ---
@app.post("/api/detect")
async def detect(file: UploadFile = File(...)):
    # Ensure the model is loaded before we proceed.
    try:
        load_model_on_demand()
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) # 503 Service Unavailable

    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File is not an image.")
    
    try:
        image_bytes = await file.read()
        image = Image.open(BytesIO(image_bytes)).convert("RGB")

        # Now we can safely use the globally loaded model and processor
        inputs = processor(images=image, return_tensors="pt")
        
        # --- No gradients needed, saves memory ---
        with torch.no_grad():
            outputs = model(**inputs)
        
        probabilities = torch.nn.functional.softmax(outputs.logits, dim=-1)
        real_confidence = probabilities[0][0].item()

        if real_confidence >= CONFIDENCE_THRESHOLD:
            prediction = "Real"
            final_confidence = real_confidence
        else:
            prediction = "AI Generated"
            # For AI, show the AI confidence score
            final_confidence = probabilities[0][1].item()
        
        return {"prediction": prediction, "confidence": f"{final_confidence:.2%}"}

    except Exception as e:
        logging.error(f"Error during classification: {e}")
        raise HTTPException(status_code=500, detail="Failed to process image.")
