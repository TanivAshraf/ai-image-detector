# Vercel Python Version 3.12
import os
from http.server import BaseHTTPRequestHandler
# ... rest of the file
import os
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs
import json
from PIL import Image, ImageChops, ImageEnhance
import io
import base64
import google.generativeai as genai

# Configure Gemini with the API key from Vercel's environment variables
genai.configure(api_key=os.environ.get('GEMINI_API_KEY'))

def perform_ela(image_bytes):
    """Performs Error Level Analysis on an image and returns the ELA image bytes."""
    original_image = Image.open(io.BytesIO(image_bytes)).convert('RGB')
    
    # Re-save the image at a specific quality
    resaved_stream = io.BytesIO()
    original_image.save(resaved_stream, 'JPEG', quality=90)
    resaved_stream.seek(0)
    resaved_image = Image.open(resaved_stream)

    # Find the difference between the original and re-saved image
    ela_image = ImageChops.difference(original_image, resaved_image)
    
    # Enhance the ELA image to make differences more visible
    extrema = ela_image.getextrema()
    max_diff = max([ex[1] for ex in extrema])
    if max_diff == 0:
        max_diff = 1
    scale = 255.0 / max_diff
    ela_image = ImageEnhance.Brightness(ela_image).enhance(scale)

    # Save the final ELA image to a byte stream
    ela_stream = io.BytesIO()
    ela_image.save(ela_stream, 'JPEG')
    ela_stream.seek(0)
    
    return ela_stream.getvalue()

# This is the main serverless function Vercel will run
class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length)
        data = json.loads(post_data)

        try:
            # Get the image data from the request
            image_b64 = data['image'].split(',')[1]
            image_bytes = base64.b64decode(image_b64)

            # --- Step 1: Perform Forensic Analysis ---
            ela_image_bytes = perform_ela(image_bytes)

            # --- Step 2: Ask Gemini to Interpret the Forensic Evidence ---
            model = genai.GenerativeModel('gemini-1.5-flash-latest')
            
            prompt = """You are a world-leading expert in digital image forensics. I have conducted an Error Level Analysis (ELA) on a piece of evidence.
            
            Attached are two images:
            1. The original evidence image.
            2. The ELA map generated from the evidence.
            
            In an authentic photograph, the ELA should be mostly dark, with brighter areas around high-contrast edges. In an AI-generated image, the synthesized elements often have a uniform, higher error level, appearing as a consistent, bright texture in the ELA map.
            
            Based on your expert interpretation of the provided ELA scan in conjunction with the original image, is the evidence REAL or FAKE? Respond with a JSON object containing one key: "final_verdict", with a value of either "REAL" or "FAKE".
            """

            # Prepare images for Gemini
            original_image_part = {"mime_type": "image/jpeg", "data": base64.b64encode(image_bytes).decode()}
            ela_image_part = {"mime_type": "image/jpeg", "data": base64.b64encode(ela_image_bytes).decode()}

            # Call the Gemini API with both images and the prompt
            response = model.generate_content([prompt, original_image_part, ela_image_part])
            
            # --- Step 3: Return the Result ---
            # Clean and parse the response from Gemini
            text_response = response.text.strip().replace("```json", "").replace("```", "")
            json_response = json.loads(text_response)
            verdict = json_response.get("final_verdict", "INCONCLUSIVE").upper()
            
            final_result = {
                "prediction": {
                    "label": 'real' if verdict == "REAL" else 'artificial',
                    "score": 100.0
                },
                "success": True
            }

            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(final_result).encode('utf-8'))

        except Exception as e:
            error_result = {"success": False, "error": str(e)}
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(error_result).encode('utf-8'))
