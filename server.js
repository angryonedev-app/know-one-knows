const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// ═══════════════════════════════════════════
// API KEY ROTATION SYSTEM (ISOLATED & SAFE)
// ═══════════════════════════════════════════

// Load multiple API keys from environment
const apiKeys = [
  process.env.GEMINI_API_KEY_1,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
  process.env.GEMINI_API_KEY_4,
  process.env.GEMINI_API_KEY_5
].filter(key => key && key.trim() !== '');

let rotationCounter = 0;
const ROTATION_INTERVAL = 3; // Rotate every 3 requests

function getNextApiKey() {
  if (apiKeys && apiKeys.length > 0) {
    // Calculate which key to use based on rotation counter
    const keyIndex = Math.floor(rotationCounter / ROTATION_INTERVAL) % apiKeys.length;
    const selectedKey = apiKeys[keyIndex];
    
    rotationCounter++;
    
    // Log rotation activity
    console.log(`🔑 Using API Key #${keyIndex + 1} (Request #${rotationCounter})`);
    if (rotationCounter % ROTATION_INTERVAL === 0) {
      const nextIndex = Math.floor(rotationCounter / ROTATION_INTERVAL) % apiKeys.length;
      console.log(`🔄 Next rotation will use API Key #${nextIndex + 1}`);
    }
    
    return selectedKey;
  } else {
    // FALLBACK: If no new keys are set, use the old one
    console.warn("⚠️  WARNING: Using legacy GEMINI_API_KEY. Please set GEMINI_API_KEY_1, etc.");
    return process.env.GEMINI_API_KEY;
  }
}

// ═══════════════════════════════════════════

// Middleware
app.use(cors());
app.use(express.json());

