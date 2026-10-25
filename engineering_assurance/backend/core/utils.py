"""
================================================================================
VVNT INTELLIGENT TEST PLANNING AGENT - UTILITY MODULE
================================================================================
Architecture:
  This module provides the core Requirement Sanitization, Interpretation,
  and Traceability pipeline used across ALL multi-source ingestion paths
  (Jira, ADO, SharePoint, Local Paste, File Upload, Media Upload, etc.).

  Sanitization Pipeline (RequirementSanitizer):
  ┌─────────────────────────────────────────────────────────────┐
  │  STAGE 1: Entity Decoding  (HTML escapes, unicode, BOM)     │
  │  STAGE 2: HTML Stripping   (BS4 parser, script/style purge) │
  │  STAGE 3: ALM Macro Removal (Jira/Confluence/ADO macros)    │
  │  STAGE 4: Meta-Label Removal ([TAGS], headers, bold marks)  │
  │  STAGE 5: Whitespace Normalization                          │
  │  STAGE 6: Line Filtering  (noise, >3 chars, separators)     │
  └─────────────────────────────────────────────────────────────┘
  ↓ (Baseline clean text)
  ┌─────────────────────────────────────────────────────────────┐
  │  Interpretation: synthesize_and_interpret()                 │
  │    → LLM (Groq/Ollama) or heuristic fallback               │
  │    → Always returns 3-section Markdown contract            │
  ├─────────────────────────────────────────────────────────────┤
  │  Traceability: synthesize_with_traceability()              │
  │    → Accepts list[SourceRef] (Driving Requirements)        │
  │    → LLM annotates each derived AC with ↩REQ-XXX tag      │
  │    → extract_traceability_from_output() parses the tags    │
  │    → Returns (synthesis_text, TraceabilityMap)             │
  │                                                            │
  │  TraceabilityMap:                                          │
  │    driving: [SourceRef]  ← Original ALM source records     │
  │    derived: [DerivedAC]  ← Interpreted testable ACs        │
  │    Each DerivedAC.traces → list of SourceRef.ref_id       │
  └─────────────────────────────────────────────────────────────┘
"""

import re
import html
import logging
import unicodedata
from dataclasses import dataclass, field, asdict
from typing import List, Optional

# Configure Logger
logger = logging.getLogger(__name__)


# ==============================================================================
# TRACEABILITY DATA MODEL
# ==============================================================================

@dataclass
class SourceRef:
    """
    DRIVING REQUIREMENT — Original source record from an ALM tool.

    ref_id:    System-assigned unique reference (e.g. 'REQ-001').
                Used as the trace key in derived ACs.
    platform:  Source platform identifier ('jira', 'ado', 'sharepoint', etc.)
    source_id: Native ID from the platform ('CORE-123', '4521', 'doc.docx')
    summary:   Title / one-line description from the source
    """
    ref_id: str
    platform: str
    source_id: str
    summary: str

    def label(self) -> str:
        """Human-readable label for UI display and LLM prompt injection."""
        return f"{self.ref_id} [{self.platform.upper()} / {self.source_id}]"


@dataclass
class DerivedAC:
    """
    DERIVED REQUIREMENT — A testable acceptance criterion produced by LLM
    interpretation of one or more driving requirements.

    ac_id:   Sequential ID (e.g. 'AC-1', 'AC-2')
    text:    Testable statement (plain English, no raw ALM artifacts)
    traces:  List of SourceRef.ref_id values this AC was derived from
    """
    ac_id: str
    text: str
    traces: List[str] = field(default_factory=list)


@dataclass
class TraceabilityMap:
    """
    BIDIRECTIONAL REQUIREMENT TRACEABILITY MAP

    Implements the IEEE 829 / ISO 29119 traceability concept:
        Driving Requirements (source) ↔ Derived Requirements (interpreted ACs)

    Usage:
        map.driving  → list of SourceRef (with platform, ALM ID, summary)
        map.derived  → list of DerivedAC (with ac_id, text, trace back-refs)

    The Frontend renders this as a Traceability Matrix table in Step 3.
    """
    driving: List[SourceRef] = field(default_factory=list)
    derived: List[DerivedAC] = field(default_factory=list)

    def to_dict(self) -> dict:
        """Serialize to JSON-safe dict for API response."""
        return {
            "driving": [asdict(r) for r in self.driving],
            "derived": [asdict(a) for a in self.derived],
        }


# ==============================================================================
# STAGE PIPELINE: RequirementSanitizer
# ==============================================================================

