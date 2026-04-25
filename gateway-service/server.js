require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const { Firestore } = require('@google-cloud/firestore');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const db = new Firestore({
  databaseId: process.env.FIRESTORE_DB_NAME || '(default)',
});

const broadcast = (data) => {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
};

wss.on('connection', (ws) => {
  console.log(`client connected (total: ${wss.clients.size})`);
  broadcast({ type: 'USER_COUNT', payload: wss.clients.size });

  ws.on('close', () => {
    broadcast({ type: 'USER_COUNT', payload: wss.clients.size });
  });
});

app.post('/events/notify', (req, res) => {
  const eventData = req.body;
  if (!eventData) return res.status(400).send('no data');

  broadcast({ type: 'REALTIME_EVENT', payload: eventData });
  res.status(200).send('ok');
});

app.post('/admin/kill-connections', (req, res) => {
  const count = wss.clients.size;
  wss.clients.forEach((client) => client.terminate());
  console.log(`terminated ${count} connection(s)`);
  res.status(200).json({ killed: count });
});

app.get('/api/analytics/top-movies', async (req, res) => {
  try {
    const snapshot = await db.collection('movie-stats')
      .orderBy('viewCount', 'desc')
      .limit(10)
      .get();

    const results = [];
    snapshot.forEach(doc => results.push({ id: doc.id, ...doc.data() }));

    res.json(results);
  } catch (err) {
    console.error('firestore error:', err);
    res.status(500).send('failed to fetch stats');
  }
});

app.get(/(.*)/, (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/events')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`gateway running on port ${PORT}`);
});
