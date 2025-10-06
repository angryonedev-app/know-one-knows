const express = require('express');
const multer = require('multer');
const { analyzeGrowthPhoto, calculateNextPhotoDate } = require('../services/cropTrackingService');

const router = express.Router();
const upload = multer({ dest: 'uploads/', limits: { fileSize: 10 * 1024 * 1024 } });

/**
 * Test endpoint for crop photo analysis
 * POST /api/crop-test/analyze-photo
 */
router.post('/analyze-photo', upload.single('image'), async (req, res) => {
  try {
    const { cropType, dayNumber, previousSummary, language } = req.body;
    
    // Validation
    if (!cropType) {
      return res.status(400).json({ error: 'cropType is required' });
    }
    
    if (!req.file) {
      return res.status(400).json({ error: 'Image file is required' });
    }
    
    // Valid crop types
    const validCrops = ['tomato', 'chili', 'onion', 'potato', 'wheat', 'rice', 'corn', 'lettuce'];
    if (!validCrops.includes(cropType.toLowerCase())) {
      return res.status(400).json({ 
        error: 'Invalid cropType', 
        validTypes: validCrops 
      });
    }
    
    // Read uploaded image
    const fs = require('fs');
    const imageBuffer = fs.readFileSync(req.file.path);
    const imageBase64 = imageBuffer.toString('base64');
    
    // Prepare crop info
    const cropInfo = {
      cropType: cropType.toLowerCase(),
      dayNumber: parseInt(dayNumber) || 1,
      language: language || 'en'
    };
    
    // Analyze photo with AI
    const analysis = await analyzeGrowthPhoto(
      'test_crop_id', 
      imageBase64, 
      previousSummary || null, 
      cropInfo
    );
    
    // Calculate next photo date
    const nextPhoto = calculateNextPhotoDate(
      analysis, 
      cropInfo.cropType, 
      analysis.growthStage
    );
    
    // Clean up uploaded file
    fs.unlinkSync(req.file.path);
    
    res.json({
      success: true,
      analysis: {
        healthScore: analysis.healthScore,
        growthStage: analysis.growthStage,
        issues: analysis.issues,
        observations: analysis.observations,
        recommendations: analysis.recommendations,
        urgency: analysis.urgency
      },
      nextPhoto: {
        date: nextPhoto.nextPhotoDate,
        days: nextPhoto.nextPhotoDays,
        urgency: nextPhoto.urgency
      },
      cropInfo,
      message: 'Analysis complete'
    });
    
  } catch (error) {
    console.error('Crop test analysis error:', error);
    
    // Clean up file if exists
    if (req.file) {
      try {
        const fs = require('fs');
        fs.unlinkSync(req.file.path);
      } catch (cleanupError) {
        console.error('File cleanup error:', cleanupError);
      }
    }
    
    res.status(500).json({ 
      error: 'Analysis failed', 
      message: error.message,
      success: false 
    });
  }
});

module.exports = router;
