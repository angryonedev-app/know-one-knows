const axios = require('axios');

/**
 * Shared Gemini AI Service
 * Provides standardized interface for all Gemini API calls
 */

/**
 * Analyze content with Gemini AI
 * @param {string} prompt - The analysis prompt
 * @param {string} imageBase64 - Base64 encoded image (optional)
 * @param {object} options - Configuration options
 * @returns {Promise<string>} AI response text
 */
async function analyzeWithGemini(prompt, imageBase64 = null, options = {}) {
  const {
    temperature = 0.4,
    maxTokens = 4096,
    model = 'gemini-2.0-flash'
  } = options;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
  
  let payload = {
    contents: [{
      parts: [{ text: prompt }]
    }],
    generationConfig: {
      temperature,
      topK: 32,
      topP: 1,
      maxOutputTokens: maxTokens,
    }
  };

  if (imageBase64) {
    payload.contents[0].parts.push({
      inlineData: {
        mimeType: "image/jpeg",
        data: imageBase64
      }
    });
  }

  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await axios.post(url, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
      });

      return response.data.candidates[0].content.parts[0].text;
    } catch (error) {
      lastError = error;
      console.error(`Gemini API attempt ${attempt + 1} failed:`, error.response?.data || error.message);
      
      if (attempt < 2) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
  }
  
  throw new Error(`Gemini API failed after 3 attempts: ${lastError.message}`);
}

/**
 * Build prompt for different analysis types
 * @param {string} type - Analysis type (plant, product, growth)
 * @param {object} context - Context data for prompt
 * @returns {string} Formatted prompt
 */
function buildPrompt(type, context) {
  const prompts = {
    growth: buildGrowthPrompt(context),
    plant: buildPlantPrompt(context),
    product: buildProductPrompt(context)
  };
  
  return prompts[type] || context.customPrompt;
}

/**
 * Parse Gemini response and extract JSON
 * @param {string} rawResponse - Raw AI response
 * @returns {object} Parsed JSON or fallback object
 */
function parseGeminiResponse(rawResponse) {
  try {
    // Try to extract JSON from response
    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    // Fallback: return raw response wrapped
    return { rawResponse, parsed: false };
  } catch (error) {
    console.error('Failed to parse Gemini response:', error);
    return { rawResponse, parsed: false, error: error.message };
  }
}

function buildGrowthPrompt(context) {
  return `Analyze this ${context.cropType} plant on day ${context.dayNumber} of growth.
${context.previousSummary ? `PREVIOUS ANALYSIS: ${context.previousSummary}` : ''}

Respond in JSON format:
{
  "growthStage": "germination/vegetative/flowering/fruiting/maturity",
  "healthScore": 0-100,
  "issues": ["array of issues"],
  "observations": "detailed observations",
  "recommendations": ["specific recommendations"],
  "nextPhotoDays": 3-7,
  "urgency": "routine/important/critical/urgent"
}`;
}

function buildPlantPrompt(context) {
  return context.customPrompt || "Analyze this plant for diseases and health issues.";
}

function buildProductPrompt(context) {
  return context.customPrompt || "Analyze this agricultural product.";
}

module.exports = {
  analyzeWithGemini,
  buildPrompt,
  parseGeminiResponse
};
