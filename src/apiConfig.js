// src/apiConfig.js

// Set this to true to force it to use your live Render backend
const IS_PRODUCTION = true; 

export const API_BASE_URL = IS_PRODUCTION
  ? "https://jamba-project.onrender.com"
  : "http://localhost:5000";