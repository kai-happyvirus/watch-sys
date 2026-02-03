import { useEffect, useMemo, useState } from "react";
import "./App.css";

const POLL_INTERVAL_MS = 60 * 1000;

function formatDate(value) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString();
}

function App() {
  const [data, setData] = useState({ providers: [], errors: [], updatedAt: 0 });
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [emailStatus, setEmailStatus] = useState({ state: "idle", message: "" });
  const [severityFilter, setSeverityFilter] = useState("all");
  const [timeFilter, setTimeFilter] = useState("all");
  const [viewMode, setViewMode] = useState("live");
  const [historyData, setHistoryData] = useState([]);
  const [historyDays, setHistoryDays] = useState(7);
  const [theme, setTheme] = useState(localStorage.getItem("theme") || "dark");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  const loadIncidents = async () => {
    try {
      const response = await fetch("/api/incidents");
      const payload = await response.json();
      setData(payload);
    } catch (error) {
      setData((prev) => ({
        ...prev,
        errors: [
          {
            message: error?.message || "Failed to load incidents"
          }
        ]
      }));
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ days: historyDays, limit: 200 });
      if (severityFilter !== "all") params.append("severity", severityFilter);
      
      const response = await fetch(`/api/incidents/history?${params}`);
      const payload = await response.json();
      setHistoryData(payload.incidents || []);
    } catch {
      setHistoryData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (viewMode === "live") {
      loadIncidents();
      const timer = setInterval(loadIncidents, POLL_INTERVAL_MS);
      return () => clearInterval(timer);
    } else {
      loadHistory();
    }
  }, [viewMode, historyDays, severityFilter]);

  const submitEmail = async (method) => {
    setEmailStatus({ state: "loading", message: "" });
    try {
      const response = await fetch("/api/subscriptions/email", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.message || "Request failed");
      }

      setEmailStatus({
        state: "success",
        message: method === "POST" ? "Subscribed!" : "Unsubscribed."
      });
    } catch (error) {
      setEmailStatus({ state: "error", message: error?.message || "Failed" });
    }
  };

  const filteredProviders = useMemo(() => {
    if (viewMode === "history") {
      let filtered = historyData;
      
      const needle = query.toLowerCase();
      if (needle) {
        filtered = filtered.filter((incident) => {
          const haystack = `${incident.title || ""} ${incident.summary || ""}`.toLowerCase();
          return haystack.includes(needle);
        });
      }

      // Group by provider
      const grouped = filtered.reduce((acc, incident) => {
        if (!acc[incident.provider]) {
          acc[incident.provider] = [];
        }
        acc[incident.provider].push(incident);
        return acc;
      }, {});

      return Object.entries(grouped).map(([provider, incidents]) => ({
        provider,
        incidents: incidents.sort((a, b) => {
          const aTime = a.published_at ? Date.parse(a.published_at) : 0;
          const bTime = b.published_at ? Date.parse(b.published_at) : 0;
          return bTime - aTime;
        })
      }));
    }

    // Live mode filtering
    if (!data.providers) return [];
    
    const needle = query.toLowerCase();
    const now = Date.now();
    const timeFilters = {
      "1h": 60 * 60 * 1000,
      "24h": 24 * 60 * 60 * 1000,
      "7d": 7 * 24 * 60 * 60 * 1000
    };

    return data.providers
      .map((provider) => ({
        ...provider,
        incidents: provider.incidents.filter((incident) => {
          // Text search
          if (needle) {
            const haystack = `${incident.title || ""} ${incident.summary || ""}`.toLowerCase();
            if (!haystack.includes(needle)) return false;
          }

          // Severity filter
          if (severityFilter !== "all" && incident.severity !== severityFilter) {
            return false;
          }

          // Time filter
          if (timeFilter !== "all" && incident.publishedAt) {
            const incidentTime = Date.parse(incident.publishedAt);
            const cutoff = now - timeFilters[timeFilter];
            if (incidentTime < cutoff) return false;
          }

          return true;
        })
      }))
      .filter((provider) => provider.incidents.length > 0);
  }, [data.providers, query, severityFilter, timeFilter, viewMode, historyData]);

  return (
    <div className="app">
      <header className="header">
        <div>
          <p className="eyebrow">Cloud service status</p>
          <h1>Watch Sys</h1>
          <p className="subtext">
            Near real-time incidents from Azure, AWS, and GCP. Social sources can be added with API keys.
          </p>
        </div>
        <div className="header-actions">
          <div className="view-mode">
            <button 
              className={`button ${viewMode === "live" ? "" : "secondary"}`}
              onClick={() => setViewMode("live")}
            >
              Live Feed
            </button>
            <button 
              className={`button ${viewMode === "history" ? "" : "secondary"}`}
              onClick={() => setViewMode("history")}
            >
              History
            </button>
            <button 
              className="button icon" 
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            >
              {theme === "dark" ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5"/>
                  <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                </svg>
              )}
            </button>
          </div>
          <div className="updated">
            Last updated: {formatDate(data.updatedAt)}
          </div>
        </div>
      </header>

      <section className="controls">
        <input
          type="search"
          placeholder="Search incidents"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="filters">
          <select
            value={severityFilter}
            onChange={(event) => setSeverityFilter(event.target.value)}
          >
            <option value="all">All severities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          {viewMode === "live" ? (
            <select
              value={timeFilter}
              onChange={(event) => setTimeFilter(event.target.value)}
            >
              <option value="all">All time</option>
              <option value="1h">Last hour</option>
              <option value="24h">Last 24 hours</option>
              <option value="7d">Last 7 days</option>
            </select>
          ) : (
            <select
              value={historyDays}
              onChange={(event) => setHistoryDays(Number(event.target.value))}
            >
              <option value={1}>Last 1 day</option>
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="pill">Polling every 1 minute</span>
          <button className="button icon" onClick={viewMode === "live" ? loadIncidents : loadHistory} title="Refresh">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
            </svg>
          </button>
        </div>
      </section>

      <section className="email-subscribe">
        <div>
          <h2>Email alerts</h2>
          <p>Subscribe to receive incident updates by email.</p>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submitEmail("POST");
          }}
        >
          <input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <div className="email-actions">
            <button className="button" type="submit" disabled={emailStatus.state === "loading"}>
              Subscribe
            </button>
            <button
              className="button secondary"
              type="button"
              onClick={() => submitEmail("DELETE")}
              disabled={emailStatus.state === "loading"}
            >
              Unsubscribe
            </button>
          </div>
          {emailStatus.state !== "idle" ? (
            <span className={`email-status ${emailStatus.state}`}>
              {emailStatus.message}
            </span>
          ) : null}
        </form>
      </section>

      {loading ? <div className="loading">Loading incidents...</div> : null}

      {data.errors?.length ? (
        <section className="errors">
          <h2>Feed errors</h2>
          <ul>
            {data.errors.map((error, index) => (
              <li key={`${error.message}-${index}`}>
                {error.source ? `${error.source}: ` : ""}
                {error.message}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <main className="providers">
        {filteredProviders.length === 0 && !loading ? (
          <div className="empty">No incidents match your search.</div>
        ) : null}

        {filteredProviders.map((provider) => (
          <section className="provider" key={provider.provider}>
            <h2>{provider.provider}</h2>
            <div className="cards">
              {provider.incidents.map((incident) => (
                <article className="card" key={incident.id}>
                  <div className="card-header">
                    <div className="badges">
                      <span className={`status status-${incident.status}`}>
                        {incident.status}
                      </span>
                      <span className={`severity severity-${incident.severity}`}>
                        {incident.severity}
                      </span>
                    </div>
                    <span className="source">{incident.source}</span>
                  </div>
                  <h3>{incident.title}</h3>
                  <p className="summary">{incident.summary || "No summary."}</p>
                  <div className="card-footer">
                    <span className="time">
                      {formatDate(viewMode === "history" ? incident.published_at : incident.publishedAt)}
                    </span>
                    {incident.link ? (
                      <a href={incident.link} target="_blank" rel="noreferrer">
                        View details
                      </a>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}

export default App;