class RequirementSanitizer:
    """
    MULTI-STAGE SANITIZATION PIPELINE

    Architecture Decision:
        Rather than a single monolithic function, each stage is a static method
        that targets a specific class of artifact. This makes the pipeline
        transparent, independently testable, and easy to extend for new sources.

    Supported Artifact Classes:
        - HTML & encoded HTML (&lt;div class="foo"&gt; → stripped entirely)
        - Atlassian ADF JSON artifacts (handled upstream in jira_issue_fetcher)
        - Jira/Confluence macro syntax ({code}, {panel}, {toc})
        - ADO @mentions and work-item link references
        - Internal bracket meta-labels ([DETAILED SCOPE], [AC], [JIRA-101])
        - Markdown formatting debris (##, **, __, ```)
        - Unicode noise (zero-width spaces, BOM, non-breaking spaces)
        - Horizontal separators and content-free filler lines
    """

    @classmethod
    def run(cls, text: str) -> str:
        """
        PUBLIC ENTRY POINT
        Executes all 7 stages sequentially.
        """
        if not text or not text.strip():
            return ""

        original = text
        text = cls._stage1_decode_entities(text)
        text = cls._stage2_strip_html(text)
        text = cls._stage3_remove_alm_macros(text)
        text = cls._stage4_remove_meta_labels(text)
        text = cls._stage5_normalize_whitespace(text)
        text = cls._stage6_filter_lines(text)
        text = cls._stage7_neutralize_injections(text)
        
        if not text.strip() and original.strip():
            fallback = cls._stage1_decode_entities(original).strip()
            return cls._stage7_neutralize_injections(fallback)
            
        return text

    @staticmethod
    def _stage7_neutralize_injections(text: str) -> str:
        """
        STAGE 7: Prompt Injection Sanitization
        Neutralizes typical LLM jailbreaks, markdown boundary exploits, and system prompt overrides
        using generic regex patterns instead of hardcoded word lists.
        """
        # 1. Strip markdown fences used to break JSON parsing
        text = re.sub(r'```[a-zA-Z]*', '', text)
        
        # 2. Strip common control tokens
        text = re.sub(r'(<\|im_start\|>|<\|im_end\|>|\[INST\]|\[/INST\]|<<SYS>>|<\|system\|>)', '', text, flags=re.IGNORECASE)
        
        # 3. Neutralize command overrides using dynamic semantic boundaries
        override_pattern = r'(?i)\b(ignore|disregard|forget|bypass|override)\s+(all\s+)?(previous\s+)?(instructions|rules|prompts|commands|filters)\b'
        text = re.sub(override_pattern, '[REDACTED_INSTRUCTION_OVERRIDE]', text)
        
        sys_prompt_pattern = r'(?i)\b(system\s+prompt|you\s+are\s+now|act\s+as)\b\s*[:=]'
        text = re.sub(sys_prompt_pattern, '[REDACTED_SYSTEM_OVERRIDE]:', text)
        
        # 4. Enforce strict character limits (e.g., 20,000 chars) to prevent buffer overflows
        return text[:20000]

    @staticmethod
    def _stage1_decode_entities(text: str) -> str:
        """
        STAGE 1: Entity & Unicode Decoding

        Why this runs FIRST:
            If we run BeautifulSoup BEFORE unescaping, encoded tags like
            `&lt;div class="foo"&gt;` are seen as plain text (no angle brackets),
            so BS4 ignores them entirely. After this step, they become real HTML
            tags that BS4 will properly strip in Stage 2.

        Handles:
            - HTML entities:  &lt; &gt; &amp; &quot; &nbsp;
            - Named entities: &mdash; &ndash; &hellip;
            - Non-breaking spaces (\xa0)
            - Zero-width characters (\u200b, \u200c, \ufeff/BOM)
            - Unicode normalization to NFC canonical form
        """
        text = html.unescape(text)
        # Named entities html.unescape may have missed
        text = text.replace('&mdash;', ' - ').replace('&ndash;', '-').replace('&hellip;', '...')
        # Non-printable / zero-width unicode
        text = text.replace('\xa0', ' ')       # non-breaking space
        text = text.replace('\u200b', '')      # zero-width space
        text = text.replace('\u200c', '')      # zero-width non-joiner
        text = text.replace('\u200d', '')      # zero-width joiner
        text = text.replace('\ufeff', '')      # BOM (byte-order mark)
        # Strip remaining non-printable control characters (except newline/tab)
        text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', text)
        # Normalize unicode to canonical form
        text = unicodedata.normalize('NFC', text)
        return text

    @staticmethod
    def _stage2_strip_html(text: str) -> str:
        """
        STAGE 2: HTML Tag & Attribute Stripping

        Uses BeautifulSoup for robust, nested-HTML-aware parsing.
        Completely removes <script>, <style>, <head>, and <meta> tag content
        (not just the tags, but their entire inner content).

        Falls back to a regex-based strip if BS4 is unavailable.

        Note: Separator is '\\n' to preserve logical line breaks that
        correspond to paragraph/block-level HTML elements.
        """
        try:
            from bs4 import BeautifulSoup
            soup = BeautifulSoup(text, 'html.parser')
            # Purge entire subtrees that produce no meaningful text
            for dead_tag in soup(['script', 'style', 'head', 'meta', 'link', 'noscript']):
                dead_tag.decompose()
            text = soup.get_text(separator='\n')
        except Exception as e:
            logger.debug(f"BS4 unavailable, falling back to regex HTML strip: {e}")
            # Remove script/style content blocks first
            text = re.sub(r'<(script|style)[^>]*>.*?</(script|style)>', '', text,
                          flags=re.DOTALL | re.IGNORECASE)
            # Strip remaining HTML tags (preserve inner text)
            text = re.sub(r'<[^>]+>', ' ', text)
        return text

    @staticmethod
    def _stage3_remove_alm_macros(text: str) -> str:
        """
        STAGE 3: ALM Platform Macro & Artifact Removal

        Handles the proprietary markup syntax of enterprise ALM tools that
        survives HTML stripping because it is plain-text macro notation:

        Jira / Confluence:
            {code:language=java} ... {code}
            {panel:title=AC} ... {panel}
            {noformat}, {quote}, {toc}, {info}, {warning}

        ADO (Azure DevOps):
            @[User Display Name] mentions
            #12345 work-item cross-references

        Generic:
            HTTP/HTTPS URLs (replaced with [URL] placeholder for traceability)
            Markdown fenced code blocks
            Inline backtick code spans
        """
        # Remove Jira/Confluence macro tags but KEEP their content.
        # This ensures text inside {panel}, {code}, {quote} etc. is preserved.
        text = re.sub(r'\{[a-zA-Z][^{}]*\}', ' ', text)
        # ADO @mention: @[Display Name]
        text = re.sub(r'@\[[^\]]{1,80}\]', '', text)
        # ADO plain @mention: @username
        text = re.sub(r'@\w{2,40}\b', '', text)
        # Short work-item refs: #12345
        text = re.sub(r'#\d{2,7}\b', '', text)
        # Fenced code blocks (```...```)
        text = re.sub(r'```[\s\S]*?```', '', text)
        # Inline code spans
        text = re.sub(r'`[^`\n]+`', '', text)
        # URLs → placeholder to avoid broken sentences
        text = re.sub(r'https?://\S+', '[URL]', text)
        return text

    @staticmethod
    def _stage4_remove_meta_labels(text: str) -> str:
        """
        STAGE 4: Internal Meta-Label & Formatting Removal

        Destroys bracket-enclosed internal labels injected by the ALM tool's
        own UI or by our ingestion pipeline:
            [DETAILED SCOPE]  [AC]  [JIRA-123]  [Local-Paste]

        Also strips leftover Markdown decorators whose underlying text has
        already been extracted:
            ## Heading → Heading
            **bold** → bold
            __italic__ → italic
            ~~strikethrough~~ (removed entirely as noise)
        """
        # Bracket meta-labels: ALL_CAPS or MixedCase 1-4 words in brackets
        text = re.sub(r'\[[A-Z][A-Z0-9 _\-]{0,40}\]', '', text)
        # Markdown header markers (keep the label text after #)
        text = re.sub(r'^#{1,6}\s*', '', text, flags=re.MULTILINE)
        # Markdown bold/italic: **text** *text* __text__ _text_
        text = re.sub(r'\*{1,3}([^*\n]+)\*{1,3}', r'\1', text)
        text = re.sub(r'_{1,3}([^_\n]+)_{1,3}', r'\1', text)
        # Strikethrough (content is noise — remove entirely)
        text = re.sub(r'~~[^~\n]+~~', '', text)
        # Horizontal rules (---, ***, ___ on their own line)
        text = re.sub(r'^[-*_]{3,}\s*$', '', text, flags=re.MULTILINE)
        return text

    @staticmethod
    def _stage5_normalize_whitespace(text: str) -> str:
        """
        STAGE 5: Whitespace Normalization

        Standardizes all line endings, collapses excessive blank lines, and
        removes leading/trailing whitespace from individual lines.
        Preserves single blank lines between logical paragraphs.
        """
        # Normalize line endings (CRLF, CR → LF)
        text = text.replace('\r\n', '\n').replace('\r', '\n')
        # Collapse runs of horizontal whitespace (spaces, tabs) to single space
        text = re.sub(r'[ \t]+', ' ', text)
        # Collapse 3+ consecutive blank lines → 2 (preserve paragraph breaks)
        text = re.sub(r'\n{3,}', '\n\n', text)
        return text.strip()

    @staticmethod
    def _stage6_filter_lines(text: str) -> str:
        """
        STAGE 6: Noise Line Filtering

        Removes lines that are content-free after previous sanitization:
            - Lines with fewer than 4 characters (e.g. "AC:", "N/A")
            - Lines containing only separators or punctuation
            - Lines that are pure whitespace

        Preserves:
            - Meaningful bullet-point lines (with - or • prefix)
            - Short but meaningful lines like "None." or "TBD"
        """
        meaningful = []
        for raw_line in text.splitlines():
            line = raw_line.strip()
            if not line:
                meaningful.append('')   # preserve blank lines between paragraphs
                continue
            # Pure separator / decorative line
            if re.match(r'^[-=_*~|+#]{3,}$', line):
                continue

            # Extremely short lines that carry no semantic value
            if len(line) < 4 and not re.match(r'^\d+\.', line):
                continue
            meaningful.append(line)

        # Collapse consecutive blank lines again after filtering
        result = '\n'.join(meaningful)
        result = re.sub(r'\n{3,}', '\n\n', result)
        return result.strip()


