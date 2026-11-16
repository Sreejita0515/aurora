// Vercel serverless entry point: runs the Express app from backend/server.js.
const app = require('../backend/server');

module.exports = (req, res) => {
  // If Vercel passed the path stripped of /api, normalize it so Express routes (/api/...) match
  if (req.url && !req.url.startsWith('/api')) {
    req.url = '/api' + (req.url.startsWith('/') ? req.url : '/' + req.url);
  }
  return app(req, res);
};
