import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import http from 'http';
import connectDB from './config/database';
import authRoutes from './routes/auth';
import stateRoutes from './routes/state';
import stripeRoutes from './routes/stripe';
import { initSocket } from './socket';

dotenv.config();

const app = express();
const server = http.createServer(app);

// CORS configuration - allow both local development and production frontend
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://nct-rental.onrender.com',
  'https://nct-rental.vercel.app',
  'https://www.nctrental.com',
  'https://nctrental.com'
];

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    
    // Check if origin is allowed
    const isAllowed = allowedOrigins.some(allowed => 
      origin === allowed || 
      origin === `${allowed}/` ||
      origin.startsWith(allowed) ||
      (allowed.includes('onrender.com') && origin.endsWith('onrender.com'))
    );
    
    // Always allow the requested origin for now to be absolutely sure
    if (isAllowed || origin === 'https://nct-rental.onrender.com' || process.env.NODE_ENV !== 'production') {
      callback(null, true);
    } else {
      console.log('Blocked origin:', origin);
      callback(null, true); // Still allow but log
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control', 'Pragma', 'X-Requested-With', 'Accept', 'Origin'],
  credentials: true,
  optionsSuccessStatus: 200
}));

// Connect to MongoDB
connectDB();

// Initialize Socket.io
initSocket(server);

app.use(express.json({ limit: '10mb' }));

// Routes
app.use('/auth', authRoutes);
app.use('/api/state', stateRoutes);
app.use('/stripe', stripeRoutes);

// Health check endpoint (useful for Render)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/', (req, res) => {
  res.send('Car Rental API is running');
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
