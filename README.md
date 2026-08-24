# youtube-transcripter

A small Python CLI that fetches the transcript/captions of any public
YouTube video — no API key required. Given a URL you get the transcript as
plain text, SRT subtitles, or timestamped JSON.

## Setup

```bash
pip install -r requirements.txt
```

## Usage

```bash
# Print the transcript as plain text
python transcripter.py https://www.youtube.com/watch?v=dQw4w9WgXcQ

# Works with a bare video ID too
python transcripter.py dQw4w9WgXcQ

# See what languages are available
python transcripter.py dQw4w9WgXcQ --list-languages

# Fetch a specific language
python transcripter.py dQw4w9WgXcQ --lang hi

# Export as SRT subtitles or JSON with timestamps
python transcripter.py dQw4w9WgXcQ --format srt -o out.srt
python transcripter.py dQw4w9WgXcQ --format json -o out.json
```

## How it works

YouTube used to serve captions from a plain, unauthenticated endpoint that
you could scrape directly from the watch page's embedded JSON. That no
longer works reliably — YouTube now requires a session-bound token to read
captions, so a bare `urllib` request gets silently rejected (200 OK, empty
body). This tool builds on
[`youtube-transcript-api`](https://github.com/jdepoix/youtube-transcript-api),
which stays current with those internal changes, and adds the CLI, language
picking, and text/SRT/JSON export on top.

## Notes / limitations

- Only works for videos that have captions (manual or auto-generated)
  enabled and public.
- Age-restricted, private, or region-blocked videos will fail — that's a
  YouTube-side restriction, not something this script can bypass.
- Some cloud/datacenter IPs get rate-limited or blocked by YouTube; if
  fetches fail consistently from a server, try from a residential
  connection or add a proxy (the underlying library supports one).

## License

MIT
