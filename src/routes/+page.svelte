<script>
  let analyzing = false;
  let analysisResult = null;
  let errorMessage = null;

  async function analyzeImage(event) {
    event.preventDefault();
    analyzing = true;
    errorMessage = null;
    analysisResult = null;

    const formData = new FormData(event.target);
    const imageFile = formData.get('imageFile');
    const imageUrl = formData.get('imageUrl');
    
    let originalDataUri;

    try {
      // Step 1: Get the original image data as a Data URI
      if (imageFile && imageFile.size > 0) {
        originalDataUri = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = error => reject(error);
          reader.readAsDataURL(imageFile);
        });
      } else if (imageUrl) {
        // We need a backend proxy to get around browser security (CORS) for URLs
        const proxyResponse = await fetch('/api/proxy-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: imageUrl })
        });
        if(!proxyResponse.ok) throw new Error("Could not fetch image from URL via proxy.");
        const { dataUri: proxiedUri } = await proxyResponse.json();
        originalDataUri = proxiedUri;
      } else {
        throw new Error("Please upload a file or provide a URL.");
      }

      // --- NEW: Step 2: Perform the "Compression Stress Test" using a canvas ---
      const stressedDataUri = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          // Re-compress the image at 90% JPEG quality
          resolve(canvas.toDataURL('image/jpeg', 0.9)); 
        };
        img.onerror = reject;
        img.src = originalDataUri;
      });

      // Step 3: Call our SvelteKit backend with the STRESSED image data
      const response = await fetch('', { // Calls the +server.js in the same folder
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stressedImageDataUri: stressedDataUri })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Analysis failed in the backend.");
      }
      
      const result = await response.json();
      analysisResult = { 
        prediction: result.prediction, 
        imageUrl: originalDataUri, // Show the user the original image
        fileUrl: result.fileUrl 
      };

    } catch (err) {
      errorMessage = err.message;
    } finally {
      analyzing = false;
    }
  }
</script>

<main>
  <header>
    <h1>AI Detective v3 🕵️</h1>
    <p>Is your image real or AI-generated? Let's find out.</p>
  </header>

  <form on:submit={analyzeImage}>
    <div class="input-group">
      <label for="file-upload">Upload an image from your device:</label>
      <input type="file" id="file-upload" name="imageFile" accept="image/*" />
    </div>
    <p class="or-divider">OR</p>
    <div class="input-group">
      <label for="image-url">Paste an image URL:</label>
      <input type="url" id="image-url" name="imageUrl" placeholder="https://example.com/image.jpg" />
    </div>
    <button type="submit" disabled={analyzing}>
      {#if analyzing}Performing forensic analysis...{:else}Analyze Image{/if}
    </button>
  </form>

  {#if analyzing}
    <div class="loader"></div>
  {/if}

  {#if errorMessage}
    <div class="result error-box"><p><strong>Error:</strong> {errorMessage}</p></div>
  {/if}

  {#if analysisResult}
    <div class="result result-box">
      <h2>Analysis Complete!</h2>
      <img src={analysisResult.imageUrl} alt="Analyzed" class="preview-image"/>
      <div class="verdict">
         {#if analysisResult.prediction.label === 'artificial'}
            <p class="ai">🚨 Prediction: AI GENERATED</p>
         {:else}
            <p class="real">✅ Prediction: REAL IMAGE</p>
         {/if}
         <p class="confidence">Confidence: {analysisResult.prediction.score.toFixed(2)}%</p>
      </div>
    </div>
  {/if}
</main>

<style>
  main { max-width: 600px; margin: 2rem auto; font-family: sans-serif; text-align: center; padding: 1rem; background: #f9f9f9; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1); }
  header { margin-bottom: 2rem; }
  h1 { color: #333; }
  form { display: flex; flex-direction: column; gap: 1.5rem; }
  .input-group { text-align: left; }
  label { display: block; margin-bottom: 0.5rem; font-weight: bold; }
  input { width: 100%; padding: 0.75rem; border-radius: 4px; border: 1px solid #ccc; box-sizing: border-box; }
  button { padding: 1rem; border: none; background-color: #007bff; color: white; font-size: 1rem; border-radius: 4px; cursor: pointer; transition: background-color 0.2s; }
  button:disabled { background-color: #aaa; cursor: not-allowed; }
  .or-divider { font-weight: bold; color: #888; }
  .result-box { margin-top: 2rem; padding: 1.5rem; border-radius: 8px; }
  .error-box { background-color: #ffebee; color: #c62828; }
  .verdict p { font-size: 1.5rem; font-weight: bold; margin: 0.5rem 0; }
  .ai { color: #d32f2f; }
  .real { color: #388e3c; }
  .confidence { font-size: 1rem; color: #555; font-weight: normal; }
  .preview-image { max-width: 100%; max-height: 300px; border-radius: 4px; margin-bottom: 1rem; }
  .loader { margin: 2rem auto; border: 8px solid #f3f3f3; border-top: 8px solid #3498db; border-radius: 50%; width: 60px; height: 60px; animation: spin 2s linear infinite; }
  @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
</style>
