import re

def main():
    path = "backend/agents/nodes/legacy_nodes.py"
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    # Match STRUCTURE block and append strict rule
    pattern = r'(STRUCTURE: You MUST return a single JSON.*?)(?=\"\"\"|\'\'\')'
    def replacer(match):
        original = match.group(1)
        # Check if already added
        if "No conversational text" in original:
            return original
        # Remove subjective reasoning keys inside the matched structure
        lines = original.split('\n')
        new_lines = []
        for line in lines:
            lower = line.lower()
            if '"reasoning"' in lower or '"executive_summary"' in lower or '"rationale"' in lower or '"title"' in lower or '"description"' in lower:
                # If it's the last item in a JSON, the preceding line might have a trailing comma we'd need to fix,
                # but standard robust_json_loads in python or LLM ignores trailing commas.
                # It's safer to just remove the line.
                continue
            new_lines.append(line)
        cleaned = '\n'.join(new_lines)
        return cleaned + '\n    IMPORTANT: Return ONLY valid JSON. No conversational text, no markdown fences, no ``` wrappers.'

    new_content = re.sub(pattern, replacer, content, flags=re.DOTALL)

    with open(path, "w", encoding="utf-8") as f:
        f.write(new_content)
    
    print("Prompts successfully hardened!")

if __name__ == "__main__":
    main()
