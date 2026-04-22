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
      const startTime = performance.now();
      
      const res = await fetch(API_URL);
      const data = await res.json();
      
      const endTime = performance.now();
      
      setApiDelay(Math.round(endTime - startTime));
      setTopMovies(data);
    } catch (err) {
      console.error("Failed to fetch analytics:", err);
    }
  };

  useEffect(() => {
    fetchTopMovies();

    const pollingInterval = setInterval(fetchTopMovies, 5000);

    const socket = new WebSocket(WS_URL);

    socket.onopen = () => {
      setWsStatus("Connected Live");
      console.log("WebSocket connected to Gateway");
    };

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === 'USER_COUNT') {
        setUserCount(data.payload);
      } else if (data.type === 'REALTIME_EVENT') {
        const eventWithTime = {
          ...data.payload,
          receivedAt: new Date().toLocaleTimeString()
        };
        setLiveEvents((prevEvents) => {
          const incomingMessageId = data.payload.messageId;
          const isDuplicate = prevEvents.some(ev => ev.messageId === incomingMessageId);
          
          if (isDuplicate) {
            console.log("ZOMBIE BLOCAT: Am ignorat un duplicat pe frontend:", incomingMessageId);
            return prevEvents;
          }

          const eventWithTime = {
            ...data.payload,
            receivedAt: new Date().toLocaleTimeString()
          };

          return [eventWithTime, ...prevEvents].slice(0, 10);
        });
      }
    };

    socket.onclose = () => setWsStatus("Disconnected");
    socket.onerror = () => setWsStatus("Error connecting");

    return () => {
      clearInterval(pollingInterval);
      socket.close();
    };
  }, []);

  return (
    <div className="dashboard-container">
      <header className="header">
        <h1>Cloud Analytics Dashboard</h1>
        <div className="status-indicators">
          <span className={`status-badge ${wsStatus === 'Connected Live' ? 'online' : 'offline'}`}>
            {wsStatus}
          </span>
          <span className="user-count">Viewers: {userCount}</span>
          <span className="latency-badge" style={{ color: apiDelay > 200 ? '#d93025' : 'var(--success-green)' }}>
            Delay: {apiDelay} ms
          </span>
        </div>
      </header>

      <main className="grid-layout">
        <section className="card">
          <h2>Top Viewed Movies</h2>
          {topMovies.length === 0 ? (
            <p className="empty-state">No analytics data yet...</p>
          ) : (
            <ul className="ranking-list">
              {topMovies.map((item, index) => (
                <li key={index} className="ranking-item">
                  <span className="rank">#{index + 1}</span>
                  <span className="resource-id">{item.movieTitle || item.movieId}</span>
                  <span className="views-badge">{item.viewCount} {item.viewCount === 1 ? 'view' : 'views'}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h2>Live Activity Feed</h2>
          {liveEvents.length === 0 ? (
            <p className="empty-state">Waiting for users to click...</p>
          ) : (
            <ul className="event-list">
              {liveEvents.map((ev, index) => {
                const movieDetails = ev.data || {};
                
                return (
                  <li key={index} className="event-item">
                    <span className="time">{ev.receivedAt}</span>
                    <span className="action">
                      Someone viewed <strong>{movieDetails.movieTitle || movieDetails.movieId || 'a movie'}</strong>
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