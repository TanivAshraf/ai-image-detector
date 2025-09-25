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
    
    let dataUri;

    try {
      if (imageFile && imageFile.size > 0) {
        dataUri = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = error => reject(error);
          reader.readAsDataURL(imageFile);
        });
      } else if (imageUrl) {
        // We will now need a proper proxy in our backend
        const proxyResponse = await fetch('/api/proxy-image', {
          method: 'POST',
          body: JSON.stringify({ url: imageUrl })
        });
        if(!proxyResponse.ok) throw new Error("Could not fetch image from URL.");
        const { dataUri: proxiedUri } = await proxyResponse.json();
        dataUri = proxiedUri;
      } else {
        throw new Error("Please upload a file or provide a URL.");
      }

      const response = await fetch('', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageDataUri: dataUri })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Analysis failed in the backend.");
      }
      
      const result = await response.json();
      analysisResult = { 
        hfPrediction: result.hfPrediction,
        geminiPrediction: result.geminiPrediction,
        imageUrl: dataUri, 
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
    <h1>AI Detective: Comparison Tool 🕵️</h1>
    <p>See the difference between a Specialist and a Generalist AI.</p>
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
      {#if analyzing}Analyzing...{:else}Run Dual Analysis{/if}
    </button>
  </form>

  {#if analyzing}
    <div class="loader"></div>
  {/if}

  {#if errorMessage}
    <div class="result error-box"><p><strong>Error:</strong> {errorMessage}</p></div>
  {/if}

  <!-- NEW: Redesigned Results Area -->
  {#if analysisResult}
    <div class="result result-box">
      <h2>Analysis Complete!</h2>
      <img src={analysisResult.imageUrl} alt="Analyzed" class="preview-image"/>
      
      <div class="comparison-grid">
        <!-- Hugging Face Result -->
        <div class="verdict">
          <h3>Specialist Analysis (Hugging Face)</h3>
          {#if analysisResult.hfPrediction.label === 'artificial'}
            <p class="ai">🚨 AI GENERATED</p>
          {:else if analysisResult.hfPrediction.label === 'real'}
            <p class="real">✅ REAL IMAGE</p>
          {:else}
             <p class="error">Analysis Failed</p>
          {/if}
          <p class="confidence">Confidence: {analysisResult.hfPrediction.score.toFixed(2)}%</p>
        </div>

        <!-- Gemini Result -->
        <div class="verdict">
          <h3>Generalist Analysis (Gemini)</h3>
           {#if analysisResult.geminiPrediction.label === 'artificial'}
            <p class="ai">🚨 AI GENERATED</p>
          {:else if analysisResult.geminiPrediction.label === 'real'}
            <p class="real">✅ REAL IMAGE</p>
          {:else}
             <p class="error">Analysis Failed</p>
          {/if}
          <p class="confidence">Confidence: {analysisResult.geminiPrediction.score.toFixed(2)}%</p>
        </div>
      </div>
    </div>
  {/if}
</main>

<style>
  main { max-width: 800px; margin: 2rem auto; font-family: sans-serif; text-align: center; padding: 1rem; background: #f9f9f9; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1); }
  header { margin-bottom: 2rem; }
  h1 { color: #333; }
  .comparison-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 1.5rem; }
  .verdict { padding: 1rem; border: 1px solid #ddd; border-radius: 8px; background: #fff; }
  .verdict h3 { margin-top: 0; font-size: 1.1rem; color: #555; }
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
  .error { color: #f57c00; font-size: 1.2rem; }
  .confidence { font-size: 1rem; color: #555; font-weight: normal; }
  .preview-image { max-width: 50%; max-height: 300px; border-radius: 4px; margin-bottom: 1rem; }
  .loader { margin: 2rem auto; border: 8px solid #f3f3f3; border-top: 8px solid #3498db; border-radius: 50%; width: 60px; height: 60px; animation: spin 2s linear infinite; }
  @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
</style>
