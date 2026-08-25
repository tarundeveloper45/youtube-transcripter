const {
  YoutubeTranscript,
  YoutubeTranscriptDisabledError,
} = require("youtube-transcript");

const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

function extractVideoId(input) {
  const trimmed = input.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed);
    if (url.hostname === "youtu.be") return url.pathname.slice(1);
    if (url.hostname.includes("youtube.com")) {
      if (url.pathname === "/watch") return url.searchParams.get("v");
      const m = url.pathname.match(/\/(shorts|embed|live)\/([A-Za-z0-9_-]{11})/);
      if (m) return m[2];
    }
  } catch {
    // not a valid URL
  }
  return null;
}

function formatTimestampSrt(ms) {
  const totalMs = Math.round(ms);
  const h = Math.floor(totalMs / 3600000);
  const m = Math.floor((totalMs % 3600000) / 60000);
  const s = Math.floor((totalMs % 60000) / 1000);
  const msRem = totalMs % 1000;
  const pad = (n, len = 2) => String(n).padStart(len, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(msRem, 3)}`;
}

function toText(cues) {
  return cues.map((c) => c.text).join("\n");
}

function toSrt(cues) {
  return cues
    .map((c, i) => {
      const start = formatTimestampSrt(c.offset);
      const end = formatTimestampSrt(c.offset + c.duration);
      return `${i + 1}\n${start} --> ${end}\n${c.text}\n`;
    })
    .join("\n");
}

// The npm package calls fetch three times per lookup: the InnerTube player
// endpoint, the watch page (HTML scrape fallback), and the caption track
// itself. We only need to adjust the watch-page request — adding an explicit
// locale and fuller browser headers noticeably improves whether YouTube
// includes captionTracks in the response on IPs it treats with suspicion
// (cloud/datacenter ranges, which is exactly what a Vercel function runs on).
function localeAwareFetch(url, options = {}) {
  const target = new URL(url);
  const headers = { ...(options.headers || {}) };

  if (target.hostname === "www.youtube.com" && target.pathname === "/watch") {
    if (!target.searchParams.has("hl")) target.searchParams.set("hl", "en");
    if (!target.searchParams.has("gl")) target.searchParams.set("gl", "US");
    headers["Accept-Language"] = "en-US,en;q=0.9";
    headers["User-Agent"] = BROWSER_USER_AGENT;
  }

  return fetch(target.toString(), { ...options, headers });
}

async function fetchWithRetry(videoId, lang) {
  const config = { fetch: localeAwareFetch, ...(lang ? { lang } : {}) };
  try {
    return await YoutubeTranscript.fetchTranscript(videoId, config);
  } catch (e) {
    // A single transient miss (YouTube occasionally omits captionTracks on
    // the first hit from a given IP) is worth one retry before giving up.
    if (e instanceof YoutubeTranscriptDisabledError) {
      return await YoutubeTranscript.fetchTranscript(videoId, config);
    }
    throw e;
  }
}

async function getTranscript({ video, lang, format }) {
  if (!video || typeof video !== "string") {
    const err = new Error("Missing 'video' (URL or ID).");
    err.status = 400;
    throw err;
  }

  const videoId = extractVideoId(video);
  if (!videoId) {
    const err = new Error(`Could not extract a video ID from: ${video}`);
    err.status = 400;
    throw err;
  }

  let cues;
  try {
    cues = await fetchWithRetry(videoId, lang);
  } catch (e) {
    let message = e.message || "Failed to fetch transcript.";
    if (e instanceof YoutubeTranscriptDisabledError) {
      message =
        `YouTube returned no captions for ${videoId} even after retrying. If this video ` +
        `plays captions normally in a browser, YouTube is likely giving this server's IP a ` +
        `restricted response (common for cloud-hosted deployments) rather than the captions ` +
        `actually being disabled.`;
    }
    const err = new Error(message);
    err.status = 502;
    throw err;
  }

  if (!cues || cues.length === 0) {
    const err = new Error("Transcript was empty.");
    err.status = 404;
    throw err;
  }

  const usedLang = cues[0].lang || lang || "unknown";

  if (format === "srt") {
    return { videoId, lang: usedLang, format: "srt", content: toSrt(cues) };
  }
  if (format === "json") {
    return { videoId, lang: usedLang, format: "json", cues };
  }
  return { videoId, lang: usedLang, format: "text", content: toText(cues) };
}

module.exports = { extractVideoId, toText, toSrt, getTranscript };
