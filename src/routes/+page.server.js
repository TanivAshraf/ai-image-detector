// Import the secret keys we set up in Vercel
import { HF_API_TOKEN, GITHUB_PAT, GITHUB_REPO_FOR_UPLOADS } from '$env/static/private';

const AI_MODEL_URL = "https://api-inference.huggingface.co/models/umm-maybe/AI-image-detector";

/**
 * This is the main server-side function that handles our form submission.
 */
export const actions = {
  analyzeImage: async ({ request }) => {
    // --- NEW LOGGING ---
    console.log("-----------------------------------------");
    console.log("`analyzeImage` function started at:", new Date().toISOString());

    const formData = await request.formData();
    const imageFile = formData.get('imageFile');
    const imageUrl = formData.get('imageUrl');

    let imageData;
    let filename;

    try {
      // --- Step 1: Get the image data ---
      if (imageFile && imageFile.size > 0) {
        // --- NEW LOGGING ---
        console.log(`Processing uploaded file: ${imageFile.name} (${imageFile.size} bytes)`);
        imageData = Buffer.from(await imageFile.arrayBuffer());
        filename = imageFile.name;
      } else if (imageUrl) {
        // --- NEW LOGGING ---
        console.log(`Processing image from URL: ${imageUrl}`);
        const response = await fetch(imageUrl);
        if (!response.ok) throw new Error(`Could not fetch image from URL. Status: ${response.status}`);
        imageData = Buffer.from(await response.arrayBuffer());
        filename = `from-url-${Date.now()}.jpg`;
      } else {
        throw new Error("No file or URL provided.");
      }
      console.log("Successfully processed image data.");

      // --- Step 2: Call the AI "Brain" (Hugging Face) ---
      // --- NEW LOGGING ---
      console.log(`Calling Hugging Face API at: ${AI_MODEL_URL}`);
      // Let's check if the API token is loaded
      if (!HF_API_TOKEN || HF_API_TOKEN.length < 10) {
          console.error("CRITICAL ERROR: Hugging Face API Token is missing or too short!");
          throw new Error("Server configuration error: Missing Hugging Face API Token.");
      }
      console.log("Hugging Face API Token seems to be loaded.");

      const aiResponse = await fetch(AI_MODEL_URL, {
        headers: { Authorization: `Bearer ${HF_API_TOKEN}` },
        method: "POST",
        body: imageData,
      });

      // --- NEW, MORE DETAILED LOGGING ---
      console.log(`Received response from Hugging Face. Status Code: ${aiResponse.status}`);
      
      if (!aiResponse.ok) {
         console.error("AI API response was NOT OK. Reading response body as text...");
         const errorBody = await aiResponse.text();
         console.error("--- HUGGING FACE ERROR RESPONSE ---");
         console.error(errorBody);
         console.error("---------------------------------");
         throw new Error(`The AI model returned an error. Status: ${aiResponse.status}`);
      }
      
      console.log("AI API response was OK. Parsing JSON...");
      const analysis = await aiResponse.json();
      const prediction = getTopPrediction(analysis);

      // --- Step 3: Save to the "Filing Cabinet" (GitHub) ---
      console.log("Saving image and results to GitHub...");
      const githubFileUrl = await saveToGithub(imageData, filename, prediction);
      console.log("Successfully saved to GitHub at:", githubFileUrl);

      // --- Step 4: Send the result back to the user's browser ---
      console.log("Sending successful result back to the browser.");
      return {
        success: true,
        result: {
          prediction,
          imageUrl: `data:image/jpeg;base64,${imageData.toString('base64')}`,
          fileUrl: githubFileUrl
        }
      };

    } catch (error) {
      // --- NEW LOGGING ---
      console.error("!!! An error occurred in the try-catch block !!!");
      console.error("Error Message:", error.message);
      console.log("Sending failure result back to the browser.");
      return { success: false, error: error.message };
    }
  }
};

/**
 * Helper function to find the prediction with the highest score.
 */
function getTopPrediction(analysis) {
  if (!analysis || analysis.length === 0) {
      throw new Error("AI analysis returned an empty result.");
  }
  let topPrediction = analysis.reduce((prev, current) => (prev.score > current.score) ? prev : current);
  topPrediction.score = topPrediction.score * 100;
  return topPrediction;
}

/**
 * Helper function to save files to your GitHub repo.
 */
async function saveToGithub(imageData, originalFilename, prediction) {
  // This function remains the same as before
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeFilename = originalFilename.replace(/[^a-zA-Z0-9.]/g, '_');
  const newFilename = `${timestamp}_${safeFilename}`;
  const repoPath = `uploads/${newFilename}`;
  const commitMessage = `Upload and analysis of ${newFilename}`;
  const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_REPO_FOR_UPLOADS}/contents/${repoPath}`;
  const content = imageData.toString('base64');
  const response = await fetch(GITHUB_API_URL, {
    method: 'PUT',
    headers: { 'Authorization': `token ${GITHUB_PAT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: commitMessage, content: content })
  });
  if (!response.ok) {
    console.error("Failed to save to GitHub:", await response.json());
    throw new Error("Could not save the image to the repository.");
  }
  const responseData = await response.json();
  return responseData.content.html_url;
}
