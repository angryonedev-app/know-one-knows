# Backend Folder Structure

## Overview
Organized structure for Farm Expert AI backend with crop tracking feature.

## Folders

### `/routes`
- API endpoint definitions
- Route handlers for different features
- Files: `cropTracking.js`

### `/services`
- Business logic and external API integrations
- Files: `cropTrackingService.js`, `geminiService.js`

### `/models`
- Database schemas and data models
- Files: `Crop.js`, `CropPhoto.js`

### `/config`
- Configuration files for database, environment, etc.
- Files: `database.js`

### `/uploads`
- File upload storage (existing)
- Used by multer for image uploads

## Current Status
- Structure created: October 5, 2025
- Files contain placeholder comments only
- Main `server.js` unchanged
- Existing endpoints unaffected
