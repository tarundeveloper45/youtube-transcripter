const express = require("express");
const path = require("path");
const { YoutubeTranscript } = require("youtube-transcript");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

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

app.post("/api/transcript", async (req, res) => {
  const { video, lang, format } = req.body || {};
  if (!video || typeof video !== "string") {
    return res.status(400).json({ error: "Missing 'video' (URL or ID)." });
  }

  const videoId = extractVideoId(video);
  if (!videoId) {
    return res.status(400).json({ error: `Could not extract a video ID from: ${video}` });
  }

  try {
    const cues = await YoutubeTranscript.fetchTranscript(videoId, lang ? { lang } : undefined);
    if (!cues || cues.length === 0) {
      return res.status(404).json({ error: "Transcript was empty." });
    }

    const usedLang = cues[0].lang || lang || "unknown";

    if (format === "srt") {
      return res.json({ videoId, lang: usedLang, format: "srt", content: toSrt(cues) });
    }
    if (format === "json") {
      return res.json({ videoId, lang: usedLang, format: "json", cues });
    }
    return res.json({ videoId, lang: usedLang, format: "text", content: toText(cues) });
  } catch (err) {
    return res.status(502).json({ error: err.message || "Failed to fetch transcript." });
  }
});

app.listen(PORT, () => {
  console.log(`youtube-transcripter web app running at http://localhost:${PORT}`);
});
