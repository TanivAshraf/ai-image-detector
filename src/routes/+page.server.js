// Import the Gemini API key and the Google AI SDK
import { GEMINI_API_KEY, GITHUB_PAT, GITHUB_REPO_FOR_UPLOADS } from '$env/static/private';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize the Google AI client with our secret key
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

/**
 * Helper function to convert an image buffer to the format Gemini needs
 */
function fileToGenerativePart(buffer, mimeType) {
  return {
    inlineData: {
      data: buffer.toString("base64"),
      mimeType
    },
  };
}

export const actions = {
  analyzeImage: async ({ request }) => {
    console.log("-----------------------------------------");
    console.log("SERVER CODE VERSION: 5.0 - Using Google Gemini Pro Vision.");
    console.log("`analyzeImage` function started at:", new Date().toISOString());

    const formData = await request.formData();
    const imageFile = formData.get('imageFile');
    const imageUrl = formData.get('imageUrl');

    let imageBuffer;
    let mimeType;
    let originalFilename;
    let dataUri;

    try {
      // Step 1: Get image data and determine its type
      if (imageFile && imageFile.size > 0) {
        console.log(`Processing uploaded file: ${imageFile.name}`);
        imageBuffer = Buffer.from(await imageFile.arrayBuffer());
        mimeType = imageFile.type;
        originalFilename = imageFile.name;
      } else if (imageUrl) {
        console.log(`Processing image from URL: ${imageUrl}`);
        const response = await fetch(imageUrl);
        if (!response.ok) throw new Error(`Could not fetch image. Status: ${response.status}`);
        imageBuffer = Buffer.from(await response.arrayBuffer());
        // Guess the MIME type from the URL extension or use a default
        mimeType = response.headers.get('content-type') || 'image/jpeg';
        originalFilename = `from-url-${Date.now()}.jpg`;
      } else {
        throw new Error("No file or URL provided.");
      }

      dataUri = `data:${mimeType};base64,${imageBuffer.toString('base64')}`;

      // Step 2: Prepare the request for the Gemini API
      const model = genAI.getGenerativeModel({ model: "gemini-pro-vision" });
      const prompt = "Analyze this image. Is it a real photograph or is it AI-generated? Please respond with only the single word REAL or the single word FAKE.";
      const imagePart = fileToGenerativePart(imageBuffer, mimeType);

      console.log("Sending image and prompt to Google Gemini...");
      const result = await model.generateContent([prompt, imagePart]);
      const response = await result.response;
      const text = response.text().trim().toUpperCase();
      
      console.log("Received response from Gemini:", text);

      // Step 3: Format the result
      let finalPrediction;
      if (text.includes("REAL")) {
        finalPrediction = { label: 'real', score: 100 };
      } else if (text.includes("FAKE")) {
        finalPrediction = { label: 'artificial', score: 100 };
      } else {
        // If Gemini gives a longer answer, we'll call it inconclusive
        throw new Error(`Unexpected response from AI: "${text}"`);
      }

      // Step 4: Save to GitHub
      console.log("Saving image and results to GitHub...");
      const githubFileUrl = await saveToGithub(imageBuffer, originalFilename, finalPrediction);

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
  const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_REPO_FOR_UPLOADS}/contents/uploads/${new Date().toISOString()}_${originalFilename}`;
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
