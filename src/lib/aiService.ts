import { GoogleGenAI, Type } from "@google/genai";

export type AIProvider = 'google' | 'openai' | 'anthropic' | 'openrouter' | 'ollama' | 'custom';
export type Granularity = 'coarse' | 'fine';

export interface FileMetadata {
  extractedTitle: string;
  summary: string;
  keywords: string[];
  suggestedCategory: string;
  subCategory?: string;
  features?: string[];
}

async function extractWithGoogle(prompt: string, apiKey?: string, modelName: string = "gemini-3-flash-preview", inlineData?: { data: string, mimeType: string }): Promise<FileMetadata> {
  const ai = new GoogleGenAI({ apiKey: apiKey || process.env.GEMINI_API_KEY || '' });
  const parts: any[] = [];

  if (inlineData) {
    parts.push({ inlineData });
  }
  parts.push({ text: prompt });

  const response = await ai.models.generateContent({
    model: modelName,
    contents: [{ role: 'user', parts }],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          extractedTitle: { type: Type.STRING },
          summary: { type: Type.STRING },
          keywords: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          },
          suggestedCategory: { type: Type.STRING },
          subCategory: { type: Type.STRING },
          features: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ["extractedTitle", "summary", "keywords", "suggestedCategory"]
      }
    }
  });

  const responseText = response.text || (response.candidates?.[0]?.content?.parts?.[0] as any)?.text || '{}';
  return JSON.parse(responseText);
}

async function extractBatchWithGoogle(files: { filename: string, type: string, base64?: string }[], granularity: Granularity, apiKey?: string, modelName: string = "gemini-3-flash-preview"): Promise<FileMetadata[]> {
  const ai = new GoogleGenAI({ apiKey: apiKey || process.env.GEMINI_API_KEY || '' });
  const parts: any[] = [];

  let prompt = `
    Analyze the following list of ${files.length} files. 
    Granularity: ${granularity}
    
    If no file content (base64) is provided for a file, use the filename to infer the most likely professional title and category.
    
    For EACH file, provide:
    - Professional Title (Clean version of the name, e.g., "IMG_2024.jpg" -> "Sunset Beach Photo")
    - Brief Summary
    - 5 Keywords
    - Suggested main category (one word)
    - Sub-category
    - Features (e.g. "image", "document", "spreadsheet")

    Return an ARRAY of objects in EXACTLY the same order as provided.
  `;

  files.forEach((f, i) => {
    prompt += `\nFile ${i}: Name=${f.filename}, Type=${f.type}`;
    if (f.base64) {
      parts.push({ inlineData: { data: f.base64, mimeType: f.type } });
    }
  });

  parts.push({ text: prompt });

  const response = await ai.models.generateContent({
    model: modelName,
    contents: [{ role: 'user', parts }],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            extractedTitle: { type: Type.STRING },
            summary: { type: Type.STRING },
            keywords: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            suggestedCategory: { type: Type.STRING },
            subCategory: { type: Type.STRING },
            features: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ["extractedTitle", "summary", "keywords", "suggestedCategory"]
        }
      }
    }
  });

  try {
    const responseText = response.text || (response.candidates?.[0]?.content?.parts?.[0] as any)?.text || '[]';
    return JSON.parse(responseText);
  } catch (e) {
    console.error("Batch parse error", e);
    return files.map(f => ({
      extractedTitle: f.filename,
      summary: "Error parsing batch response",
      keywords: [],
      suggestedCategory: "uncategorized"
    }));
  }
}

