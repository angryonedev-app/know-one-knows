const { analyzeWithGemini, parseGeminiResponse } = require('./geminiService');

/**
 * Crop Tracking Business Logic
 * Handles crop lifecycle management and AI analysis
 */

/**
 * Create a new crop object (in memory, not saved to DB)
 * @param {object} cropData - Crop creation data
 * @returns {object} Crop object
 */
function createCrop(cropData) {
  const { userId, cropType, variety, plantingDate, plantingMethod, location } = cropData;
  
  // Validate required fields
  if (!userId || !cropType || !plantingDate || !plantingMethod || !location) {
    throw new Error('Missing required fields: userId, cropType, plantingDate, plantingMethod, location');
  }

  // Estimate harvest date based on crop type (rough estimates in days)
  const harvestDays = {
    tomato: 75, chili: 90, onion: 120, potato: 90, 
    wheat: 120, rice: 120, corn: 100, lettuce: 45
  };
  
  const daysToHarvest = harvestDays[cropType.toLowerCase()] || 90;
  const expectedHarvestDate = new Date(plantingDate);
  expectedHarvestDate.setDate(expectedHarvestDate.getDate() + daysToHarvest);

  return {
    cropId: `crop_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    userId,
    cropType: cropType.toLowerCase(),
    variety: variety || null,
    plantingDate: new Date(plantingDate),
    plantingMethod,
    location,
    currentStage: 'germination',
    status: 'active',
    expectedHarvestDate,
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

/**
 * Analyze crop growth photo using AI
 * @param {string} cropId - Crop identifier
 * @param {string} imageBase64 - Base64 encoded image
 * @param {string} previousPhotoSummary - Summary of previous analysis
 * @param {object} cropInfo - Crop information for context
 * @returns {Promise<object>} Analysis results
 */
async function analyzeGrowthPhoto(cropId, imageBase64, previousPhotoSummary = null, cropInfo = {}) {
  try {
    const { cropType = 'unknown', dayNumber = 1, language = 'en' } = cropInfo;
    
    const prompt = buildGrowthAnalysisPrompt(cropType, dayNumber, previousPhotoSummary, language);
    const rawResponse = await analyzeWithGemini(prompt, imageBase64, { model: 'gemini-2.0-flash' });
    const parsedResponse = parseGeminiResponse(rawResponse);
    
    return formatAnalysisForStorage(parsedResponse, dayNumber);
  } catch (error) {
    console.error('Growth photo analysis failed:', error);
    
    // Return fallback analysis
    return {
      healthScore: 50,
      growthStage: 'unknown',
      issues: ['Analysis failed - manual review needed'],
      observations: 'AI analysis unavailable',
      recommendations: ['Upload photo again', 'Check image quality'],
      nextPhotoDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      nextPhotoDays: 3,
      urgency: 'important'
    };
  }
}

/**
 * Calculate next photo date based on analysis
 * @param {object} currentAnalysis - AI analysis results
 * @param {string} cropType - Type of crop
 * @param {string} growthStage - Current growth stage
 * @returns {object} Next photo scheduling info
 */
function calculateNextPhotoDate(currentAnalysis, cropType, growthStage) {
  let baseDays = currentAnalysis.nextPhotoDays || 4;
  
  // Adjust based on health score
  if (currentAnalysis.healthScore < 70) {
    baseDays = Math.max(1, baseDays - 1);
  }
  
  // Adjust based on issues
  if (currentAnalysis.issues && currentAnalysis.issues.length > 0) {
    const hasCriticalIssues = currentAnalysis.issues.some(issue => 
      issue.toLowerCase().includes('disease') || 
      issue.toLowerCase().includes('pest') ||
      issue.toLowerCase().includes('dying')
    );
    if (hasCriticalIssues) {
      baseDays = Math.min(2, baseDays);
    }
  }
  
  // Adjust based on growth stage
  const stageAdjustments = {
    germination: 1,
    flowering: -1,
    fruiting: -1,
    maturity: 1
  };
  
  baseDays += stageAdjustments[growthStage] || 0;
  
  // Ensure within bounds
  const finalDays = Math.max(1, Math.min(7, baseDays));
  
  // Determine urgency
  let urgency = 'routine';
  if (finalDays <= 2) urgency = 'critical';
  else if (finalDays <= 3) urgency = 'important';
  
  const nextPhotoDate = new Date();
  nextPhotoDate.setDate(nextPhotoDate.getDate() + finalDays);
  
  return {
    nextPhotoDate,
    nextPhotoDays: finalDays,
    urgency
  };
}

/**
 * Build growth analysis prompt for Gemini
 * @param {string} cropType - Type of crop
 * @param {number} dayNumber - Days since planting
 * @param {string} previousSummary - Previous analysis summary
 * @param {string} language - Response language
 * @returns {string} Formatted prompt
 */
function buildGrowthAnalysisPrompt(cropType, dayNumber, previousSummary, language = 'en') {
  const langInstructions = {
    en: 'Respond in English.',
    hi: 'Respond in Hindi (हिंदी).',
    mr: 'Respond in Marathi (मराठी).'
  };
  
  const langInstruction = langInstructions[language] || langInstructions.en;
  
  return `${langInstruction}

You are analyzing a ${cropType} plant on day ${dayNumber} of growth.

${previousSummary ? `PREVIOUS ANALYSIS (Day ${dayNumber - 3}): ${previousSummary}` : 'This is the first photo analysis.'}

ANALYZE THE CURRENT PHOTO:
1. Identify current growth stage (germination/vegetative/flowering/fruiting/maturity)
2. Assess plant health (0-100 score)
3. Estimate plant height and leaf development
4. Detect any issues (diseases, pests, nutrient deficiency, water stress)
5. Compare with previous analysis if available
6. Provide specific farming recommendations
7. Determine when the next photo should be uploaded (3-7 days)

RESPOND IN JSON FORMAT:
{
  "growthStage": "germination/vegetative/flowering/fruiting/maturity",
  "healthScore": 85,
  "issues": ["list any problems detected"],
  "observations": "detailed visual observations",
  "recommendations": ["specific actionable advice"],
  "nextPhotoDays": 4,
  "urgency": "routine/important/critical/urgent"
}

Focus on practical farming advice for ${cropType} cultivation.`;
}

/**
 * Format AI response for database storage
 * @param {object} geminiResponse - Parsed Gemini response
 * @param {number} dayNumber - Days since planting
 * @returns {object} Formatted analysis object
 */
function formatAnalysisForStorage(geminiResponse, dayNumber) {
  if (!geminiResponse.parsed && geminiResponse.parsed !== false) {
    // If response is already parsed JSON
    const analysis = geminiResponse;
    
    return {
      healthScore: Math.max(0, Math.min(100, analysis.healthScore || 50)),
      growthStage: analysis.growthStage || 'unknown',
      issues: Array.isArray(analysis.issues) ? analysis.issues : [],
      observations: analysis.observations || 'No observations available',
      recommendations: Array.isArray(analysis.recommendations) ? analysis.recommendations : ['Monitor plant growth'],
      nextPhotoDate: null, // Will be calculated separately
      nextPhotoDays: Math.max(1, Math.min(7, analysis.nextPhotoDays || 4)),
      urgency: ['routine', 'important', 'critical', 'urgent'].includes(analysis.urgency) 
        ? analysis.urgency : 'routine'
    };
  }
  
  // Fallback for unparsed responses
  return {
    healthScore: 50,
    growthStage: 'unknown',
    issues: ['Unable to parse AI response'],
    observations: geminiResponse.rawResponse || 'Analysis unavailable',
    recommendations: ['Manual review needed'],
    nextPhotoDate: null,
    nextPhotoDays: 3,
    urgency: 'important'
  };
}

module.exports = {
  createCrop,
  analyzeGrowthPhoto,
  calculateNextPhotoDate,
  buildGrowthAnalysisPrompt,
  formatAnalysisForStorage
};
