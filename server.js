const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

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
function getPlantAnalysisPrompt(language) {
  const langInstruction = getLanguageInstruction(language);
  
  return `${langInstruction}

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
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  
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
    
    const imageBuffer = fs.readFileSync(req.file.path);
    const imageBase64 = imageBuffer.toString('base64');

    // Choose prompt based on analysis type
    const prompt = analysisType === 'product' 
      ? getProductAnalysisPrompt(language)
      : getPlantAnalysisPrompt(language);
    
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

// Start server
app.listen(PORT, () => {
  console.log(`Farm Expert Backend running on port ${PORT}`);
  console.log(`Gemini API Key configured: ${GEMINI_API_KEY ? 'Yes' : 'No'}`);
});