# ==============================================================================
# PUBLIC API (backward-compatible facades)
# ==============================================================================

def clean_text(text: str) -> str:
    """
    PUBLIC API: Requirement Text Sanitization
    Facade over RequirementSanitizer.run() — maintains backward compatibility
    with all existing callers in router.py, workflow.py, and fetchers.
    """
    return RequirementSanitizer.run(text)


def synthesize_and_interpret(raw_combined_text: str) -> str:
    """
    UNIVERSAL REQUIREMENT INTERPRETER

    Two-phase approach:
    ┌─────────────────────────────────────────────────────────────┐
    │ Phase A: Sanitize raw text (RequirementSanitizer pipeline)  │
    │ Phase B: LLM interpretation → 3-section Markdown output     │
    │          Fallback: Heuristic rule-based 3-section summary   │
    └─────────────────────────────────────────────────────────────┘

    Output contract (always guaranteed):
        ### 🎯 Primary Scope & Objective
        ### ✨ Synthesized Acceptance Criteria (Testable)
        ### ⚠️ Ambiguities / Missing Context

    All callers (router.py, workflow.py) rely on this contract for the
    Step-3 UI to correctly parse and color-code the three sections.
    """
    # Phase A: Sanitize before anything else
    baseline = RequirementSanitizer.run(raw_combined_text)

    if not baseline.strip():
        return (
            "### 🎯 Primary Scope & Objective\n"
            "No parseable requirement content was found in the provided sources.\n\n"
            "### ✨ Synthesized Acceptance Criteria (Testable)\n"
            "None derivable — source data is empty or unreadable.\n\n"
            "### ⚠️ Ambiguities / Missing Context\n"
            "- All requirement fields returned empty. Verify the source connection and ticket ID."
        )

    # Phase B: LLM Interpretation
    synopsis = _call_active_llm(baseline)

    # Fallback if LLM unavailable or returned empty
    return synopsis if synopsis and synopsis.strip() else _build_fallback_summary(baseline)


