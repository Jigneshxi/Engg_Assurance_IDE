def test_git_splice():
    original_content = """def _redact_value(v):
    if len(v) <= 4:
        return "***"
    return v[:2] + "*" * (len(v) - 4) + v[-2:]
"""
    finding_line = 2  # The AI suggests a fix for line 2
    
    # The AI replaces the entire function!
    fix_content = """```python
def _redact_json(value: str) -> str:
    \"\"\"Redact a string value based on its length.\"\"\"
    if not isinstance(value, str):
        return value  # Handle non-string values directly

    length = len(value)
    if length <= 4:
        return value  # No redaction needed for short strings
    else:
        return "*" * (length - 2) + value[0] + value[-1]
```"""
    
    import re
    def strip_markdown_fences(text: str) -> str:
        text = text.strip()
        text = re.sub(r'^```\w*\n', '', text)
        text = re.sub(r'\n```$', '', text)
        return text

    lines = original_content.splitlines(keepends=True)
    fix_clean = strip_markdown_fences(fix_content)
    # Important: append a newline to the replacement if it doesn't have one!
    if not fix_clean.endswith('\n'):
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
    print("--- OUTPUT ---")
    print("".join(new_lines))
    print("--------------")
    
test_git_splice()
