// Import the Gemini API key and the Google AI SDK
import { GEMINI_API_KEY, GITHUB_PAT, GITHUB_REPO_FOR_UPLOADS } from '$env/static/private';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize the Google AI client with our secret key
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Helper function to convert an image buffer to the format Gemini needs
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
    console.log("SERVER CODE FINAL VERSION - Gemini with Forensic Audit Prompt.");
    console.log("`analyzeImage` function started at:", new Date().toISOString());

    const formData = await request.formData();
    const imageFile = formData.get('imageFile');
    const imageUrl = formData.get('imageUrl');

    let imageBuffer, mimeType, originalFilename, dataUri;

    try {
      // Step 1: Get image data
      if (imageFile && imageFile.size > 0) {
        imageBuffer = Buffer.from(await imageFile.arrayBuffer());
        mimeType = imageFile.type;
        originalFilename = imageFile.name;
      } else if (imageUrl) {
        const response = await fetch(imageUrl);
        if (!response.ok) throw new Error(`Could not fetch image. Status: ${response.status}`);
        imageBuffer = Buffer.from(await response.arrayBuffer());
        mimeType = response.headers.get('content-type') || 'image/jpeg';
        originalFilename = `from-url-${Date.now()}.jpg`;
      } else {
        throw new Error("No file or URL provided.");
      }
      dataUri = `data:${mimeType};base64,${imageBuffer.toString('base64')}`;

      // Step 2: Prepare the NEW "Forensic Audit" prompt for Gemini
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
      
      const prompt = `You are a world-leading expert in digital image forensics. Your task is to determine if the provided image is a real photograph or a sophisticated AI-generated image. Perform the following multi-step forensic audit.

      Step 1: Visual Anomaly Audit.
      Analyze the image for common visual artifacts of AI generation. Pay extremely close attention to:
      - The texture and pattern of the headscarf. Do the patterns wrap, fold, and stretch realistically, or do they appear unnaturally blended or inconsistent?
      - The boundary between the forehead and the fabric. Is it too perfect, lacking any hint of shadow or natural transition?
      - The skin texture. Does it have natural micro-imperfections, or is it overly smooth and uniform?

      Step 2: Simulated Technical Audit (Error Level Analysis).
      Mentally perform an Error Level Analysis (ELA). ELA identifies areas with different JPEG compression levels. In AI-generated images, the synthesized elements often have a uniform, higher error level (appearing brighter in an ELA map) compared to a real photograph's background. Does the woman's face and headscarf show a different, more uniform compression signature than what you would expect from a camera-captured scene?

      Step 3: Synthesize and Conclude.
      Based on the evidence from both the visual and simulated technical audits, form a final conclusion. Do not be deceived by the overall high quality. Your conclusion must be based on forensic evidence.

      Step 4: Report Findings.
      Respond with a JSON object. The object must contain one key: "final_verdict". The value for "final_verdict" must be either the single word "REAL" or the single word "FAKE".`;

      const imagePart = fileToGenerativePart(imageBuffer, mimeType);

      console.log("Sending image and FORENSIC AUDIT prompt to Google Gemini...");
      const result = await model.generateContent([prompt, imagePart]);
      const response = await result.response;
      let text = response.text().trim();
      
      // Clean the response to ensure it's valid JSON
      text = text.replace(/```json/g, '').replace(/```/g, '');
      console.log("Received raw response from Gemini:", text);

      const analysisResult = JSON.parse(text);
      const verdict = analysisResult.final_verdict.toUpperCase();
      
      let finalPrediction;
      if (verdict === "REAL") {
        finalPrediction = { label: 'real', score: 100 };
      } else if (verdict === "FAKE") {
        finalPrediction = { label: 'artificial', score: 100 };
      } else {
        throw new Error(`Unexpected verdict from AI: "${verdict}"`);
      }

      console.log("Saving image and results to GitHub...");
      const githubFileUrl = await saveToGithub(imageBuffer, originalFilename, finalPrediction);

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
    throw new Error("Could not save the image to the repository.");
  }
  const responseData = await response.json();
  return responseData.content.html_url;
}
