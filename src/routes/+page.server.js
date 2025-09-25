// NEW: Import the Replicate API token instead of the Hugging Face one
import { REPLICATE_API_TOKEN, GITHUB_PAT, GITHUB_REPO_FOR_UPLOADS } from '$env/static/private';

// This is a helper function to make Replicate API calls cleaner
async function callReplicateAPI(endpoint, method, body) {
  const response = await fetch(`https://api.replicate.com/v1/${endpoint}`, {
    method,
    headers: {
      'Authorization': `Token ${REPLICATE_API_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const errorBody = await response.json();
    console.error("Replicate API Error:", errorBody);
    throw new Error(errorBody.detail || "An error occurred with the Replicate API.");
  }
  return response.json();
}

/**
 * This is the main server-side function that handles our form submission.
 */
export const actions = {
  analyzeImage: async ({ request }) => {
    console.log("-----------------------------------------");
    console.log("`analyzeImage` function started using REPLICATE at:", new Date().toISOString());

    const formData = await request.formData();
    const imageFile = formData.get('imageFile');
    const imageUrl = formData.get('imageUrl');

    let imageBase64;
    let originalFilename;

    try {
      // Step 1: Get the image data and convert to a Base64 string for Replicate
      if (imageFile && imageFile.size > 0) {
        console.log(`Processing uploaded file: ${imageFile.name}`);
        const buffer = Buffer.from(await imageFile.arrayBuffer());
        imageBase64 = buffer.toString('base64');
        originalFilename = imageFile.name;
      } else if (imageUrl) {
        console.log(`Processing image from URL: ${imageUrl}`);
        const response = await fetch(imageUrl);
        if (!response.ok) throw new Error(`Could not fetch image from URL. Status: ${response.status}`);
        const buffer = Buffer.from(await response.arrayBuffer());
        imageBase64 = buffer.toString('base64');
        originalFilename = `from-url-${Date.now()}.jpg`;
      } else {
        throw new Error("No file or URL provided.");
      }
      
      const dataUri = `data:image/jpeg;base64,${imageBase64}`;

      // Step 2: Call the Replicate API to start the prediction job
      console.log("Starting prediction job on Replicate...");
      const startResponse = await callReplicateAPI('predictions', 'POST', {
        version: "02b3c535ab1e0b0e4f2270908ce91060932515a31a52e00830a8b417b1b392b1",
        input: { image: dataUri }
      });
      
      let predictionResult;
      let attempts = 0;
      const maxAttempts = 20; // Wait for a maximum of ~20 seconds

      // Step 3: Wait for the prediction job to complete
      while (attempts < maxAttempts) {
        console.log(`Checking prediction status (Attempt ${attempts + 1})...`);
        const statusResponse = await callReplicateAPI(`predictions/${startResponse.id}`, 'GET');
        
        if (statusResponse.status === 'succeeded') {
          console.log("Prediction succeeded!");
          predictionResult = statusResponse.output;
          break;
        } else if (statusResponse.status === 'failed' || statusResponse.status === 'canceled') {
          throw new Error(`Prediction failed or was canceled. Status: ${statusResponse.status}`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
        attempts++;
      }

      if (!predictionResult) {
        throw new Error("Prediction timed out and did not complete in time.");
      }
      
      // Step 4: Format the result and save to GitHub
      const finalPrediction = {
        label: predictionResult.label,
        score: (predictionResult.label === 'real' ? 1 - predictionResult.fake_confidence : predictionResult.fake_confidence) * 100
      };

      console.log("Saving image and results to GitHub...");
      const imageDataBuffer = Buffer.from(imageBase64, 'base64');
      const githubFileUrl = await saveToGithub(imageDataBuffer, originalFilename, finalPrediction);

      // Step 5: Send the result back to the user's browser
      return {
        success: true,
        result: {
          prediction: finalPrediction,
          imageUrl: dataUri,
          fileUrl: githubFileUrl
        }
      };

    } catch (error) {
      console.error("!!! An error occurred in the try-catch block !!!");
      console.error("Error Message:", error.message);
      return { success: false, error: error.message };
    }
  }
};


// This helper function to save to GitHub remains the same
async function saveToGithub(imageData, originalFilename, prediction) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeFilename = originalFilename.replace(/[^a-zA-Z0-9.]/g, '_');
  const newFilename = `${timestamp}_${safeFilename}`;
  const repoPath = `uploads/${newFilename}`;
  const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_REPO_FOR_UPLOADS}/contents/${repoPath}`;
  const content = imageData.toString('base64');
  const response = await fetch(GITHUB_API_URL, {
    method: 'PUT',
    headers: { 'Authorization': `token ${GITHUB_PAT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: `Analysis: ${prediction.label}`, content: content })
  });
  if (!response.ok) {
    console.error("Failed to save to GitHub:", await response.json());
    throw new Error("Could not save the image to the repository.");
  }
  const responseData = await response.json();
  return responseData.content.html_url;
}
