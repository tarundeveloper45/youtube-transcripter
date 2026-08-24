const { getTranscript } = require("../lib/transcript");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const result = await getTranscript(req.body || {});
    res.status(200).json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
};
