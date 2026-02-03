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

  useEffect(() => {
    loadIncidents();
    const timer = setInterval(loadIncidents, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

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
    if (!query.trim()) return data.providers || [];
    const needle = query.toLowerCase();
    return (data.providers || [])
      .map((provider) => ({
        ...provider,
        incidents: provider.incidents.filter((incident) => {
          const haystack = `${incident.title || ""} ${incident.summary || ""}`.toLowerCase();
          return haystack.includes(needle);
        })
      }))
      .filter((provider) => provider.incidents.length > 0);
  }, [data.providers, query]);

  return (
    <div className="app">
      <header className="header">
        <div>
          <p className="eyebrow">Cloud service status</p>
          <h1>Watch Sys</h1>
          <p className="subtext">
            Near real-time incidents from Azure feeds. AWS, GCP, and social
            sources can be enabled later.
          </p>
        </div>
        <div className="header-actions">
          <button className="button" onClick={loadIncidents}>
            Refresh
          </button>
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
        <span className="pill">Polling every 1 minute</span>
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
                    <span className={`status status-${incident.status}`}>
                      {incident.status}
                    </span>
                    <span className="source">{incident.source}</span>
                  </div>
                  <h3>{incident.title}</h3>
                  <p className="summary">{incident.summary || "No summary."}</p>
                  <div className="card-footer">
                    <span className="time">
                      {formatDate(incident.publishedAt)}
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
