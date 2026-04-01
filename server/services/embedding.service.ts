import OpenAI from 'openai';

let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!_client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY not configured');
    _client = new OpenAI({ apiKey });
  }
  return _client;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const client = getClient();
  const response = await client.embeddings.create({
    model: 'text-embedding-3-small',
    input: text.slice(0, 8000),
    dimensions: 512,
  });
  return response.data[0].embedding;
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const client = getClient();
  const response = await client.embeddings.create({
    model: 'text-embedding-3-small',
    input: texts.map(t => t.slice(0, 8000)),
    dimensions: 512,
  });
  return response.data.map(d => d.embedding);
}
