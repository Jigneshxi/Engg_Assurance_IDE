"""
================================================================================
VVNT INTELLIGENT TEST PLANNING AGENT - IMAGE OCR FETCHER (ISS-011 Fix)
================================================================================
Extracts requirement text from images (PNG, JPG, JPEG, BMP, TIFF) using
pytesseract (local OCR) with a Groq Vision API fallback for higher accuracy.

Supported resource_id formats:
  - Absolute or relative file path:  /uploads/req_screenshot.png
  - Base64 data URI:                  data:image/png;base64,<data>
"""

import os
import base64
import logging
import re
from .base_fetcher import BaseFetcher

logger = logging.getLogger(__name__)


def _check_dependencies() -> dict:
    """
    Check whether ImageOCRFetcher's required packages are available.

    Returns:
        {
            "available": bool,          # True if at least one extraction path works
            "missing": [...],           # List of missing pip packages
            "install_cmd": "pip install ...",
            "groq_available": bool,     # True if GROQ_API_KEY is set
        }
    """
    missing = []

    try:
        import pytesseract  # noqa: F401
    except ImportError:
        missing.append("pytesseract")

    try:
        from PIL import Image  # noqa: F401
    except ImportError:
        missing.append("pillow")

    groq_available = bool(os.getenv("GROQ_API_KEY", "").strip())

    # At least one path is available if either local OCR deps are present OR Groq key is set
    ocr_deps_ok = len(missing) == 0
    available = ocr_deps_ok or groq_available

    install_cmd = "pip install " + " ".join(missing) if missing else ""

    return {
        "available": available,
        "missing": missing,
        "install_cmd": install_cmd,
        "groq_available": groq_available,
    }


