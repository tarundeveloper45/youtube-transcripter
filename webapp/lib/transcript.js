const { YoutubeTranscript } = require("youtube-transcript");

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
    cues = await YoutubeTranscript.fetchTranscript(videoId, lang ? { lang } : undefined);
  } catch (e) {
    const err = new Error(e.message || "Failed to fetch transcript.");
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
