"""
================================================================================
VVNT INTELLIGENT TEST PLANNING AGENT - VIDEO TRANSCRIPT FETCHER (ISS-011 Fix)
================================================================================
Extracts requirement text from video files or YouTube URLs by transcribing
audio using OpenAI Whisper (local) with a Groq Whisper API fallback.

Supported resource_id formats:
  - Local video file path:   /uploads/requirements_walkthrough.mp4
  - YouTube URL:             https://www.youtube.com/watch?v=<id>
  - Audio file path:         /uploads/meeting_notes.mp3
"""

import os
import logging
import re
import tempfile
from .base_fetcher import BaseFetcher

logger = logging.getLogger(__name__)


def _check_dependencies() -> dict:
    """
    Check whether VideoTranscriptFetcher's required packages/credentials are available.

    Returns:
        {
            "available": bool,
            "missing": [...],
            "install_cmd": "pip install ...",
            "groq_available": bool,
            "whisper_available": bool,
        }
    """
    missing = []

    whisper_available = False
    try:
        import whisper  # noqa: F401
        whisper_available = True
    except ImportError:
        missing.append("openai-whisper")

    groq_available = bool(os.getenv("GROQ_API_KEY", "").strip())

    available = whisper_available or groq_available
    install_cmd = "pip install " + " ".join(missing) if missing else ""

    return {
        "available": available,
        "missing": missing,
        "install_cmd": install_cmd,
        "groq_available": groq_available,
        "whisper_available": whisper_available,
    }