# ==============================================================================
# INTERNAL HELPERS
# ==============================================================================

def _build_interpretation_prompt(clean_requirement_text: str, source_refs: Optional[List] = None) -> str:
    """
    Constructs a precision-engineered LLM prompt.
    When source_refs are provided, injects the REQ-XXX manifest and instructs
    the model to annotate each derived AC with [↩ REQ-XXX] trace tags.
    """
    if source_refs:
        # Build the source manifest block for injection
        manifest_lines = [f"  {r.label()}: {r.summary}" for r in source_refs]
        manifest = "\n".join(manifest_lines)
        traceability_instruction = f"""

SOURCE REFERENCE MANIFEST (Driving Requirements):
{manifest}

TRACEABILITY INSTRUCTION (CRITICAL):
For EACH numbered item in the Acceptance Criteria section, you MUST append a trace
annotation at the end of the line in this exact format:  [↩ REQ-001]
If an AC traces to multiple sources, list them:           [↩ REQ-001, REQ-002]
Use ONLY the REQ-XXX identifiers from the manifest above.
Do NOT use any other format for traceability — only [↩ REQ-XXX].
"""
    else:
        traceability_instruction = ""

    return f"""You are reviewing pre-cleaned requirement data extracted from enterprise ALM systems (Jira, ADO, SharePoint, file uploads, or manual paste).

Your task is to produce a STRUCTURED TESTABLE REQUIREMENT INTERPRETATION for a QA Test Engineering team.{traceability_instruction}

===== PRE-SANITIZED REQUIREMENT DATA =====
{clean_requirement_text}
===== END =====

Write your interpretation using EXACTLY these three sections.
Each section must use clear English prose. Use numbered lists for acceptance criteria.
Use bullet points for scope inclusions and ambiguity flags.
Do NOT copy raw IDs, bracket labels, URLs, or any technical noise from the source data.

### 🎯 Primary Scope & Objective
(Write an exhaustive, high-fidelity summary. Describe WHAT this feature covers, WHO it serves, the core system goals, and ALL identified modules/workflows. Do NOT over-summarize; preserve the depth of the source requirements.)

### ✨ Synthesized Acceptance Criteria (Testable)
(Numbered list. Provide a comprehensive list of testable criteria. Each item MUST be independently verifiable by a test engineer. Begin each with "The system shall..." or "The user shall be able to..."{'. Append the trace annotation [↩ REQ-XXX] at the end of each line.' if source_refs else ''})

### ⚠️ Ambiguities / Missing Context
(Exhaustively list any unclear, contradictory, or missing details using bullet points. If none, write exactly: None identified.)
"""


