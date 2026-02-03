import express from "express";
import cors from "cors";
import Parser from "rss-parser";
import nodemailer from "nodemailer";
import path from "path";
import { fileURLToPath } from "url";
import { readFile, writeFile } from "fs/promises";

const app = express();
const PORT = process.env.PORT || 5174;
const CACHE_TTL_MS = 5 * 60 * 1000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDistPath = path.resolve(__dirname, "..", "dist");
const ENABLE_NOTIFICATIONS = process.env.ENABLE_NOTIFICATIONS === "true";
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || "";
const TEAMS_WEBHOOK_URL = process.env.TEAMS_WEBHOOK_URL || "";
const ENABLE_EMAIL_NOTIFICATIONS = process.env.ENABLE_EMAIL_NOTIFICATIONS === "true";
const EMAIL_SMTP_USER = process.env.EMAIL_SMTP_USER || "";
const EMAIL_SMTP_PASS = process.env.EMAIL_SMTP_PASS || "";
const EMAIL_FROM = process.env.EMAIL_FROM || EMAIL_SMTP_USER;
const SUBSCRIBERS_FILE = path.resolve(__dirname, "subscribers.json");

const parser = new Parser({
  timeout: 15000,
  headers: {
    "User-Agent": "watch-sys-status-bot/1.0"
  }
});

const FEEDS = [
  {
    id: "azure-status",
    provider: "Azure",
    name: "Azure Status",
    url: "https://rssfeed.azure.status.microsoft/en-gb/status/feed/"
  },
  {
    id: "azure-devops",
    provider: "Azure",
    name: "Azure DevOps Status",
    url: "https://status.dev.azure.com/_rss"
  },
  {
    id: "aws-status",
    provider: "AWS",
    name: "AWS Service Health Dashboard",
    url: "https://status.aws.amazon.com/rss/all.rss"
  }
];

let cache = {
  updatedAt: 0,
  providers: [],
  errors: []
};

const sentIncidentIds = new Set();
const MAX_SENT_IDS = 500;
const subscriberEmails = new Set();
const emailTransporter =
  ENABLE_EMAIL_NOTIFICATIONS && EMAIL_SMTP_USER && EMAIL_SMTP_PASS
    ? nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: EMAIL_SMTP_USER,
          pass: EMAIL_SMTP_PASS
        }
      })
    : null;

let refreshInFlight = null;

function normalizeStatus(title = "", content = "") {
  const text = `${title} ${content}`.toLowerCase();
  if (text.includes("resolved") || text.includes("mitigated")) return "resolved";
  if (text.includes("investigating")) return "investigating";
  if (text.includes("maintenance")) return "maintenance";
  if (text.includes("degrad") || text.includes("degradation")) return "degraded";
  if (text.includes("outage") || text.includes("incident")) return "incident";
  return "info";
}

function detectSeverity(title = "", content = "") {
  const text = `${title} ${content}`.toLowerCase();
  
  // Critical: outage, severe failures, complete unavailability
  if (text.includes("outage") || text.includes("unavailable") || text.includes("complete failure")) {
    return "critical";
  }
  
  // High: failures affecting multiple regions/services, operation failures
  if (
    text.includes("failure") ||
    text.includes("unable") ||
    text.includes("major") ||
    text.includes("multiple regions") ||
    text.includes("dependent service") ||
    (text.includes("region") && text.includes("impacted")) ||
    text.match(/\b(east|west|north|south|central).*and.*(east|west|north|south|central)\b/)
  ) {
    return "high";
  }
  
  // Medium: degraded performance, intermittent issues
  if (
    text.includes("degraded") ||
    text.includes("intermittent") ||
    text.includes("delays") ||
    text.includes("elevated latency")
  ) {
    return "medium";
  }
  
  // Low: informational, resolved, maintenance
  return "low";
}

function getSeverityPriority(severity) {
  const priorities = { critical: 0, high: 1, medium: 2, low: 3 };
  return priorities[severity] ?? 999;
}

function mapItem(item, feed) {
  const summary = item.contentSnippet || item.content || "";
  const status = normalizeStatus(item.title, summary);
  const severity = detectSeverity(item.title, summary);

  return {
    id: item.guid || item.link || `${feed.id}-${item.pubDate || item.isoDate || item.title}`,
    provider: feed.provider,
    source: feed.name,
    title: item.title || "Untitled incident",
    summary,
    status,
    severity,
    link: item.link,
    publishedAt: item.isoDate || item.pubDate || null
  };
}

async function refreshCache() {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const results = await Promise.allSettled(
      FEEDS.map(async (feed) => {
        const parsed = await parser.parseURL(feed.url);
        const items = (parsed.items || []).map((item) => mapItem(item, feed));
        return { feed, items };
      })
    );

    const providerMap = new Map();
    const errors = [];

    results.forEach((result, index) => {
      const feed = FEEDS[index];
      if (result.status === "fulfilled") {
        const { items } = result.value;
        if (!providerMap.has(feed.provider)) {
          providerMap.set(feed.provider, []);
        }
        providerMap.get(feed.provider).push(...items);
      } else {
        errors.push({
          provider: feed.provider,
          source: feed.name,
          message: result.reason?.message || "Failed to load feed"
        });
      }
    });

    const providers = Array.from(providerMap.entries()).map(([provider, items]) => {
      const sorted = items.sort((a, b) => {
        const aSeverity = getSeverityPriority(a.severity);
        const bSeverity = getSeverityPriority(b.severity);
        if (aSeverity !== bSeverity) return aSeverity - bSeverity;
        
        const aTime = a.publishedAt ? Date.parse(a.publishedAt) : 0;
        const bTime = b.publishedAt ? Date.parse(b.publishedAt) : 0;
        return bTime - aTime;
      });

      return {
        provider,
        incidents: sorted
      };
    });

    const nextCache = {
      updatedAt: Date.now(),
      providers,
      errors
    };

    if (ENABLE_NOTIFICATIONS) {
      await notifyOnNewIncidents(cache, nextCache);
    }

    if (ENABLE_EMAIL_NOTIFICATIONS) {
      await notifyOnNewIncidentsByEmail(cache, nextCache);
    }

    cache = nextCache;

    refreshInFlight = null;
    return cache;
  })();

  return refreshInFlight;
}

