import os
import shutil
import zipfile

ws_dir = r'd:\Jignesh\VVnT AI Coding Agent_test_13\server\workspaces\amereyconnect-medicinal-platform'
zip_path = r'd:\Jignesh\VVnT AI Coding Agent_test_13\c5.zip'
prd_path = r'd:\Jignesh\VVnT AI Coding Agent_test_13\amereyconnect-medicinal-platform.md'
root_val = r'd:\Jignesh\VVnT AI Coding Agent_test_13\agent-validation.json'
ws_val = os.path.join(ws_dir, 'agent-validation.json')
root_log = r'd:\Jignesh\VVnT AI Coding Agent_test_13\execution.log'
ws_log = os.path.join(ws_dir, '.openclaw', 'execution.log')

# Copy agent-validation.json to root if it exists in workspace
if os.path.exists(ws_val):
    shutil.copy2(ws_val, root_val)
    print(f"Copied {ws_val} -> {root_val}")

if os.path.exists(ws_log):
    shutil.copy2(ws_log, root_log)
    print(f"Copied {ws_log} -> {root_log}")

with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
    # Add PRD
    if os.path.exists(prd_path):
        zf.write(prd_path, 'amereyconnect-medicinal-platform.md')
        zf.write(prd_path, 'amereyconnect-medicinal-platform-PRD.md')
        zf.write(prd_path, 'docs/amereyconnect-medicinal-platform.md')
        print(f"Added PRD: {prd_path}")

    # Add workspace files
    for root, dirs, files in os.walk(ws_dir):
        dirs[:] = [d for d in dirs if d not in ('__pycache__', 'node_modules', '.venv', '.git')]
        for f in files:
            full_path = os.path.join(root, f)
            rel_path = os.path.relpath(full_path, ws_dir)
            archive_path = os.path.join('amereyconnect-medicinal-platform', rel_path).replace('\\', '/')
            zf.write(full_path, archive_path)

print(f"Created {zip_path} with {len(zf.namelist())} files ({os.path.getsize(zip_path)} bytes).")
