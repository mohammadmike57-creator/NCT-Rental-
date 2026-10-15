# Integration Guide: Professional Advanced XML/CRM System

## Quick Start

### Step 1: Import the Component

Add to your main application file (e.g., `App.tsx` or routing configuration):

```typescript
import ProfessionalAdvancedXMLCRM from './components/ProfessionalAdvancedXMLCRM';

// In your component
function App() {
  return (
    <div>
      <ProfessionalAdvancedXMLCRM />
    </div>
  );
}
```

### Step 2: Add to Navigation Menu

If you have a navigation system, add a menu item:

```typescript
const menuItems = [
  { path: '/dashboard', component: Dashboard },
  { path: '/reservations', component: Reservations },
  { path: '/xml-crm', component: ProfessionalAdvancedXMLCRM }, // Add this
  // ... other routes
];
```

### Step 3: Add Route (if using React Router)

```typescript
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import ProfessionalAdvancedXMLCRM from './components/ProfessionalAdvancedXMLCRM';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/xml-crm" element={<ProfessionalAdvancedXMLCRM />} />
        {/* ... other routes */}
      </Routes>
    </BrowserRouter>
  );
}
```

## Integration with Existing System

### Connect to Reservation Data

To integrate with your existing reservation system:

```typescript
import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot } from 'firebase/firestore';

// In your component
const [reservations, setReservations] = useState<Reservation[]>([]);

useEffect(() => {
  const unsubscribe = onSnapshot(
    collection(db, 'reservations'),
    (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Reservation[];
      setReservations(data);
    }
  );
  return () => unsubscribe();
}, []);
```

### Connect to Channel APIs

For production use, replace the sample channels with real API connections:

```typescript
// Example: Booking.com API Integration
const syncBookingComChannel = async () => {
  const response = await fetch('https://api.booking.com/v2/xml', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.BOOKING_COM_API_KEY}`,
      'Content-Type': 'application/xml'
    },
    body: xmlPayload
  });

  const xmlData = await response.text();
  const parsedData = await parseStringPromise(xmlData);

  // Process and store reservations
  return parsedData;
};
```

### Environment Variables

Create a `.env` file for API credentials:

```bash
# .env
REACT_APP_BOOKING_COM_API_KEY=your_booking_com_key
REACT_APP_BOOKING_COM_HOTEL_ID=your_hotel_id
REACT_APP_EXPEDIA_API_KEY=your_expedia_key
REACT_APP_EXPEDIA_HOTEL_ID=your_hotel_id
REACT_APP_AIRBNB_API_KEY=your_airbnb_key
REACT_APP_AIRBNB_LISTING_ID=your_listing_id
```

### Firebase Integration (Optional)

Store channel configuration in Firebase:

```typescript
// Store channel configuration
const saveChannelConfig = async (channel: DistributionChannel) => {
  await setDoc(doc(db, 'channels', channel.id), channel);
};

// Load channel configuration
const loadChannelConfig = async () => {
  const snapshot = await getDocs(collection(db, 'channels'));
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};
```

## Advanced Features

### Real WebSocket Implementation

Replace simulated WebSocket with real connections:

```typescript
import { useEffect } from 'react';

useEffect(() => {
  const ws = new WebSocket('wss://your-api.com/bookings');

  ws.onopen = () => {
    console.log('WebSocket connected');
  };

  ws.onmessage = (event) => {
    const bookingEvent = JSON.parse(event.data);
    setBookingEvents(prev => [bookingEvent, ...prev]);

    // Trigger notification
    addNotification({
      id: `notif_${Date.now()}`,
      message: `New ${bookingEvent.type} from ${bookingEvent.channel}`,
      type: 'success'
    });
  };

  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
  };

  return () => ws.close();
}, []);
```

### Actual XML Processing

Connect to real XML endpoints:

```typescript
const processIncomingXML = async (xmlData: string, channelId: string) => {
  try {
    // Validate XML
    const validation = await validateXML(xmlData);

    if (!validation.isValid) {
      throw new Error('Invalid XML format');
    }

    // Parse XML
    const parsed = await parseStringPromise(xmlData);

    // Extract booking data
    const bookings = extractBookingsFromXML(parsed, channelId);

    // Store in database
    for (const booking of bookings) {
      await addDoc(collection(db, 'reservations'), booking);
    }

    return { success: true, bookingsCount: bookings.length };
  } catch (error) {
    console.error('XML processing error:', error);
    return { success: false, error };
  }
};
```

### Customer Data Integration

Sync with existing customer database:

```typescript
const syncCustomerData = async () => {
  // Get all reservations
  const reservationsSnapshot = await getDocs(collection(db, 'reservations'));
  const reservations = reservationsSnapshot.docs.map(doc => doc.data());

  // Group by customer
  const customerMap = new Map<string, CustomerProfile>();

  for (const reservation of reservations) {
    const email = reservation.customerEmail;

    if (!customerMap.has(email)) {
      customerMap.set(email, {
        id: generateCustomerId(),
        name: reservation.customer,
        email: email,
        phone: reservation.contactNumber || '',
        segment: determineSegment(reservations, email),
        totalBookings: 0,
        totalRevenue: 0,
        averageBookingValue: 0,
        lastBookingDate: null,
        loyaltyPoints: 0,
        preferredChannel: '',
        tags: [],
        notes: '',
        communicationPreferences: { email: true, sms: false, push: false },
        sentiment: 'neutral'
      });
    }

    // Update customer stats
    const customer = customerMap.get(email)!;
    customer.totalBookings++;
    customer.totalRevenue += reservation.amount;
    // ... update other fields
  }

  // Save to database
  for (const [email, customer] of customerMap) {
    await setDoc(doc(db, 'customers', customer.id), customer);
  }
};
```

## Webhook Endpoints

### Express.js Backend Example

Create webhook receivers for channels:

```typescript
// server.js
import express from 'express';
import bodyParser from 'body-parser';
import { parseStringPromise } from 'xml2js';

