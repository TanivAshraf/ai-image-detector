import { GITHUB_PAT, GITHUB_REPO_FOR_UPLOADS } from '$env/static/private';
import { json } from '@sveltejs/kit';
import { Buffer } from 'buffer';

// This is a new function that our frontend will call
export async function POST({ request }) {
  try {
    const { imageDataUri, prediction } = await request.json();
    
    const base64Data = imageDataUri.split(',')[1];
    const imageData = Buffer.from(base64Data, 'base64');
    const originalFilename = `from-web-${Date.now()}.jpg`;

    const githubFileUrl = await saveToGithub(imageData, originalFilename, prediction);
    
    return json({ success: true, fileUrl: githubFileUrl });
  } catch (error) {
    return json({ success: false, error: error.message }, { status: 500 });
  }
}

async function saveToGithub(imageData, originalFilename, prediction) {
  const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_REPO_FOR_UPLOADS}/contents/uploads/${new Date().toISOString()}_${originalFilename}`;
  const content = imageData.toString('base64');
  const response = await fetch(GITHUB_API_URL, {
    method: 'PUT',
    headers: { 'Authorization': `token ${GITHUB_PAT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: `Analysis: ${prediction.label}`, content: content })
  });
  if (!response.ok) throw new Error("Could not save the image to the repository.");
  const responseData = await response.json();
  return responseData.content.html_url;
}
