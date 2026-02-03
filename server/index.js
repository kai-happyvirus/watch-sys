import express from "express";
import cors from "cors";
import Parser from "rss-parser";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const PORT = process.env.PORT || 5174;
const CACHE_TTL_MS = 5 * 60 * 1000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDistPath = path.resolve(__dirname, "..", "dist");

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
  }
];

let cache = {
  updatedAt: 0,
  providers: [],
  errors: []
};

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

function mapItem(item, feed) {
  const summary = item.contentSnippet || item.content || "";
  const status = normalizeStatus(item.title, summary);

  return {
    id: item.guid || item.link || `${feed.id}-${item.pubDate || item.isoDate || item.title}`,
    provider: feed.provider,
    source: feed.name,
    title: item.title || "Untitled incident",
    summary,
    status,
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
        const aTime = a.publishedAt ? Date.parse(a.publishedAt) : 0;
        const bTime = b.publishedAt ? Date.parse(b.publishedAt) : 0;
        return bTime - aTime;
      });

      return {
        provider,
        incidents: sorted
      };
    });

    cache = {
      updatedAt: Date.now(),
      providers,
      errors
    };

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
