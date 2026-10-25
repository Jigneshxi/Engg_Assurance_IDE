import re
path = 'backend/agents/nodes/legacy_nodes.py'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

structures = re.findall(r'(STRUCTURE:.*?)(?:\"\"\"|\'\'\')', content, re.DOTALL)
for i, s in enumerate(structures[:10]):
    print(f'--- Structure {i} ---')
    print(s[:250])