class ImageOCRFetcher(BaseFetcher):
    """
    IMAGE OCR ADAPTER
    Extracts structured requirement text from image files using OCR.

    Strategy:
    1. PRIMARY: pytesseract (local, no API key required)
    2. FALLBACK: Groq Vision API (llama-3.2-11b-vision-preview) if pytesseract
       is not installed or produces low-quality output (< 50 chars)
    3. LAST RESORT: Return a structured error payload so the mesh can continue
       with a clear message rather than crashing.
    """

    def __init__(self, url=None, email=None, token=None, mock_path=None):
        self.token = token  # Optional: Groq API key for vision fallback
        self.mock_path = mock_path

    def fetch(self, resource_id: str) -> dict:
        """
        Extract text from an image file or base64 data URI.

        Args:
            resource_id: File path or base64 data URI of the image.

        Returns:
            Normalized requirement dict with extracted text as description.
        """
        logger.info(f"[OCR-FETCHER] Processing image source: {resource_id[:80]}...")

        # Dependency gate — fail fast with a clear message if nothing can work
        dep_check = _check_dependencies()
        if not dep_check["available"]:
            msg = (
                "OCR dependencies not installed. "
                "Run: pip install pytesseract pillow. "
                "Also install Tesseract OCR engine from https://github.com/tesseract-ocr/tesseract"
            )
            logger.error(f"[OCR-FETCHER] {msg}")
            return self.normalize({
                "id": "OCR-DEPS-MISSING",
                "summary": "OCR dependencies not installed",
                "description": msg,
                "acceptance_criteria": ["Install required OCR dependencies before retrying"],
                "platform": "mediaupload",
                "dep_check": dep_check,
            })

        raw_text = ""
        source_label = resource_id
        temp_file_path = None

        if resource_id.startswith("http://") or resource_id.startswith("https://"):
            import requests
            import tempfile
            logger.info(f"[OCR-FETCHER] Downloading remote image: {resource_id}")
            try:
                resp = requests.get(resource_id, timeout=15)
                resp.raise_for_status()
                ext = ".jpg" if "jpeg" in resp.headers.get("Content-Type", "") else ".png"
                fd, temp_file_path = tempfile.mkstemp(suffix=ext)
                with os.fdopen(fd, 'wb') as f:
                    f.write(resp.content)
                resource_id = temp_file_path
                source_label = source_label.split("?")[0]
            except Exception as e:
                logger.error(f"[OCR-FETCHER] Failed to download image: {e}")
                return self.normalize({
                    "id": f"OCR-{source_label[:30]}",
                    "summary": "Failed to download image",
                    "description": f"Could not download image from URL: {e}",
                    "acceptance_criteria": ["Ensure URL is accessible and points to a valid image."],
                    "platform": "mediaupload"
                })

        # --- Strategy 1: pytesseract (local OCR) ---
        try:
            import pytesseract
            from PIL import Image
            import shutil

            # Windows often doesn't add tesseract to PATH automatically
            if os.name == 'nt' and not shutil.which("tesseract"):
                default_win_path = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
                if os.path.exists(default_win_path):
                    pytesseract.pytesseract.tesseract_cmd = default_win_path

            if resource_id.startswith("data:image"):
                # Base64 data URI — decode to bytes
                header, b64data = resource_id.split(",", 1)
                img_bytes = base64.b64decode(b64data)
                import io
                img = Image.open(io.BytesIO(img_bytes))
                source_label = "base64_image"
            else:
                # File path
                if not os.path.exists(resource_id):
                    raise FileNotFoundError(f"Image file not found: {resource_id}")
                img = Image.open(resource_id)
                # Only reset source_label if it wasn't a URL
                if not temp_file_path:
                    source_label = os.path.basename(resource_id)

            raw_text = pytesseract.image_to_string(img).strip()
            logger.info(f"[OCR-FETCHER] pytesseract extracted {len(raw_text)} chars from '{source_label}'")

        except ImportError:
            logger.warning("[OCR-FETCHER] pytesseract not installed. Attempting Groq Vision fallback.")
        except Exception as ocr_err:
            logger.warning(f"[OCR-FETCHER] pytesseract failed: {ocr_err}. Attempting Groq Vision fallback.")

        # --- Strategy 2: Groq Vision API fallback ---
        if len(raw_text) < 50:
            raw_text = self._groq_vision_extract(resource_id, source_label) or raw_text

        # --- Strategy 3: Graceful degradation ---
        if not raw_text:
            raw_text = (
                f"[OCR-EXTRACTION-FAILED] Could not extract text from image '{source_label}'. "
                "Please ensure pytesseract is installed (pip install pytesseract pillow) "
                "or provide a Groq API key for Vision API fallback."
            )
            logger.error(f"[OCR-FETCHER] All extraction strategies failed for '{source_label}'")

        # Parse extracted text into structured requirement fields
        summary, description, acceptance_criteria = self._parse_requirement_text(raw_text)

        result = self.normalize({
            "id": f"OCR-{source_label[:30]}",
            "summary": summary,
            "description": description,
            "acceptance_criteria": acceptance_criteria,
            "platform": "mediaupload",
            "raw_ocr_text": raw_text[:2000],
        })

        if temp_file_path and os.path.exists(temp_file_path):
            try:
                os.remove(temp_file_path)
            except Exception:
                pass

        return result

    def _groq_vision_extract(self, resource_id: str, source_label: str) -> str:
        """
        Use Groq Vision API to extract requirement text from an image.
        Requires GROQ_API_KEY in environment or token passed to constructor.
        """
        try:
            import requests

            api_key = self.token or os.getenv("GROQ_API_KEY", "")
            if not api_key:
                logger.warning("[OCR-FETCHER] No Groq API key available for Vision fallback.")
                return ""

            # Prepare image as base64
            if resource_id.startswith("data:image"):
                image_url = resource_id  # Already a data URI
            else:
                if not os.path.exists(resource_id):
                    return ""
                with open(resource_id, "rb") as f:
                    img_bytes = f.read()
                ext = os.path.splitext(resource_id)[1].lower().lstrip(".")
                mime = {"jpg": "jpeg", "jpeg": "jpeg", "png": "png", "bmp": "bmp", "tiff": "tiff"}.get(ext, "png")
                b64 = base64.b64encode(img_bytes).decode()
                image_url = f"data:image/{mime};base64,{b64}"

            payload = {
                "model": "llama-3.2-11b-vision-preview",
                "messages": [{
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": (
                                "Extract all requirement text from this image. "
                                "Return the full text content including: user stories, "
                                "acceptance criteria, feature descriptions, and any "
                                "structured requirement data visible in the image. "
                                "Preserve the original structure and wording."
                            )
                        },
                        {"type": "image_url", "image_url": {"url": image_url}}
                    ]
                }],
                "max_tokens": 2048,
                "temperature": 0.1,
            }

            resp = requests.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json=payload,
                timeout=60
            )
            try:
                resp.raise_for_status()
            except requests.exceptions.RequestException as req_e:
                error_body = resp.text if hasattr(resp, 'text') else str(req_e)
                logger.error(f"[OCR-FETCHER] Groq Vision API error (HTTP {resp.status_code}): {error_body}")
                raise

            result = resp.json()
            extracted = result["choices"][0]["message"]["content"].strip()
            logger.info(f"[OCR-FETCHER] Groq Vision extracted {len(extracted)} chars from '{source_label}'")
            return extracted

        except Exception as e:
            logger.warning(f"[OCR-FETCHER] Groq Vision fallback failed: {e}")
            return ""

    def _parse_requirement_text(self, text: str) -> tuple:
        """
        Parse raw OCR text into (summary, description, acceptance_criteria).
        Attempts to detect structured patterns (Given/When/Then, AC:, etc.)
        """
        lines = [l.strip() for l in text.split("\n") if l.strip()]

        # Extract summary from first meaningful line
        summary = lines[0][:120] if lines else "Requirement from Image"

        # Detect acceptance criteria patterns
        ac_patterns = re.compile(
            r"^(given|when|then|and|but|ac\s*\d*[:.)]|acceptance criteria|✓|•|-\s*\[)",
            re.IGNORECASE
        )
        acceptance_criteria = []
        description_lines = []

        for line in lines[1:]:
            if ac_patterns.match(line):
                acceptance_criteria.append(line)
            else:
                description_lines.append(line)

        description = "\n".join(description_lines) if description_lines else text
        if not acceptance_criteria:
            acceptance_criteria = [f"Verify: {summary}"]

        return summary, description, acceptance_criteria