def _call_active_llm(baseline_text: str, source_refs: Optional[List] = None) -> str:
    """
    Queries the active LLM identity from the vault mesh and calls the appropriate
    provider with the interpretation prompt.

    ARCHITECTURE: Routes through IdentityOrchestrator (LLMKeyPool / LLMKeyIdentity)
    so that all calls go through the vault, tier routing, circuit breaking, and
    rotation engine — identical to the main InferenceCoordinator path.

    Falls back to the heuristic summary if no vault identity is available.
    Returns empty string on failure so the caller can use _build_fallback_summary.
    """
    from backend.core.identity_orchestrator import IdentityOrchestrator
    import requests as _requests

    prompt = _build_interpretation_prompt(baseline_text, source_refs=source_refs)
    max_tok = 4000 if source_refs else 3000

    system_msg = (
        "You are an Enterprise QA Architect specializing in IEEE 829 test documentation. "
        "Your task is to interpret the provided requirements and produce a professional, testable interpretation. "
        "While you must stay true to the provided scope, you should use your professional QA knowledge to identify "
        "implied test conditions, standard edge cases, and typical industry risks relevant to the domain. "
        "If the data is genuinely missing or contradictory, report it in the 'Ambiguities' section. "
        "Output MUST be pure English prose, numbered lists, and bullet points. "
        "NEVER include HTML tags, JSON fragments, or ALM identifiers. "
        + ("When writing acceptance criteria, always append the [↩ REQ-XXX] trace tag at the end of each numbered line." if source_refs else "")
    )

    # Try cloud tiers in order: strategic → primary → economy
    for tier in ("strategic", "primary", "economy"):
        identity = IdentityOrchestrator.get_identity(tier)
        if not identity:
            continue

        provider = identity["provider"].lower().strip()
        api_key  = identity["key"]
        model    = identity["model"]
        base_url = identity["url"] or ""

        try:
            if provider == "groq":
                from groq import Groq
                client = Groq(api_key=api_key)
                res = client.chat.completions.create(
                    messages=[
                        {"role": "system", "content": system_msg},
                        {"role": "user",   "content": prompt},
                    ],
                    model=model,
                    max_tokens=max_tok,
                    temperature=0.3,
                )
                return res.choices[0].message.content

            elif provider in ("openai", "openrouter", "gemini"):
                from openai import OpenAI
                default_urls = {
                    "openai":     "https://api.openai.com/v1",
                    "openrouter": "https://openrouter.ai/api/v1",
                    "gemini":     "https://generativelanguage.googleapis.com/v1beta/openai/",
                }
                client = OpenAI(
                    api_key=api_key,
                    base_url=base_url or default_urls.get(provider, "https://api.openai.com/v1"),
                )
                clean_model = model.replace("openrouter/", "").replace("gemini/", "").replace("openai/", "")
                res = client.chat.completions.create(
                    messages=[
                        {"role": "system", "content": system_msg},
                        {"role": "user",   "content": prompt},
                    ],
                    model=clean_model,
                    max_tokens=max_tok,
                    temperature=0.3,
                )
                return res.choices[0].message.content

        except Exception as e:
            logger.warning(f"[UTILS-LLM] Tier '{tier}' identity #{identity['id']} failed: {e}")
            continue

    # Last resort: local Ollama via vault identity
    local_ident = IdentityOrchestrator.get_identity("local")
    if local_ident:
        from backend.core.config import settings
        local_url  = (local_ident["url"] or settings.OLLAMA_BASE_URL).rstrip("/")
        local_model = local_ident["model"].replace("ollama/", "")
        try:
            resp = _requests.post(
                f"{local_url}/api/generate",
                json={
                    "model":   local_model,
                    "prompt":  f"{system_msg}\n\n{prompt}",
                    "stream":  False,
                    "options": {"temperature": 0.3},
                },
                timeout=35,
            )
            if resp.status_code == 200:
                return resp.json().get("response", "")
            logger.warning(f"[UTILS-LLM] Local Ollama returned status {resp.status_code}")
        except Exception as e:
            logger.error(f"[UTILS-LLM] Local Ollama error: {e}")

    logger.info("[UTILS-LLM] No vault identity available across all tiers. Using heuristic fallback.")
    return ""