// Multer for file uploads
const upload = multer({ 
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Language instruction function
function getLanguageInstruction(langCode) {
  const instructions = {
    'en': 'Respond in English.',
    'hi': 'Respond ONLY in Hindi (हिंदी) language. Use Devanagari script. Write ALL text, disease names, treatments, and explanations in Hindi. Example: "आपके पौधे में लीफ माइनर का संक्रमण है।"',
    'mr': 'Respond ONLY in Marathi (मराठी) language. Use Devanagari script. Write ALL text, disease names, treatments, and explanations in Marathi. Example: "तुमच्या वनस्पतीला लीफ माइनर संक्रमण आहे।"',
    'hi-en': 'Respond in Hinglish (mix of Hindi and English using Roman/Latin script). Write in conversational Hindi-English mix that Indian farmers commonly use. Example: "Aapke plant mein leaf miner ka infection hai. Treatment ke liye Spinosad spray lagayein."'
  };
  return instructions[langCode] || instructions['en'];
}

// Plant analysis prompt
function getPlantAnalysisPrompt(language, location, temperature) {
  const langInstruction = getLanguageInstruction(language);
  
  const locationContext = location ? `You are providing diagnosis for a farmer in ${location}.` : 'You are providing diagnosis for a farmer.';
  const weatherContext = temperature ? ` The current temperature is around ${temperature}°C.` : '';
  const contextualAdvice = location || temperature ? ' Consider the location and weather conditions in your analysis and recommendations.' : '';
  
  return `${langInstruction}

${locationContext}${weatherContext}${contextualAdvice}

Analyze this plant image for diseases, pests, and health issues. Provide response in JSON format:
{
  "plant_health": "healthy/diseased/pest_infected",
  "confidence": "high/medium/low",
  "issues_found": ["list of diseases or pests"],
  "symptoms": ["visible symptoms"],
  "treatment": ["treatment recommendations"],
  "prevention": ["prevention tips"],
  "urgency": "immediate/within_week/monitor"
}

IMPORTANT: Write ALL field values in the specified language (${language}). Be specific and practical for farmers.`;
}

// Disease query prompt
function getDiseaseQueryPrompt(plantName, symptoms, location, language) {
  const langInstruction = getLanguageInstruction(language);
  
  return `${langInstruction}

Plant: ${plantName}
Symptoms: ${symptoms}
Location: ${location || 'Not specified'}

Provide advice in JSON format:
{
  "diagnosis": "disease name",
  "confidence": "high/medium/low",
  "causes": ["possible causes"],
  "treatment_plan": {
    "immediate_actions": ["urgent steps"],
    "ongoing_care": ["continued treatment"],
    "timeline": "recovery time"
  },
  "prevention": ["prevention tips"],
  "when_to_seek_help": "when to contact experts"
}

IMPORTANT: Write ALL field values in the specified language (${language}). Be practical for farmers.`;
}

// Product analysis prompt
function getProductAnalysisPrompt(language) {
  const langInstruction = getLanguageInstruction(language);
  
  return `${langInstruction}

Analyze this agricultural product image. Provide information in JSON format:
{
  "product_type": "fertilizer/pesticide/herbicide/fungicide",
  "product_name": "name if visible",
  "active_ingredients": ["ingredients"],
  "usage": {
    "target_crops": ["crops"],
    "application_method": "method",
    "dosage_guidance": "dosage",
    "timing": "when to apply"
  },
  "safety": {
    "precautions": ["safety measures"],
    "protective_equipment": ["required PPE"],
    "storage": "storage requirements"
  },
  "effectiveness": "assessment",
  "recommendations": ["recommendations"]
}

IMPORTANT: Write ALL field values in the specified language (${language}). Focus on farming advice.`;
}

// Gemini API function
async function callGeminiAPI(prompt, imageBase64 = null) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${getNextApiKey()}`;
  
  let payload = {
    contents: [{
      parts: [{ text: prompt }]
    }],
    generationConfig: {
      temperature: 0.4,
      topK: 32,
      topP: 1,
      maxOutputTokens: 4096,
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

  try {
    const response = await axios.post(url, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000
    });

    return response.data.candidates[0].content.parts[0].text;
  } catch (error) {
    console.error('Gemini API Error:', error.response?.data || error.message);
    throw new Error('AI analysis failed');
  }
}

// Routes
app.get('/', (req, res) => {
  res.json({
    status: 'Farm Expert AI Server',
    version: '1.0.0',
    endpoints: ['/analyze-plant', '/consultation', '/analyze-spray', '/analytics', '/record-scan', '/notifications', '/health']
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'Farm Expert AI' });
});

// Plant Disease Analysis
app.post('/analyze-plant', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image uploaded' });
    }

    const language = req.body.language || 'en';
    const analysisType = req.body.analysisType;
    const location = req.body.location;
    const temperature = req.body.temperature;
    
    const imageBuffer = fs.readFileSync(req.file.path);
    const imageBase64 = imageBuffer.toString('base64');

    // Choose prompt based on analysis type
    const prompt = analysisType === 'product' 
      ? getProductAnalysisPrompt(language)
      : getPlantAnalysisPrompt(language, location, temperature);
    
    const result = await callGeminiAPI(prompt, imageBase64);
    
    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    res.json({
      success: true,
      analysis: result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Plant analysis error:', error);
    if (req.file) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: error.message });
  }
});

// Disease Query
app.post('/consultation', async (req, res) => {
  try {
    const { plant_name, symptoms, location, language } = req.body;
    const lang = language || 'en';

    if (!plant_name || !symptoms) {
      return res.status(400).json({ error: 'Plant name and symptoms are required' });
    }

    const prompt = getDiseaseQueryPrompt(plant_name, symptoms, location, lang);
    const result = await callGeminiAPI(prompt);

    res.json({
      success: true,
      advice: result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Disease query error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Product Analysis
app.post('/analyze-spray', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image uploaded' });
    }

    const language = req.body.language || 'en';
    
    const imageBuffer = fs.readFileSync(req.file.path);
    const imageBase64 = imageBuffer.toString('base64');

    const prompt = getProductAnalysisPrompt(language);
    const result = await callGeminiAPI(prompt, imageBase64);
    
    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    res.json({
      success: true,
      analysis: result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Product analysis error:', error);
    if (req.file) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: error.message });
  }
});

// Simple record scan endpoint (placeholder)
app.post('/record-scan', (req, res) => {
  res.json({ success: true, message: 'Scan recorded (placeholder)' });
});

// Simple notifications endpoints (placeholder)
app.get('/notifications', (req, res) => {
  res.json([]);
});

app.post('/notifications', (req, res) => {
  const { title, message } = req.body;
  res.json({ id: 'placeholder', title, message, createdAt: new Date() });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// Analytics endpoint
app.get('/analytics', (req, res) => {
  res.json({
    total_scans: 150,
    diseases_detected: 45,
    healthy_plants: 105,
    top_diseases: [
      { name: "Leaf Blight", count: 12 },
      { name: "Powdery Mildew", count: 8 },
      { name: "Rust", count: 6 }
    ],
    timestamp: new Date().toISOString()
  });
});

// ============ CROP TRACKING TEST (New Feature) ============
const CROP_TEST_ENABLED = process.env.CROP_TEST_ENABLED === 'true';

if (CROP_TEST_ENABLED) {
  const cropTestRoutes = require('./routes/cropTracking');
  app.use('/api/crop-test', cropTestRoutes);
  console.log('✅ Crop tracking TEST endpoint enabled');
} else {
  console.log('⏸️  Crop tracking test disabled (set CROP_TEST_ENABLED=true)');
}
// ============================================================

// Start server
app.listen(PORT, () => {
  console.log(`Farm Expert Backend running on port ${PORT}`);
  console.log(`Gemini API Key configured: ${GEMINI_API_KEY ? 'Yes' : 'No'}`);
});
