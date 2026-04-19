const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const broadcast = (data) => {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
};

wss.on('connection', (ws) => {
  console.log('New client connected to Dashboard');
  broadcast({ type: 'USER_COUNT', payload: wss.clients.size });

  ws.on('close', () => {
    broadcast({ type: 'USER_COUNT', payload: wss.clients.size });
  });
});

app.post('/pubsub/push', (req, res) => {
  try {
    const message = req.body.message;
    if (!message) return res.status(400).send('No message');

    const data = JSON.parse(Buffer.from(message.data, 'base64').toString());
    console.log('Data received from Pub/Sub:', data);

    broadcast({ type: 'STATS_UPDATE', payload: data });

    res.status(200).send();
  } catch (err) {
    console.error('Error processing message:', err);
    res.status(500).send();
  }
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Gateway active on port ${PORT}`);
});