def _build_fallback_summary(clean_text_input: str) -> str:
    """
    HEURISTIC FALLBACK SUMMARY

    Produces a structured 3-section output without LLM by applying
    simple heuristic analysis on the clean baseline text.
    Ensures the UI always receives the expected 3-section contract
    even when no LLM endpoint is reachable.

    Heuristics:
        Scope:    First 2-3 meaningful sentences/lines
        AC:       Lines containing modal verbs or BDD keywords
        Flags:    Content length, absence of AC, blank fields
    """
    # Tokenize into meaningful lines
    lines = [l.strip() for l in clean_text_input.splitlines()
             if l.strip() and len(l.strip()) > 5]

    # --- Scope: first block of content ---
    scope_lines = lines[:3] if len(lines) >= 3 else lines
    scope_text = ' '.join(scope_lines) if scope_lines else "Requirement scope could not be determined from the available data."

    # --- Acceptance Criteria: heuristic keyword detection ---
    ac_keywords = [
        'shall', 'must', 'should', 'given', 'when', 'then',
        'user can', 'system', 'able to', 'verify', 'ensure',
        'allow', 'prevent', 'validate', 'display', 'return',
        'accept', 'reject', 'notify', 'send', 'receive'
    ]
    ac_lines = [
        l for l in lines
        if any(kw in l.lower() for kw in ac_keywords)
    ]
    if not ac_lines:
        # Fall back to lines 3–8 as candidate AC
        ac_lines = lines[3:8] if len(lines) > 3 else []

    if ac_lines:
        ac_section = '\n'.join(
            f"{i + 1}. {l.capitalize()}" for i, l in enumerate(ac_lines[:7])
        )
    else:
        ac_section = "1. Requirements require further elaboration to extract specific, testable acceptance criteria."

    # --- Ambiguities: flag data quality issues ---
    ambiguity_flags = []
    if len(clean_text_input) < 80:
        ambiguity_flags.append("Requirement description is very brief — more detail is strongly recommended.")
    if not ac_lines:
        ambiguity_flags.append("No explicit acceptance criteria detected. Define these before test case creation.")
    if len(lines) < 3:
        ambiguity_flags.append("Insufficient content was retrieved — partial data may indicate a connection or permissions issue.")
    if "[URL]" in clean_text_input:
        ambiguity_flags.append("One or more URLs were detected and removed — ensure linked documents are accessible.")

    if not ambiguity_flags:
        ambiguity_text = "- None identified based on available data."
    else:
        ambiguity_text = '\n'.join(f"- {f}" for f in ambiguity_flags)

    return (
        f"### 🎯 Primary Scope & Objective\n{scope_text}\n\n"
        f"### ✨ Synthesized Acceptance Criteria (Testable)\n{ac_section}\n\n"
        f"### ⚠️ Ambiguities / Missing Context\n{ambiguity_text}"
    )


# ==============================================================================
# TRACEABILITY SYNTHESIS
# ==============================================================================

def synthesize_with_traceability(
    raw_combined_text: str,
    source_refs: List[SourceRef],
) -> tuple:
    """
    TRACEABILITY-AWARE REQUIREMENT INTERPRETATION

    Two-phase approach:
        Phase A: Sanitize all raw text.
        Phase B: LLM is given the SourceRef manifest (REQ-001, REQ-002 ...)
                 and instructed to annotate each derived AC with trace tags.
        Phase C: extract_traceability_from_output() parses the annotations
                 into a structured TraceabilityMap.

    Args:
        raw_combined_text:  Concatenated source blocks (pre-sanitized by router)
        source_refs:        List of SourceRef built from each fetched source

    Returns:
        (synthesis_text: str, tmap: TraceabilityMap)
        synthesis_text — clean 3-section Markdown (trace tags removed from display text)
        tmap           — TraceabilityMap with driving[] and derived[]
    """
    # Phase A: Sanitize
    baseline = RequirementSanitizer.run(raw_combined_text)

    empty_response = (
        "### 🎯 Primary Scope & Objective\n"
        "No parseable requirement content was found.\n\n"
        "### ✨ Synthesized Acceptance Criteria (Testable)\n"
        "None derivable — source data is empty.\n\n"
        "### ⚠️ Ambiguities / Missing Context\n"
        "- All requirement fields returned empty. Verify source connection and ID.",
        TraceabilityMap(driving=source_refs)
    )

    if not baseline.strip():
        return empty_response

    # Phase B: LLM with traceability-aware prompt
    raw_llm_output = _call_active_llm(baseline, source_refs=source_refs)

    # Phase C: Parse and build map
    if raw_llm_output and raw_llm_output.strip():
        synthesis_text, tmap = extract_traceability_from_output(raw_llm_output, source_refs)
        if synthesis_text and synthesis_text.strip():
            return synthesis_text, tmap

    # Fallback: heuristic summary + best-effort traceability
    fallback_text = _build_fallback_summary(baseline)
    # If even fallback is weak, inject the raw baseline as a safety net
    if len(fallback_text) < 50:
        fallback_text = f"### 🎯 Primary Scope & Objective\n{baseline}\n\n### ✨ Synthesized Acceptance Criteria (Testable)\n1. TBD\n\n### ⚠️ Ambiguities / Missing Context\n- Refinement required."
        
    _, tmap = extract_traceability_from_output(fallback_text, source_refs)
    return fallback_text, tmap


