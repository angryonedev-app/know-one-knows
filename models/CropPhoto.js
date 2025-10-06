const mongoose = require('mongoose');

/**
 * CropPhoto Schema for storing crop progress photos and AI analysis
 * Links to Crop model and stores growth tracking data
 */
const cropPhotoSchema = new mongoose.Schema({
  photoId: {
    type: String,
    unique: true,
    default: () => `photo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  },
  cropId: {
    type: String,
    required: true,
    ref: 'Crop',
    index: true
  },
  dayNumber: {
    type: Number,
    required: true,
    index: true
  },
  imageUrl: {
    type: String,
    required: true
  },
  thumbnailUrl: {
    type: String,
    optional: true
  },
  analysis: {
    healthScore: {
      type: Number,
      min: 0,
      max: 100
    },
    growthStage: String,
    issues: [String],
    observations: String,
    recommendations: [String],
    nextPhotoDate: Date,
    nextPhotoDays: Number,
    urgency: {
      type: String,
      enum: ['routine', 'important', 'critical', 'urgent'],
      default: 'routine'
    }
  },
  metadata: {
    uploadedAt: {
      type: Date,
      default: Date.now
    },
    processedAt: Date,
    aiModel: {
      type: String,
      default: 'gemini-2.0-flash'
    }
  },
  farmerNotes: {
    type: String,
    optional: true
  }
}, {
  timestamps: true
});

// Compound index for efficient queries
cropPhotoSchema.index({ cropId: 1, dayNumber: 1 });

module.exports = mongoose.model('CropPhoto', cropPhotoSchema);
