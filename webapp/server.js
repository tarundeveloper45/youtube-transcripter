const express = require("express");
const path = require("path");
const { getTranscript } = require("./lib/transcript");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.post("/api/transcript", async (req, res) => {
  try {
    const result = await getTranscript(req.body || {});
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`youtube-transcripter web app running at http://localhost:${PORT}`);
});