async function getCache() {
  const isStale = Date.now() - cache.updatedAt > CACHE_TTL_MS;
  if (isStale) {
    await refreshCache();
  }
  return cache;
}

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", updatedAt: cache.updatedAt });
});

app.get("/api/incidents", async (_req, res) => {
  try {
    const data = await getCache();
    res.json(data);
  } catch (error) {
    res.status(500).json({
      updatedAt: cache.updatedAt,
      providers: cache.providers,
      errors: [
        {
          message: error?.message || "Unexpected server error"
        }
      ]
    });
  }
});

app.get("/api/subscriptions/email", (_req, res) => {
  res.json({ count: subscriberEmails.size });
});

app.post("/api/subscriptions/email", async (req, res) => {
  const email = (req.body?.email || "").toLowerCase().trim();
  if (!isValidEmail(email)) {
    res.status(400).json({ message: "Invalid email address" });
    return;
  }

  subscriberEmails.add(email);
  await persistSubscribers();
  res.status(201).json({ email, subscribed: true });
});

app.delete("/api/subscriptions/email", async (req, res) => {
  const email = (req.body?.email || "").toLowerCase().trim();
  if (!isValidEmail(email)) {
    res.status(400).json({ message: "Invalid email address" });
    return;
  }

  subscriberEmails.delete(email);
  await persistSubscribers();
  res.json({ email, subscribed: false });
});

if (process.env.NODE_ENV === "production") {
  app.use(express.static(clientDistPath));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(clientDistPath, "index.html"));
  });
}

refreshCache().catch(() => null);
setInterval(() => {
  refreshCache().catch(() => null);
}, CACHE_TTL_MS);

app.listen(PORT, () => {
  console.log(`Status proxy running on port ${PORT}`);
});

function flattenIncidents(snapshot) {
  return (snapshot.providers || []).flatMap((provider) => provider.incidents || []);
}

function rememberIncident(id) {
  if (!id) return;
  sentIncidentIds.add(id);
  if (sentIncidentIds.size > MAX_SENT_IDS) {
    const [first] = sentIncidentIds;
    sentIncidentIds.delete(first);
  }
}

function buildIncidentLines(incidents) {
  return incidents
    .map(
      (incident) =>
        `• ${incident.provider}: ${incident.title} (${incident.status}) ${incident.link || ""}`
    )
    .join("\n");
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function loadSubscribers() {
  try {
    const raw = await readFile(SUBSCRIBERS_FILE, "utf8");
    const list = JSON.parse(raw);
    if (Array.isArray(list)) {
      list.filter(isValidEmail).forEach((email) => subscriberEmails.add(email));
    }
  } catch (error) {
    if (error?.code !== "ENOENT") {
      console.warn("Failed to load subscribers", error);
    }
  }
}

async function persistSubscribers() {
  const list = Array.from(subscriberEmails);
  await writeFile(SUBSCRIBERS_FILE, JSON.stringify(list, null, 2));
}

async function notifyOnNewIncidents(prevCache, nextCache) {
  const previousIds = new Set(flattenIncidents(prevCache).map((item) => item.id));
  const nextIncidents = flattenIncidents(nextCache);

  const newIncidents = nextIncidents.filter(
    (item) => item.id && !previousIds.has(item.id) && !sentIncidentIds.has(item.id)
  );

  if (newIncidents.length === 0) return;

  newIncidents.forEach((incident) => rememberIncident(incident.id));

  const batch = newIncidents.slice(0, 5);
  const summary = buildIncidentLines(batch);

  const tasks = [];
  if (DISCORD_WEBHOOK_URL) {
    tasks.push(
      fetch(DISCORD_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: `New incident updates:\n${summary}`
        })
      })
    );
  }

  if (TEAMS_WEBHOOK_URL) {
    tasks.push(
      fetch(TEAMS_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `New incident updates:\n${summary}`
        })
      })
    );
  }

  if (tasks.length) {
    await Promise.allSettled(tasks);
  }
}

async function notifyOnNewIncidentsByEmail(prevCache, nextCache) {
  if (!emailTransporter || subscriberEmails.size === 0) return;

  const previousIds = new Set(flattenIncidents(prevCache).map((item) => item.id));
  const nextIncidents = flattenIncidents(nextCache);
  const newIncidents = nextIncidents.filter(
    (item) => item.id && !previousIds.has(item.id) && !sentIncidentIds.has(item.id)
  );

  if (newIncidents.length === 0) return;

  const summary = buildIncidentLines(newIncidents.slice(0, 8));
  await emailTransporter.sendMail({
    from: EMAIL_FROM,
    to: EMAIL_FROM,
    bcc: Array.from(subscriberEmails),
    subject: "New cloud incident updates",
    text: `New incident updates:\n${summary}`
  });
}

loadSubscribers().catch(() => null);
