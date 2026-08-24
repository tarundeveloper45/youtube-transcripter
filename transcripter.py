"""
youtube-transcripter
A small CLI wrapper around the `youtube-transcript-api` library for fetching
transcripts/captions of public YouTube videos, with text/SRT/JSON export.

Why a wrapper instead of raw scraping: YouTube's caption endpoint now
requires a session-bound signature that a plain HTTP request can't obtain,
so we lean on `youtube-transcript-api`, which keeps up with YouTube's
internal API changes, and just add the CLI/formatting layer on top.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.parse

from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import (
    NoTranscriptFound,
    TranscriptsDisabled,
    VideoUnavailable,
)


class TranscriptError(Exception):
    pass


def extract_video_id(url_or_id: str) -> str:
    """Accept a full YouTube URL, a shortened youtu.be URL, or a bare 11-char ID."""
    if re.fullmatch(r"[A-Za-z0-9_-]{11}", url_or_id):
        return url_or_id

    parsed = urllib.parse.urlparse(url_or_id)
    if parsed.hostname in ("youtu.be",):
        return parsed.path.lstrip("/")

    if parsed.hostname and "youtube.com" in parsed.hostname:
        if parsed.path == "/watch":
            qs = urllib.parse.parse_qs(parsed.query)
            if "v" in qs:
                return qs["v"][0]
        m = re.match(r"/(shorts|embed|live)/([A-Za-z0-9_-]{11})", parsed.path)
        if m:
            return m.group(2)

    raise TranscriptError(f"Could not extract a video ID from: {url_or_id!r}")


def _fetch_raw(video_id: str, lang: str | None):
    """Return a list of {'start', 'duration', 'text'} dicts, newest and oldest
    versions of youtube-transcript-api supported."""
    languages = [lang] if lang else None

    # v1.0+ API: instance-based, returns a FetchedTranscript object.
    if hasattr(YouTubeTranscriptApi, "fetch") and not hasattr(YouTubeTranscriptApi, "get_transcript"):
        api = YouTubeTranscriptApi()
        transcript_list = api.list(video_id)
        transcript = (
            transcript_list.find_transcript(languages)
            if languages
            else _pick_default(transcript_list)
        )
        fetched = transcript.fetch()
        return [
            {"start": s.start, "duration": s.duration, "text": s.text} for s in fetched
        ], transcript.language_code

    # Pre-1.0 API: static method.
    transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
    transcript = (
        transcript_list.find_transcript(languages)
        if languages
        else _pick_default(transcript_list)
    )
    data = transcript.fetch()
    return data, transcript.language_code


def _pick_default(transcript_list):
    """Prefer a manually created English transcript, then any English, then
    whatever comes first."""
    try:
        return transcript_list.find_manually_created_transcript(["en"])
    except Exception:
        pass
    try:
        return transcript_list.find_transcript(["en"])
    except Exception:
        pass
    return next(iter(transcript_list))


def list_available_languages(video_id: str) -> list[dict]:
    try:
        transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
    except AttributeError:
        transcript_list = YouTubeTranscriptApi().list(video_id)
    except (TranscriptsDisabled, VideoUnavailable) as exc:
        raise TranscriptError(str(exc)) from exc

    return [
        {
            "code": t.language_code,
            "name": t.language,
            "auto_generated": t.is_generated,
        }
        for t in transcript_list
    ]


def fetch_transcript(video_id_or_url: str, lang: str | None = None):
    video_id = extract_video_id(video_id_or_url)
    try:
        cues, used_lang = _fetch_raw(video_id, lang)
    except (TranscriptsDisabled, VideoUnavailable) as exc:
        raise TranscriptError(str(exc)) from exc
    except NoTranscriptFound as exc:
        raise TranscriptError(f"No transcript found for language {lang!r}: {exc}") from exc

    if not cues:
        raise TranscriptError("Fetched the transcript but it was empty.")
    return cues, used_lang


def _format_timestamp_srt(seconds: float) -> str:
    ms = int(round(seconds * 1000))
    h, ms = divmod(ms, 3600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def cues_to_text(cues) -> str:
    return "\n".join(c["text"] for c in cues)


def cues_to_srt(cues) -> str:
    lines = []
    for i, c in enumerate(cues, start=1):
        start = _format_timestamp_srt(c["start"])
        end = _format_timestamp_srt(c["start"] + c["duration"])
        lines.append(f"{i}\n{start} --> {end}\n{c['text']}\n")
    return "\n".join(lines)


def cues_to_json(cues) -> str:
    return json.dumps(list(cues), indent=2, ensure_ascii=False)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Fetch the transcript/captions of a public YouTube video."
    )
    parser.add_argument("video", help="YouTube URL or 11-character video ID")
    parser.add_argument(
        "-l", "--lang", help="Caption language code to fetch (e.g. en, hi, es)"
    )
    parser.add_argument(
        "-f",
        "--format",
        choices=["text", "srt", "json"],
        default="text",
        help="Output format (default: text)",
    )
    parser.add_argument("-o", "--output", help="Write output to this file instead of stdout")
    parser.add_argument(
        "--list-languages",
        action="store_true",
        help="List available caption languages for the video and exit",
    )
    args = parser.parse_args()

    try:
        if args.list_languages:
            video_id = extract_video_id(args.video)
            for lang in list_available_languages(video_id):
                kind = "auto-generated" if lang["auto_generated"] else "manual"
                print(f"{lang['code']}\t{lang['name']}\t({kind})")
            return

        cues, used_lang = fetch_transcript(args.video, lang=args.lang)
        if args.format == "text":
            output = cues_to_text(cues)
        elif args.format == "srt":
            output = cues_to_srt(cues)
        else:
            output = cues_to_json(cues)

        if args.output:
            with open(args.output, "w", encoding="utf-8") as f:
                f.write(output)
            print(f"Wrote {len(cues)} cues ({used_lang}) to {args.output}")
        else:
            print(output)

    except TranscriptError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
