import React, { useState, useEffect } from 'react';
import './App.css';

const isSecure = window.location.protocol === 'https:';
const wsProtocol = isSecure ? 'wss:' : 'ws:';
const host = window.location.host;

const API_URL = `/api/analytics/top-movies`;
const WS_URL = `${wsProtocol}//${host}`;

function App() {
  const [topMovies, setTopMovies] = useState([]);
  const [liveEvents, setLiveEvents] = useState([]);
  const [userCount, setUserCount] = useState(0);
  const [wsStatus, setWsStatus] = useState("Connecting...");
  const [apiDelay, setApiDelay] = useState(0);

  const fetchTopMovies = async () => {
    try {
      const t0 = performance.now();
      const res = await fetch(API_URL);
      const data = await res.json();
      setApiDelay(Math.round(performance.now() - t0));
      setTopMovies(data);
    } catch (err) {
      console.error("fetch failed:", err);
    }
  };

  useEffect(() => {
    fetchTopMovies();
    const pollingInterval = setInterval(fetchTopMovies, 5000);

    let socket;
    let reconnectTimeout;
    let reconnectDelay = 500;

    const connect = () => {
      socket = new WebSocket(WS_URL);

      socket.onopen = () => {
        setWsStatus("Connected Live");
        reconnectDelay = 500;
      };

      socket.onmessage = (event) => {
        const msg = JSON.parse(event.data);

        if (msg.type === 'USER_COUNT') {
          setUserCount(msg.payload);
        } else if (msg.type === 'REALTIME_EVENT') {
          setLiveEvents((prev) => {
            const id = msg.payload.messageId;
            if (prev.some(ev => ev.messageId === id)) return prev;
            const entry = { ...msg.payload, receivedAt: new Date().toLocaleTimeString() };
            return [entry, ...prev].slice(0, 10);
          });
        }
      };

      socket.onclose = () => {
        const label = reconnectDelay < 1000 ? `${reconnectDelay}ms` : `${reconnectDelay / 1000}s`;
        setWsStatus(`Disconnected — reconnecting in ${label}...`);
        reconnectTimeout = setTimeout(() => {
          reconnectDelay = Math.min(reconnectDelay * 2, 10000);
          connect();
        }, reconnectDelay);
      };

      socket.onerror = () => {
        setWsStatus("Error connecting");
        socket.close();
      };
    };

    connect();

    return () => {
      clearInterval(pollingInterval);
      clearTimeout(reconnectTimeout);
      if (socket) socket.close();
    };
  }, []);

  return (
    <div className="dashboard-container">
      <header className="header">
        <h1>Movie Analytics Dashboard</h1>
        <div className="status-indicators">
          <span className={`status-badge ${wsStatus === 'Connected Live' ? 'online' : 'offline'}`}>
            {wsStatus === 'Connected Live' ? 'Live' : wsStatus}
          </span>
          <span className="user-count">Viewers: {userCount}</span>
          <span className="latency-badge" style={{ color: apiDelay > 300 ? '#f56565' : '#3ecf8e' }}>
            Latency: {apiDelay} ms
          </span>
        </div>
      </header>

      <main className="grid-layout">
        <section className="card">
          <h2>Top Viewed</h2>
          {topMovies.length === 0 ? (
            <p className="empty-state">No data yet — go hit some movie endpoints!</p>
          ) : (
            <ul>
              {topMovies.map((item, index) => (
                <li key={item.id || index} className="ranking-item">
                  <span className="rank">#{index + 1}</span>
                  <span className="resource-id" title={item.movieTitle || item.movieId}>
                    {item.movieTitle || item.movieId}
                  </span>
                  <span className="views-badge">
                    {item.viewCount} {item.viewCount === 1 ? 'view' : 'views'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h2>Live Feed</h2>
          {liveEvents.length === 0 ? (
            <p className="empty-state">Waiting for events...</p>
          ) : (
            <ul>
              {liveEvents.map((ev, index) => {
                const details = ev.data || {};
                return (
                  <li key={ev.messageId || index} className="event-item">
                    <span className="time">{ev.receivedAt}</span>
                    <span className="action">
                      viewed <strong>{details.movieTitle || details.movieId || 'unknown'}</strong>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