class VideoTranscriptFetcher(BaseFetcher):
    """
    VIDEO TRANSCRIPT ADAPTER
    Extracts requirement text from video/audio files via speech-to-text.

    Strategy:
    1. PRIMARY: Groq Whisper API (whisper-large-v3) — fast, accurate, no local GPU needed
    2. FALLBACK: Local OpenAI Whisper (if groq unavailable)
    3. YOUTUBE: yt-dlp to extract audio, then transcribe
    4. LAST RESORT: Structured error payload so mesh can continue
    """

    SUPPORTED_EXTENSIONS = {".mp4", ".mp3", ".wav", ".m4a", ".ogg", ".webm", ".mov", ".avi"}

    def __init__(self, url=None, email=None, token=None, mock_path=None):
        self.token = token  # Groq API key
        self.mock_path = mock_path

    def fetch(self, resource_id: str) -> dict:
        """
        Transcribe a video/audio file or YouTube URL and extract requirements.

        Args:
            resource_id: Local file path or YouTube URL.

        Returns:
            Normalized requirement dict with transcript as description.
        """
        logger.info(f"[VIDEO-FETCHER] Processing video/audio source: {resource_id[:80]}...")

        # Dependency gate — fail fast with a clear message if nothing can work
        dep_check = _check_dependencies()
        if not dep_check["available"]:
            msg = (
                "No transcription method available. "
                "Either set GROQ_API_KEY for Groq Whisper API, "
                "or install: pip install openai-whisper"
            )
            logger.error(f"[VIDEO-FETCHER] {msg}")
            return self.normalize({
                "id": "VIDEO-DEPS-MISSING",
                "summary": "No transcription method available",
                "description": msg,
                "acceptance_criteria": [
                    "Set GROQ_API_KEY environment variable, or run: pip install openai-whisper"
                ],
                "platform": "mediaupload",
                "dep_check": dep_check,
            })

        transcript = ""
        source_label = resource_id

        # --- Route: YouTube URL ---
        if "youtube.com" in resource_id or "youtu.be" in resource_id:
            transcript, source_label = self._transcribe_youtube(resource_id)

        # --- Route: Local file ---
        elif os.path.exists(resource_id):
            ext = os.path.splitext(resource_id)[1].lower()
            if ext not in self.SUPPORTED_EXTENSIONS:
                return self.normalize({
                    "id": f"VIDEO-{os.path.basename(resource_id)[:30]}",
                    "summary": f"Unsupported video format: {ext}",
                    "description": (
                        f"[VIDEO-FETCHER] Unsupported file format '{ext}'. "
                        f"Supported formats: {', '.join(self.SUPPORTED_EXTENSIONS)}"
                    ),
                    "acceptance_criteria": [],
                    "platform": "mediaupload",
                })
            source_label = os.path.basename(resource_id)
            transcript = self._transcribe_file(resource_id)

        else:
            return self.normalize({
                "id": "VIDEO-NOT-FOUND",
                "summary": "Video source not found",
                "description": (
                    f"[VIDEO-FETCHER] Could not locate video source: '{resource_id}'. "
                    "Provide a valid local file path or YouTube URL."
                ),
                "acceptance_criteria": [],
                "platform": "mediaupload",
            })

        if not transcript:
            transcript = (
                f"[TRANSCRIPT-FAILED] Could not transcribe '{source_label}'. "
                "Ensure GROQ_API_KEY is set for Whisper API transcription, "
                "or install openai-whisper for local transcription."
            )

        summary, description, acceptance_criteria = self._parse_transcript(transcript, source_label)

        return self.normalize({
            "id": f"VIDEO-{source_label[:30]}",
            "summary": summary,
            "description": description,
            "acceptance_criteria": acceptance_criteria,
            "platform": "mediaupload",
            "transcript_length": len(transcript),
        })

    def _transcribe_file(self, file_path: str) -> str:
        """Transcribe a local audio/video file using Groq Whisper API or local Whisper."""
        # Strategy 1: Groq Whisper API
        transcript = self._groq_whisper_transcribe(file_path)
        if transcript:
            return transcript

        # Strategy 2: Local OpenAI Whisper
        return self._local_whisper_transcribe(file_path)

    def _groq_whisper_transcribe(self, file_path: str) -> str:
        """Transcribe using Groq's Whisper API endpoint."""
        try:
            import requests

            api_key = self.token or os.getenv("GROQ_API_KEY", "")
            if not api_key:
                logger.warning("[VIDEO-FETCHER] No Groq API key for Whisper transcription.")
                return ""

            file_size = os.path.getsize(file_path)
            # Groq Whisper limit: 25MB
            if file_size > 25 * 1024 * 1024:
                logger.warning(f"[VIDEO-FETCHER] File too large for Groq Whisper ({file_size/1024/1024:.1f}MB > 25MB). Trying local Whisper.")
                return ""

            with open(file_path, "rb") as f:
                resp = requests.post(
                    "https://api.groq.com/openai/v1/audio/transcriptions",
                    headers={"Authorization": f"Bearer {api_key}"},
                    files={"file": (os.path.basename(file_path), f)},
                    data={"model": "whisper-large-v3", "response_format": "text"},
                    timeout=120
                )
                resp.raise_for_status()
                transcript = resp.text.strip()
                logger.info(f"[VIDEO-FETCHER] Groq Whisper transcribed {len(transcript)} chars")
                return transcript

        except Exception as e:
            logger.warning(f"[VIDEO-FETCHER] Groq Whisper failed: {e}")
            return ""

    def _local_whisper_transcribe(self, file_path: str) -> str:
        """Transcribe using locally installed openai-whisper."""
        try:
            import whisper
            model = whisper.load_model("base")
            result = model.transcribe(file_path)
            transcript = result.get("text", "").strip()
            logger.info(f"[VIDEO-FETCHER] Local Whisper transcribed {len(transcript)} chars")
            return transcript
        except ImportError:
            logger.warning("[VIDEO-FETCHER] openai-whisper not installed. Run: pip install openai-whisper")
            return ""
        except Exception as e:
            logger.warning(f"[VIDEO-FETCHER] Local Whisper failed: {e}")
            return ""

    def _transcribe_youtube(self, url: str) -> tuple:
        """Download audio from YouTube and transcribe it."""
        source_label = url.split("v=")[-1][:20] if "v=" in url else "youtube"
        try:
            import yt_dlp

            with tempfile.TemporaryDirectory() as tmpdir:
                audio_path = os.path.join(tmpdir, "audio.mp3")
                ydl_opts = {
                    "format": "bestaudio/best",
                    "outtmpl": os.path.join(tmpdir, "audio.%(ext)s"),
                    "postprocessors": [{
                        "key": "FFmpegExtractAudio",
                        "preferredcodec": "mp3",
                        "preferredquality": "128",
                    }],
                    "quiet": True,
                    "no_warnings": True,
                }
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    info = ydl.extract_info(url, download=True)
                    source_label = info.get("title", source_label)[:60]

                # Find the downloaded audio file
                for f in os.listdir(tmpdir):
                    if f.startswith("audio"):
                        audio_path = os.path.join(tmpdir, f)
                        break

                transcript = self._transcribe_file(audio_path)
                return transcript, source_label

        except ImportError:
            logger.warning("[VIDEO-FETCHER] yt-dlp not installed. Run: pip install yt-dlp")
            return "", source_label
        except Exception as e:
            logger.warning(f"[VIDEO-FETCHER] YouTube extraction failed: {e}")
            return "", source_label

    def _parse_transcript(self, transcript: str, source_label: str) -> tuple:
        """
        Parse transcript into (summary, description, acceptance_criteria).
        Detects requirement-like patterns in spoken language.
        """
        # Clean up transcript
        text = re.sub(r"\s+", " ", transcript).strip()
        sentences = re.split(r"(?<=[.!?])\s+", text)

        summary = f"Requirements from: {source_label}"
        if sentences:
            summary = sentences[0][:120]

        # Detect requirement-like sentences
        req_patterns = re.compile(
            r"\b(should|must|shall|need to|has to|required to|will|can|cannot|"
            r"given|when|then|accept|verify|validate|ensure|confirm)\b",
            re.IGNORECASE
        )
        acceptance_criteria = [s.strip() for s in sentences if req_patterns.search(s) and len(s) > 20][:10]

        if not acceptance_criteria:
            acceptance_criteria = [f"Verify requirements as described in: {source_label}"]

        return summary, text, acceptance_criteria
