import ast

with open('backend/agents/nodes.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
in_creator = False
fixed = False

for i, line in enumerate(lines):
    if line.startswith('def test_case_creator_node'):
        in_creator = True
    
    if in_creator and not fixed:
        if line.strip() == 'try:' and 'all_test_cases = []' in lines[i+1]:
            new_lines.append('    try:\n')
            new_lines.append('        write_partial_state(task_id, {"CREATOR_CONTEXT_AUDIT": audit})\n')
            new_lines.append('    except Exception:\n')
            new_lines.append('        pass\n\n')
            
            # Now un-indent the remaining lines by 4 spaces
            j = i + 1
            while j < len(lines):
                l = lines[j]
                if l.startswith('    return {"test_cases": all_test_cases'):
                    new_lines.append(l)
                    fixed = True
                    break
                
                if l.startswith('        '):
                    new_lines.append(l[4:])
                elif l.strip() == '':
                    new_lines.append(l)
                else:
                    new_lines.append(l)
                j += 1
            continue

    if fixed and in_creator:
        # we skip appending lines that were consumed by the while loop
        if 'j' in locals() and i <= j:
            continue
            
    new_lines.append(line)

with open('backend/agents/nodes.py', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)
