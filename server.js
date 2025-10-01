const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyAIkW1D5X-MqxMopgcz8qB4iq0UZj3R3jw';

// Middleware
app.use(cors());
app.use(express.json());

// Multer for file uploads
const upload = multer({ 
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

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
    status: 'Farm Expert Backend',
    version: '1.0.0',
    endpoints: ['/analyze-plant', '/query-disease', '/analyze-product', '/health']
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

    const imageBuffer = fs.readFileSync(req.file.path);
    const imageBase64 = imageBuffer.toString('base64');

    const prompt = `Analyze this plant image for diseases, pests, and health issues. Provide a detailed response in JSON format with the following structure:
    {
      "plant_health": "healthy/diseased/pest_infected",
      "confidence": "high/medium/low",
      "issues_found": ["list of diseases or pests identified"],
      "symptoms": ["visible symptoms"],
      "treatment": ["specific treatment recommendations"],
      "prevention": ["prevention tips"],
      "urgency": "immediate/within_week/monitor"
    }
    
    Be specific and practical for farmers.`;

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
app.post('/query-disease', async (req, res) => {
  try {
    const { plant_name, symptoms, location } = req.body;

    if (!plant_name || !symptoms) {
      return res.status(400).json({ error: 'Plant name and symptoms are required' });
    }

    const prompt = `As an agricultural expert, provide advice for this plant problem:
    
    Plant: ${plant_name}
    Symptoms: ${symptoms}
    Location: ${location || 'Not specified'}
    
    Provide response in JSON format:
    {
      "diagnosis": "most likely disease or issue",
      "confidence": "high/medium/low",
      "causes": ["possible causes"],
      "treatment_plan": {
        "immediate_actions": ["urgent steps"],
        "ongoing_care": ["continued treatment"],
        "timeline": "expected recovery time"
      },
      "prevention": ["future prevention tips"],
      "when_to_seek_help": "when to contact agricultural extension"
    }
    
    Be practical and specific for farmers.`;

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
app.post('/analyze-product', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image uploaded' });
    }

    const imageBuffer = fs.readFileSync(req.file.path);
    const imageBase64 = imageBuffer.toString('base64');

    const prompt = `Analyze this agricultural product image (fertilizer, pesticide, spray, etc.). Provide detailed information in JSON format:
    {
      "product_type": "fertilizer/pesticide/herbicide/fungicide/other",
      "product_name": "identified product name if visible",
      "active_ingredients": ["main active ingredients if identifiable"],
      "usage": {
        "target_crops": ["suitable crops"],
        "application_method": "how to apply",
        "dosage_guidance": "general dosage information",
        "timing": "when to apply"
      },
      "safety": {
        "precautions": ["safety measures"],
        "protective_equipment": ["required PPE"],
        "storage": "storage requirements"
      },
      "effectiveness": "assessment of product effectiveness",
      "recommendations": ["usage recommendations for farmers"]
    }
    
    Focus on practical farming advice and safety.`;

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

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Farm Expert Backend running on port ${PORT}`);
  console.log(`Gemini API Key configured: ${GEMINI_API_KEY ? 'Yes' : 'No'}`);
});
