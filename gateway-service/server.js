require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const { Firestore } = require('@google-cloud/firestore');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const db = new Firestore(); 

const broadcast = (data) => {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
};

wss.on('connection', (ws) => {
  console.log('New Dashboard client connected');
  broadcast({ type: 'USER_COUNT', payload: wss.clients.size });

  ws.on('close', () => {
    broadcast({ type: 'USER_COUNT', payload: wss.clients.size });
  });
});

app.post('/events/notify', (req, res) => {
  const eventData = req.body;
  
  if (!eventData) return res.status(400).send('No data received');

  console.log('Broadcasting real-time update:', eventData);

  broadcast({ type: 'REALTIME_EVENT', payload: eventData });
  
  res.status(200).send('Event broadcasted to dashboard');
});

app.get('/api/analytics/top-resources', async (req, res) => {
  try {
    const statsRef = db.collection('resource_stats');
    const snapshot = await statsRef.orderBy('views', 'desc').limit(10).get();
    
    if (snapshot.empty) {
      return res.json([]);
    }

    const results = [];
    snapshot.forEach(doc => {
      results.push({ id: doc.id, ...doc.data() });
    });

    res.json(results);
  } catch (err) {
    console.error('Firestore Query Error:', err);
    res.status(500).send('Failed to fetch analytics from Firestore');
  }
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`WebSocket Gateway is live on port ${PORT}`);
});