const app = express();
app.use(bodyParser.text({ type: 'application/xml' }));

// Booking.com webhook
app.post('/webhooks/booking-com', async (req, res) => {
  try {
    const xmlData = req.body;
    const parsed = await parseStringPromise(xmlData);

    // Process booking
    const booking = extractBookingFromXML(parsed);

    // Store in database
    await saveBooking(booking);

    // Send confirmation
    res.status(200).send('<OTA_HotelResNotifRS><Success /></OTA_HotelResNotifRS>');
  } catch (error) {
    console.error('Booking.com webhook error:', error);
    res.status(500).send('<OTA_HotelResNotifRS><Error /></OTA_HotelResNotifRS>');
  }
});

// Expedia webhook
app.post('/webhooks/expedia', async (req, res) => {
  // Similar processing for Expedia format
});

// Airbnb webhook
app.post('/webhooks/airbnb', async (req, res) => {
  // Process JSON format from Airbnb
  const bookingData = req.body;
  await processAirbnbBooking(bookingData);
  res.status(200).json({ success: true });
});

app.listen(3000, () => {
  console.log('Webhook server running on port 3000');
});
```

## Performance Optimization

### Lazy Loading Large Datasets

```typescript
import { useState, useEffect } from 'react';

const usePaginatedData = <T,>(
  fetchFn: (page: number, limit: number) => Promise<T[]>,
  pageSize: number = 50
) => {
  const [data, setData] = useState<T[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchFn(page, pageSize)
      .then(newData => setData(prev => [...prev, ...newData]))
      .finally(() => setLoading(false));
  }, [page]);

  return { data, loading, loadMore: () => setPage(p => p + 1) };
};
```

### Caching Strategy

```typescript
import { useQuery } from 'react-query';

const useChannelData = () => {
  return useQuery(
    'channels',
    fetchChannels,
    {
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheTime: 10 * 60 * 1000, // 10 minutes
      refetchOnWindowFocus: false
    }
  );
};
```

## Monitoring & Analytics

### Track Component Usage

```typescript
import { analytics } from '../firebase';
import { logEvent } from 'firebase/analytics';

const trackChannelSync = (channelName: string) => {
  logEvent(analytics, 'channel_sync', {
    channel_name: channelName,
    timestamp: new Date().toISOString()
  });
};

const trackXMLProcessing = (format: string, success: boolean) => {
  logEvent(analytics, 'xml_processing', {
    format,
    success,
    timestamp: new Date().toISOString()
  });
};
```

### Error Tracking

```typescript
import * as Sentry from '@sentry/react';

const handleChannelError = (error: Error, channelId: string) => {
  Sentry.captureException(error, {
    tags: { channel_id: channelId },
    extra: { timestamp: new Date().toISOString() }
  });

  addNotification({
    id: `error_${Date.now()}`,
    message: `Channel error: ${error.message}`,
    type: 'error'
  });
};
```

## Testing

### Unit Tests Example

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import ProfessionalAdvancedXMLCRM from './ProfessionalAdvancedXMLCRM';

describe('ProfessionalAdvancedXMLCRM', () => {
  it('renders dashboard tab by default', () => {
    render(<ProfessionalAdvancedXMLCRM />);
    expect(screen.getByText(/Total Bookings/i)).toBeInTheDocument();
  });

  it('switches tabs correctly', () => {
    render(<ProfessionalAdvancedXMLCRM />);
    fireEvent.click(screen.getByText(/Channels/i));
    expect(screen.getByText(/Distribution Channels/i)).toBeInTheDocument();
  });

  it('validates XML correctly', async () => {
    const { validateXML } = require('./ProfessionalAdvancedXMLCRM');
    const validXML = '<?xml version="1.0"?><root></root>';
    const result = await validateXML(validXML);
    expect(result.isValid).toBe(true);
  });
});
```

## Deployment Checklist

- [ ] Configure environment variables
- [ ] Set up webhook endpoints
- [ ] Configure channel API credentials
- [ ] Test XML processing with real data
- [ ] Set up monitoring and analytics
- [ ] Configure error tracking (Sentry)
- [ ] Test dark mode on all screens
- [ ] Verify mobile responsiveness
- [ ] Set up backup and recovery
- [ ] Configure rate limiting
- [ ] Test security features
- [ ] Document custom integrations

## Support

For questions or issues:

1. Check the README.md file
2. Review code comments in the component
3. Contact technical support: support@nct-rental.com

---

**Ready to revolutionize your multi-channel management!** 🚀
