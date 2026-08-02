import express from 'express';
import { authenticate } from '../middleware/auth';

const router = express.Router();

// POST /stripe/create-payment-link
router.post('/create-payment-link', authenticate, async (req, res) => {
  try {
    const { amount, description } = req.body;
    
    // This is a simulated Stripe link since we don't have the stripe package installed
    // and we don't have the API keys. 
    // This allows the frontend to proceed even with the Node.js backend.
    const simulatedUrl = `https://buy.stripe.com/simulated_nct_rental_${Date.now()}`;
    
    console.log(`[STRIPE] Created simulated link for ${amount}: ${description}`);
    
    res.json({ url: simulatedUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create payment link' });
  }
});

router.get('/test', (req, res) => {
  res.json({ status: 'ok' });
});

export default router;
