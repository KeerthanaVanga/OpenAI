const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 4000;

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads';
    // Create uploads directory if it doesn't exist
    require('fs').mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 10 // Max 10 files
  },
  fileFilter: (req, file, cb) => {
    // Allow images and common document types
    const allowedTypes = [
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
      'text/plain', 'text/markdown',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} is not supported`), false);
    }
  }
});

// Helper function to convert file to generative part for Gemini
async function fileToGenerativePart(filePath, mimeType) {
  try {
    const fileData = await fs.readFile(filePath);
    return {
      inlineData: {
        data: fileData.toString('base64'),
        mimeType: mimeType,
      },
    };
  } catch (error) {
    console.error('Error reading file:', error);
    throw new Error('Failed to process uploaded file');
  }
}

// Helper function to read text files
async function readTextFile(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return content;
  } catch (error) {
    console.error('Error reading text file:', error);
    throw new Error('Failed to read text file');
  }
}

// Main chat endpoint
app.post('/chat', upload.array('files', 10), async (req, res) => {
  try {
    const { prompt } = req.body;
    const files = req.files || [];

    if (!prompt && files.length === 0) {
      return res.status(400).json({ error: 'Please provide a prompt or upload files' });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: 'Gemini API key not configured' });
    }

    // Get the generative model
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    let parts = [];
    
    // Add the text prompt if provided
    if (prompt) {
      parts.push(prompt);
    }

    // Process uploaded files
    for (const file of files) {
      try {
        const mimeType = file.mimetype;
        const filePath = file.path;

        if (mimeType.startsWith('image/')) {
          // Handle image files
          const imagePart = await fileToGenerativePart(filePath, mimeType);
          parts.push(imagePart);
          
          // Add context for image analysis if no prompt provided
          if (!prompt) {
            parts.push("Please analyze this image and describe what you see in detail.");
          }
        } else if (mimeType === 'text/plain' || mimeType === 'text/markdown') {
          // Handle text files
          const textContent = await readTextFile(filePath);
          parts.push(`Content of file "${file.originalname}":\n${textContent}`);
          
          if (!prompt) {
            parts.push("Please summarize the content of this file.");
          }
        } else if (mimeType === 'application/pdf' || 
                   mimeType === 'application/msword' || 
                   mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
          // For PDF and Word documents, we'll inform the user that we need text extraction
          parts.push(`I received a ${mimeType.includes('pdf') ? 'PDF' : 'Word'} document named "${file.originalname}". 
                     For better analysis, please convert this document to plain text or paste the content directly.`);
        }

        // Clean up uploaded file
        await fs.unlink(filePath);
      } catch (fileError) {
        console.error('Error processing file:', file.originalname, fileError);
        // Continue processing other files
      }
    }

    if (parts.length === 0) {
      return res.status(400).json({ error: 'No valid content to process' });
    }

    console.log('Sending request to Gemini with', parts.length, 'parts');

    // Generate content using Gemini
    const result = await model.generateContent(parts);
    const response = await result.response;
    const output = response.text();

    res.json({ 
      output: output,
      filesProcessed: files.length
    });

  } catch (error) {
    console.error('Error in chat endpoint:', error);
    
    // Clean up any uploaded files in case of error
    if (req.files) {
      req.files.forEach(async (file) => {
        try {
          await fs.unlink(file.path);
        } catch (cleanupError) {
          console.error('Error cleaning up file:', cleanupError);
        }
      });
    }

    // Handle specific Gemini AI errors
    if (error.message.includes('API_KEY')) {
      return res.status(500).json({ error: 'Invalid API key configuration' });
    } else if (error.message.includes('SAFETY')) {
      return res.status(400).json({ error: 'Content was blocked by safety filters' });
    } else if (error.message.includes('QUOTA_EXCEEDED')) {
      return res.status(429).json({ error: 'API quota exceeded. Please try again later.' });
    }

    res.status(500).json({ 
      error: error.message || 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    geminiConfigured: !!process.env.GEMINI_API_KEY
  });
});

// Test endpoint to verify Gemini connection
app.get('/test-gemini', async (req, res) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: 'Gemini API key not configured' });
    }

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent("Hello, please respond with 'Gemini AI is working correctly!'");
    const response = await result.response;
    
    res.json({ 
      status: 'success',
      message: response.text()
    });
  } catch (error) {
    console.error('Gemini test error:', error);
    res.status(500).json({ 
      error: 'Failed to connect to Gemini AI',
      details: error.message
    });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 10MB.' });
    } else if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ error: 'Too many files. Maximum is 10 files.' });
    }
  }
  
  console.error('Unhandled error:', error);
  res.status(500).json({ error: error.message || 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`🧪 Test Gemini: http://localhost:${PORT}/test-gemini`);
  console.log(`💬 Chat endpoint: http://localhost:${PORT}/chat`);
  
  if (!process.env.GEMINI_API_KEY) {
    console.log('⚠️  WARNING: GEMINI_API_KEY not found in environment variables');
  } else {
    console.log('✅ Gemini API key configured');
  }
});


module.exports = app;
