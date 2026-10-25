import re

def strip_markdown_fences(text: str) -> str:
    # Do not use .strip() on the whole text because it removes trailing newlines 
    # which are critical for preventing line fusion.
    text = re.sub(r'^\s*```\w*\n', '', text)
    text = re.sub(r'\n```\s*$', '', text)
    return text

def test_splice(original_content: str, finding_line: int, fix_content: str):
    lines = original_content.splitlines(keepends=True)
    
    fix_clean = strip_markdown_fences(fix_content)
    # Ensure replacement ends with newline if it's replacing whole lines
    if fix_clean and not fix_clean.endswith('\n'):
        fix_clean += '\n'
        
    fix_lines = fix_clean.splitlines(keepends=True)
    
    start = max(0, finding_line - 1)
    target_line = lines[start] if start < len(lines) else ""
    indent = len(target_line) - len(target_line.lstrip())
    
    end = start + 1
    while end < len(lines):
        line = lines[end]
        if not line.strip():
            end += 1
            continue
        if len(line) - len(line.lstrip()) <= indent:
            break
        end += 1
        
    new_lines = lines[:start] + fix_lines + lines[end:]
    return "".join(new_lines)

print("--- TEST 1: Same line fusion bug ---")
orig1 = "    else:\n        redacted[key] = value\n    for k, v in headers.items():\n"
fix1 = "```python\n    else:\n        redacted[key] = value\n```"
res1 = test_splice(orig1, 1, fix1)
print(res1)

print("--- TEST 2: Indent block replacement ---")
orig2 = "def _redact_value(v):\n    if len(v) <= 4:\n        return '***'\n    return v[:2] + '*' * (len(v) - 4) + v[-2:]\n"
fix2 = "```python\ndef _redact_json(value: str) -> str:\n    return value\n```"
res2 = test_splice(orig2, 1, fix2)  # finding line 1 (the def)
print(res2)
