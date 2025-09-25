import { HF_API_TOKEN, GEMINI_API_KEY, GITHUB_PAT, GITHUB_REPO_FOR_UPLOADS } from '$env/static/private';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { json } from '@sveltejs/kit';
import { Buffer } from 'buffer';

// --- Initialize Both AI Clients ---
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const HF_API_URL = "https://api-inference.huggingface.co/models/umm-maybe/AI-image-detector";

// --- Gemini Helper Function ---
function fileToGenerativePart(buffer, mimeType) {
  return { inlineData: { data: buffer.toString("base64"), mimeType } };
}

// --- Main Server Function ---
export async function POST({ request }) {
  console.log("-----------------------------------------");
  console.log("DUAL ANALYSIS: Calling both Hugging Face and Gemini.");

  try {
    const { imageDataUri } = await request.json();
    const base64Data = imageDataUri.split(',')[1];
    const imageBuffer = Buffer.from(base64Data, 'base64');
    const mimeType = imageDataUri.split(';')[0].split(':')[1];

    // --- Call both AI services in parallel for maximum speed ---
    const [hfResult, geminiResult] = await Promise.allSettled([
      analyzeWithHuggingFace(imageBuffer),
      analyzeWithGemini(imageBuffer, mimeType)
    ]);

    // --- Process the results, handling success or failure for each ---
    const hfPrediction = hfResult.status === 'fulfilled' ? hfResult.value : { label: 'Error', score: 0 };
    const geminiPrediction = geminiResult.status === 'fulfilled' ? geminiResult.value : { label: 'Error', score: 0 };
    
    // Save to GitHub (optional, but good for logging)
    await saveToGithub(imageBuffer, `analysis-${Date.now()}.jpg`, hfPrediction, geminiPrediction);

    return json({ hfPrediction, geminiPrediction });

  } catch (error) {
    console.error("Error in main POST handler:", error);
    return json({ error: error.message }, { status: 500 });
  }
}

// --- Hugging Face Specialist Analysis ---
async function analyzeWithHuggingFace(imageBuffer) {
  console.log("Contacting Hugging Face Specialist...");
  const response = await fetch(HF_API_URL, {
    headers: { Authorization: `Bearer ${HF_API_TOKEN}` },
    method: "POST",
    body: imageBuffer,
  });
  if (!response.ok) {
    throw new Error(`Hugging Face API Error: Status ${response.status}`);
  }
  const analysis = await response.json();
  let topPrediction = analysis.reduce((prev, current) => (prev.score > current.score) ? prev : current);
  return {
    label: topPrediction.label,
    score: topPrediction.score * 100
  };
}

// --- Gemini Generalist Analysis (with Forensic Prompt) ---
async function analyzeWithGemini(imageBuffer, mimeType) {
  console.log("Contacting Gemini Generalist...");
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
  const prompt = `You are a world-leading expert in digital image forensics. Your task is to determine if the provided image is a real photograph or a sophisticated AI-generated image. Perform the following multi-step forensic audit. Step 1: Visual Anomaly Audit. Analyze the image for common visual artifacts of AI generation. Pay extremely close attention to: - The texture and pattern of the headscarf. Do the patterns wrap, fold, and stretch realistically, or do they appear unnaturally blended or inconsistent? - The boundary between the forehead and the fabric. Is it too perfect, lacking any hint of shadow or natural transition? - The skin texture. Does it have natural micro-imperfections, or is it overly smooth and uniform? Step 2: Simulated Technical Audit (Error Level Analysis). Mentally perform an Error Level Analysis (ELA). ELA identifies areas with different JPEG compression levels. In AI-generated images, the synthesized elements often have a uniform, higher error level (appearing brighter in an ELA map) compared to a real photograph's background. Does the woman's face and headscarf show a different, more uniform compression signature than what you would expect from a camera-captured scene? Step 3: Synthesize and Conclude. Based on the evidence from both the visual and simulated technical audits, form a final conclusion. Do not be deceived by the overall high quality. Your conclusion must be based on forensic evidence. Step 4: Report Findings. Respond with a JSON object. The object must contain one key: "final_verdict". The value for "final_verdict" must be either the single word "REAL" or the single word "FAKE".`;
  
  const imagePart = fileToGenerativePart(imageBuffer, mimeType);
  const result = await model.generateContent([prompt, imagePart]);
  const response = await result.response;
  let text = response.text().trim().replace(/```json/g, '').replace(/```/g, '');
  
  const analysisResult = JSON.parse(text);
  const verdict = analysisResult.final_verdict.toUpperCase();
  return {
    label: verdict === "REAL" ? 'real' : 'artificial',
    score: 100
  };
}


// --- GitHub Saving Function (Updated) ---
async function saveToGithub(imageData, filename, hf, gemini) {
  const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_REPO_FOR_UPLOADS}/contents/uploads/${new Date().toISOString()}_${filename}`;
  const content = imageData.toString('base64');
  const commitMessage = `HF: ${hf.label} (${hf.score.toFixed(0)}%) | Gemini: ${gemini.label}`;
  
  const response = await fetch(GITHUB_API_URL, {
    method: 'PUT',
    headers: { 'Authorization': `token ${GITHUB_PAT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: commitMessage, content: content })
  });
  if (!response.ok) {
    console.error("GitHub Save Error:", await response.text());
  }
}
