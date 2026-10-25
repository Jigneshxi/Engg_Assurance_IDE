def test_robust_splice():
    original_content = """def _redact_value(v):
    if len(v) <= 4:
        return "***"
    return v[:2] + "*" * (len(v) - 4) + v[-2:]
"""
    finding_line = 2
    
    fix_content = """```python
def _redact_json(value: str) -> str:
    \"\"\"Redact a string value based on its length.\"\"\"
    if not isinstance(value, str):
        return value

    length = len(value)
    if length <= 4:
        return value
    else:
        return "*" * (length - 2) + value[0] + value[-1]
```"""
    
    import re
    def strip_markdown_fences(text: str) -> str:
        text = re.sub(r'^\s*```\w*\n', '', text)
        text = re.sub(r'\n```\s*$', '', text)
        return text

    lines = original_content.splitlines(keepends=True)
    fix_clean = strip_markdown_fences(fix_content)
    if fix_clean and not fix_clean.endswith('\n'):
        fix_clean += '\n'
    fix_lines = fix_clean.splitlines(keepends=True)
    
    # Robust start/end finding:
    # 1. Start at finding_line - 1
    # 2. If fix_clean looks like a function (e.g. starts with def/function/class)
    #    and lines[start] does not, walk 'start' backwards until we find it.
    start = max(0, finding_line - 1)
    
    first_word = fix_lines[0].strip().split()[0] if fix_lines and fix_lines[0].strip() else ""
    if first_word in ["def", "class", "function", "async", "const", "let", "var"]:
        while start > 0 and not lines[start].strip().startswith(first_word):
            start -= 1

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
    
test_robust_splice()
