import { GEMINI_API_KEY, GITHUB_PAT, GITHUB_REPO_FOR_UPLOADS } from '$env/static/private';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { json } from '@sveltejs/kit';
import { Buffer } from 'buffer';

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

function fileToGenerativePart(buffer, mimeType) {
  return {
    inlineData: { data: buffer.toString("base64"), mimeType },
  };
}

export async function POST({ request }) {
  try {
    const { stressedImageDataUri } = await request.json();
    const base64Data = stressedImageDataUri.split(',')[1];
    const imageBuffer = Buffer.from(base64Data, 'base64');
    const mimeType = 'image/jpeg';

    // --- NEW: The Final "Compression Artifact Audit" prompt ---
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
    const prompt = `You are a world-leading expert in digital image forensics. You have been provided an image that has been deliberately re-compressed at 90% JPEG quality. This process acts as a stress test to reveal digital inconsistencies.

    Your task is to analyze this re-compressed image for digital artifacts.
    - In a REAL photograph, re-compression artifacts should be inconsistent and follow the natural complexity of the scene (e.g., more artifacts on detailed edges, fewer on smooth surfaces).
    - In an AI-GENERATED image, these artifacts will often appear more uniform, blocky, or patterned, revealing the underlying mathematical structure of the AI generator.

    Based on your analysis of the compression artifacts in this specific "stressed" image, is the image REAL or FAKE? Respond with a JSON object containing one key: "final_verdict", with a value of either "REAL" or "FAKE".`;

    const imagePart = fileToGenerativePart(imageBuffer, mimeType);
    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;
    let text = response.text().trim().replace(/```json/g, '').replace(/```/g, '');
    
    const analysisResult = JSON.parse(text);
    const verdict = analysisResult.final_verdict.toUpperCase();
    const prediction = {
      label: verdict === "REAL" ? 'real' : 'artificial',
      score: 100
    };

    // Now, save the original image to GitHub
    // (Note: This part requires us to pass the original, which complicates things. Let's simplify and just return the verdict for now)
    const githubFileUrl = await saveToGithub(imageBuffer, `analysis-${Date.now()}.jpg`, prediction);

    return json({ prediction, fileUrl: githubFileUrl });

  } catch (error) {
    console.error("Error in +server.js:", error);
    return json({ success: false, error: error.message }, { status: 500 });
  }
}

// We need a second endpoint to handle the image URL proxy
export async function fallback({ request }) {
    if (request.url.endsWith('/api/proxy-image')) {
        const { url } = await request.json();
        const response = await fetch(url);
        const buffer = Buffer.from(await response.arrayBuffer());
        const mimeType = response.headers.get('content-type') || 'image/jpeg';
        const dataUri = `data:${mimeType};base64,${buffer.toString('base64')}`;
        return json({ dataUri });
    }
    return new Response("Not Found", { status: 404 });
}


async function saveToGithub(imageData, originalFilename, prediction) {
  const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_REPO_FOR_UPLOADS}/contents/uploads/${new Date().toISOString()}_${originalFilename}`;
  const content = imageData.toString('base64');
  const response = await fetch(GITHUB_API_URL, {
    method: 'PUT',
    headers: { 'Authorization': `token ${GITHUB_PAT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: `Analysis: ${prediction.label}`, content: content })
  });
  if (!response.ok) {
      console.error("GitHub Save Error:", await response.text());
      throw new Error("Could not save the image to the repository.");
  }
  const responseData = await response.json();
  return responseData.content.html_url;
}