async function extractWithRest(provider: AIProvider, prompt: string, apiKeys: Record<string, any>, modelName?: string): Promise<FileMetadata> {
  let url = '';
  let headers: Record<string, string> = { 'Content-Type': 'application/json' };
  let body: any = {};

  const apiKey = apiKeys[provider] || (import.meta as any).env[`VITE_${provider.toUpperCase()}_API_KEY`];

  if (provider === 'custom') {
    url = apiKeys.custom?.url || '';
    headers['Authorization'] = `Bearer ${apiKeys.custom?.key}`;
    body = {
      model: modelName || 'default',
      messages: [{ role: 'user', content: prompt + " Respond in JSON format." }],
      response_format: { type: "json_object" }
    };
  } else {
    switch (provider) {
      case 'openai':
        url = 'https://api.openai.com/v1/chat/completions';
        headers['Authorization'] = `Bearer ${apiKey}`;
        body = {
          model: modelName || 'gpt-4o',
          messages: [{ role: 'user', content: prompt + " Respond in JSON format." }],
          response_format: { type: "json_object" }
        };
        break;
      case 'anthropic':
        url = 'https://api.anthropic.com/v1/messages';
        headers['x-api-key'] = apiKey;
        headers['anthropic-version'] = '2023-06-01';
        body = {
          model: modelName || 'claude-3-5-sonnet-20240620',
          max_tokens: 1024,
          messages: [{ role: 'user', content: prompt + " Respond in JSON format." }]
        };
        break;
      case 'openrouter':
        url = 'https://openrouter.ai/api/v1/chat/completions';
        headers['Authorization'] = `Bearer ${apiKey}`;
        body = {
          model: modelName || 'openai/gpt-4o-mini',
          messages: [{ role: 'user', content: prompt + " Respond in JSON format." }]
        };
        break;
      case 'ollama':
        url = 'http://localhost:11434/api/generate';
        body = {
          model: modelName || 'llama3',
          prompt: prompt + " Respond in JSON format.",
          format: 'json',
          stream: false
        };
        break;
    }
  }

  if (!url) throw new Error(`URL not configured for provider: ${provider}`);

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`API Error (${provider} ${res.status}): ${errText}`);
  }

  const data = await res.json();

  if (provider === 'openai' || provider === 'openrouter' || provider === 'custom') return JSON.parse(data.choices?.[0]?.message?.content || data.response || '{}');
  if (provider === 'anthropic') return JSON.parse(data.content?.[0]?.text || '{}');
  if (provider === 'ollama') return JSON.parse(data.response || '{}');

  return data;
}

export async function extractMetadata(
  filename: string,
  fileType: string,
  provider: AIProvider = 'google',
  granularity: Granularity = 'fine',
  base64Data?: string,
  apiKeys: Record<string, any> = {},
  modelName?: string
): Promise<FileMetadata> {
  const prompt = `
    Analyze the following file. 
    Filename: ${filename}
    FileType: ${fileType}
    Granularity: ${granularity} (If 'fine', provide specific sub-categories and identify niche features like 'screenshot', 'movie poster', 'receipt', 'code snippet', 'book cover').

    Provide:
    1. Professional Title (Clean version of the name, e.g., "IMG_2024.jpg" -> "Sunset Beach Photo").
    2. Brief Summary.
    3. 5 Keywords.
    4. Suggested main category (one word).
    5. Sub-category (one word, more specific).
    6. Features (array of strings identifying file types like 'screenshot').

    Response MUST be valid JSON.
  `;


  try {
    if (provider === 'google') {
      const inlineData = base64Data ? { data: base64Data, mimeType: fileType } : undefined;
      return await extractWithGoogle(prompt, apiKeys.google, modelName || "gemini-3-flash-preview", inlineData);
    }
    return await extractWithRest(provider, prompt, apiKeys, modelName);
  } catch (error) {
    console.error(`Metadata Extraction Error (${provider}):`, error);
    return {
      extractedTitle: filename,
      summary: "Could not generate summary.",
      keywords: [],
      suggestedCategory: "uncategorized"
    };
  }
}

export async function extractMetadataBatch(
  files: { filename: string, type: string, base64?: string }[],
  granularity: Granularity = 'fine',
  apiKeys: Record<string, any> = {},
  modelName?: string
): Promise<FileMetadata[]> {
  try {
    return await extractBatchWithGoogle(files, granularity, apiKeys.google, modelName || "gemini-3-flash-preview");
  } catch (error) {
    console.error("Batch Extraction Error:", error);
    return files.map(f => ({
      extractedTitle: f.filename,
      summary: "Error in batch processing.",
      keywords: [],
      suggestedCategory: "uncategorized"
    }));
  }
}
