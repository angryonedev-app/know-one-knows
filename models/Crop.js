const mongoose = require('mongoose');

/**
 * Crop Schema for tracking individual crop lifecycles
 * Stores basic crop information, planting details, and current status
 */
const cropSchema = new mongoose.Schema({
  cropId: {
    type: String,
    unique: true,
    default: () => `crop_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  },
  userId: {
    type: String,
    required: true,
    index: true
  },
  cropType: {
    type: String,
    required: true,
    lowercase: true
  },
  variety: {
    type: String,
    optional: true
  },
  plantingDate: {
    type: Date,
    required: true
  },
  plantingMethod: {
    type: String,
    enum: ['seed', 'transplant'],
    required: true
  },
  location: {
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    city: String,
    state: String
  },
  currentStage: {
    type: String,
    default: 'germination'
  },
  status: {
    type: String,
    enum: ['active', 'completed', 'abandoned'],
    default: 'active'
  },
  expectedHarvestDate: {
    type: Date,
    optional: true
  }
}, {
  timestamps: true
});

// Virtual field: calculate days since planting
cropSchema.virtual('daysActive').get(function() {
  return Math.floor((Date.now() - this.plantingDate) / (1000 * 60 * 60 * 24));
});

// Method: update current stage
cropSchema.methods.updateStage = function(newStage) {
  this.currentStage = newStage;
  return this.save();
};

// Ensure virtual fields are serialized
cropSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Crop', cropSchema);
