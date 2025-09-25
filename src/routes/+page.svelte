<script>
  // This is the JavaScript part of our page
  let analyzing = false;
  let analysisResult = null;
  let errorMessage = null;
  let imageUrl = '';

  // This 'form' variable will hold the data from our server
  export let form;

  // This checks if the server sent back a result after we submitted a file/URL
  $: if (form) {
    analyzing = false;
    if (form.success) {
      analysisResult = form.result;
      errorMessage = null;
    } else {
      errorMessage = form.error;
      analysisResult = null;
    }
  }

  function startAnalysis() {
    analyzing = true;
    errorMessage = null;
    analysisResult = null;
  }
</script>

<main>
  <header>
    <h1>AI Detective v2 🕵️</h1>
    <p>Is your image real or AI-generated? Let's find out.</p>
  </header>

  <!-- Form for submitting files or URLs -->
  <form method="POST" action="?/analyzeImage" on:submit={startAnalysis} enctype="multipart/form-data">
    
    <!-- File Upload Section -->
    <div class="input-group">
      <label for="file-upload">Upload an image from your device:</label>
      <input type="file" id="file-upload" name="imageFile" accept="image/*" />
    </div>

    <p class="or-divider">OR</p>
    
    <!-- URL Input Section -->
    <div class="input-group">
      <label for="image-url">Paste an image URL:</label>
      <input type="url" id="image-url" name="imageUrl" placeholder="https://example.com/image.jpg" bind:value={imageUrl} />
    </div>

    <button type="submit" disabled={analyzing}>
      {#if analyzing}
        Analyzing...
      {:else}
        Analyze Image
      {/if}
    </button>
  </form>

  <!-- Results Display Section -->
  {#if analyzing}
    <div class="loader"></div>
    <p class="status">Contacting the expert... please wait.</p>
  {/if}

  {#if errorMessage}
    <div class="result error-box">
      <p><strong>Error:</strong> {errorMessage}</p>
    </div>
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
      <p class="info">Image and results saved. <a href={analysisResult.fileUrl} target="_blank">View on GitHub</a></p>
    </div>
  {/if}
</main>

<!-- This is the styling to make it look nice -->
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