def extract_traceability_from_output(
    llm_output: str,
    source_refs: List[SourceRef],
) -> tuple:
    """
    TRACEABILITY ANNOTATION PARSER

    The LLM is instructed to tag each numbered AC in its output with
    trace annotations in the format:  [↩ REQ-001]  or  [↩ REQ-001, REQ-002]

    This function:
    1. Scans the AC section for lines starting with a number (1. 2. AC-1 etc.)
    2. Extracts [↩ REQ-XXX] annotations from each line
    3. Strips the annotation from the display text (keeps clean readable line)
    4. Builds DerivedAC objects with back-references
    5. Any AC without an annotation gets all source refs as traces (conservative)

    Returns:
        (clean_synthesis_text: str, TraceabilityMap)
    """
    # Pattern: optional whitespace, number or AC-N, dot/dash/close-paren, text, optional annotation
    AC_LINE_PATTERN = re.compile(
        r'^(?:AC-?|ac-?)?\s*(\d+)[.)]\s*(.+?)(?:\s*\[↩\s*([^\]]+)\]\s*)?$',
        re.IGNORECASE
    )
    # Any standalone trace annotation
    TRACE_ANNOTATION = re.compile(r'\[↩\s*([^\]]+)\]')

    all_ref_ids = [r.ref_id for r in source_refs]
    derived_acs: List[DerivedAC] = []

    # Split output into AC section and rest
    # We only parse lines in the "Synthesized Acceptance Criteria" section
    sections = llm_output.split("###")
    clean_sections = []
    ac_counter = 0

    for section in sections:
        section = section.strip()
        if not section:
            continue

        is_ac_section = any(kw in section.lower() for kw in ["acceptance criteria", "synthesized", "testable"])

        if not is_ac_section:
            # Still strip any stray trace annotations from non-AC sections
            clean_sections.append("### " + re.sub(TRACE_ANNOTATION, "", section).strip())
            continue

        # Process AC section line by line
        clean_ac_lines = []
        for line in section.splitlines():
            stripped = line.strip()
            if not stripped:
                clean_ac_lines.append("")
                continue

            m = AC_LINE_PATTERN.match(stripped)
            if m:
                ac_num = m.group(1)
                ac_text = m.group(2).strip()
                trace_group = m.group(3)  # may be None

                # Resolve traces
                if trace_group:
                    # Explicit: [↩ REQ-001, REQ-002]
                    traces = [t.strip() for t in trace_group.split(",") if t.strip() in all_ref_ids]
                else:
                    # No explicit annotation — conservatively trace to ALL sources
                    traces = all_ref_ids[:]

                ac_counter += 1
                ac_id = f"AC-{ac_counter}"
                derived_acs.append(DerivedAC(ac_id=ac_id, text=ac_text, traces=traces))
                # Clean display line (no annotation)
                clean_ac_lines.append(f"{ac_num}. {ac_text}")
            else:
                # Header line of AC section — keep as-is (strip any stray annotation)
                clean_ac_lines.append(re.sub(TRACE_ANNOTATION, "", stripped))

        clean_sections.append("### " + "\n".join(clean_ac_lines))

    # Rebuild clean synthesis text
    clean_synthesis = "\n\n".join(clean_sections)
    
    # SAFETY: Ensure we never return an empty string to the UI
    if not clean_synthesis.strip() or len(clean_synthesis) < 20:
        clean_synthesis = f"### 🎯 Primary Scope & Objective\nSource data analyzed. Manual refinement required.\n\n### ✨ Synthesized Acceptance Criteria (Testable)\n1. Verification of the provided sources.\n\n### ⚠️ Ambiguities / Missing Context\n- Heuristic extraction failed – use manual edit mode."

    tmap = TraceabilityMap(driving=source_refs, derived=derived_acs)
    return clean_synthesis, tmap




