import { json } from '@sveltejs/kit';

export async function POST({ request }) {
  try {
    const { url } = await request.json();
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error('Failed to fetch image from URL');
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    const mimeType = response.headers.get('content-type') || 'image/jpeg';
    const dataUri = `data:${mimeType};base64,${buffer.toString('base64')}`;
    return json({ dataUri });
  } catch (error) {
    return json({ error: error.message }, { status: 500 });
  }
}