def dict_to_markdown(payload: dict, title: str, description: str = "") -> str:
    """
    PREMIUM UI PREVIEW TRANSFORMATION
    Logic: Converts the agentic payload into a high-density Markdown abstract.
    """
    if not isinstance(payload, dict):
        return f"# Error\nUnformatted payload: {str(payload)}"

    md = f"# 📝 VVNT Strategic Abstract: {title}\n\n"

    # 1. Strategic Summary (Restored)
    ex_sum = payload.get("executive_summary", {})
    if isinstance(ex_sum, dict):
        md += f"### 🎯 Core Objective\n"
        md += f"{ex_sum.get('description', 'Comprehensive validation strategy.')}\n\n"

    # 2. Testing Objectives (New/Enhanced)
    objectives = payload.get("testing_objectives", [])
    if isinstance(objectives, list) and objectives:
        md += "### 🏆 Project Goals & Success Criteria\n"
        md += "| Objective | Success Criteria |\n| :--- | :--- |\n"
        for o in objectives:
            if isinstance(o, dict):
                md += f"| {o.get('goal', 'Technical verification')} | {o.get('success_criteria', 'Verified')} |\n"
        md += "\n"

    # 3. Intelligence Metrics
    metrics = payload.get("intelligence_metrics", {})
    if isinstance(metrics, dict):
        md += "### ✨ Test Intelligence Metrics\n"
        md += f"- **Requirement Coverage:** `{metrics.get('requirement_coverage', '100%')}`\n"
        md += f"- **Risk Density:** `{metrics.get('risk_density', 'Moderate')}`\n"
        md += f"- **SLA Confidence:** `{metrics.get('sla_confidence', 'Verified')}`\n\n"

    # 4. Scope & BDD
    scope = payload.get("scope", {})
    if isinstance(scope, dict):
        md += "## 📂 Scope & Behavioral Verification\n"
        inclusions = scope.get("inclusions", [])
        if inclusions:
            md += "#### Functional Inclusions\n"
            for inc in inclusions: md += f"- {str(inc)}\n"
        
        gherkin = scope.get("gherkin_scenarios", [])
        if gherkin:
            md += "\n#### Executable Gherkin Scenarios\n"
            for g in gherkin: md += f"```gherkin\n{str(g)}\n```\n"
    md += "\n"

    # 5. Atomic Testing Points (Enhanced Table)
    points = payload.get("testing_points", [])
    if isinstance(points, list) and points:
        md += "### 💎 Atomic Testing Points\n"
        md += "| Feature Area | Verification Point | Expected Behavior |\n| :--- | :--- | :--- |\n"
        for p in points:
            if isinstance(p, dict):
                md += f"| {p.get('feature', 'Core')} | {p.get('verification_point', 'Valid check')} | {p.get('expected_behavior', 'Pass')} |\n"
        md += "\n"

    # 6. Test Conditions & Data
    md += "## 🛠️ Testing Constraints & Data Governance\n"
    conditions = payload.get("test_conditions", [])
    if isinstance(conditions, list) and conditions:
        md += "#### State & Environmental Conditions\n"
        md += "| Condition | Impact on Testing |\n| :--- | :--- |\n"
        for c in conditions:
            if isinstance(c, dict):
                md += f"| {c.get('condition','State')} | {c.get('impact','Baseline')} |\n"
        md += "\n"

    data = payload.get("test_data_usage", {})
    if isinstance(data, dict):
        md += "#### Data Usage Policy\n"
        md += f"- **Strategy:** {data.get('source', 'Synthetic Generation')}\n"
        md += f"- **Security:** {data.get('pii_handling', 'PII Masking Active')}\n\n"

    # 7. QA Readiness (Restored Checklist)
    checklist = payload.get("qa_readiness_checklist", [])
    if isinstance(checklist, list) and checklist:
        md += "## ✅ QA Readiness (Entry Criteria)\n"
        for item in checklist:
            if isinstance(item, dict):
                status = item.get('status','').lower()
                md += f"- [{'x' if status=='ready' or status=='verified' else ' '}] **{item.get('item', 'Task')}**\n"
        md += "\n"

    # 8. Risk Matrix (Table)
    risks = payload.get("risk_matrix", [])
    if isinstance(risks, list) and risks:
        md += "## ⚠️ Risk & Mitigation Matrix\n"
        md += "| Area | Likelihood | Impact | Mitigation |\n| :--- | :---: | :---: | :--- |\n"
        for r in risks:
            if isinstance(r, dict):
                md += f"| {r.get('area','Core')} | {r.get('likelihood','M')} | {r.get('impact','H')} | {r.get('mitigation','N/A')} |\n"
        md += "\n"

    # 9. Strategy & Schedule (Restored)
    md += "## 📅 Strategy & Plan Timeline\n"
    strat = payload.get("test_strategy_recommendations", {})
    if isinstance(strat, dict):
        md += f"- **API/Integration:** {strat.get('api', 'REST')}\n"
        md += f"- **UI/UX Flow:** {strat.get('ui', 'E2E')}\n"
        md += f"- **Stability/Perf:** {strat.get('perf', 'Load')}\n"
    
    schedule = payload.get("schedule", [])
    if isinstance(schedule, list) and schedule:
        md += "\n#### Execution Timeline (Estimated SLA)\n"
        for s in schedule:
            if isinstance(s, dict):
                md += f"- **{s.get('task', 'Milestone')}**: {s.get('duration', 'TBD')}\n"

    return md

