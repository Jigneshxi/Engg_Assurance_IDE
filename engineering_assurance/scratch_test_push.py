import sys
import os
import requests
from dotenv import load_dotenv
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))
from backend.core.database import SessionLocal, GitIntegration
from backend.core.vault import SecretVault
import subprocess
import shutil

def test():
    with SessionLocal() as db:
        g = db.query(GitIntegration).filter(GitIntegration.repo_url.like("%travel_app%")).first()
        token = SecretVault.decrypt(g.encrypted_token)
        url1 = f"https://x-access-token:{token}@github.com/Abhi12negi34/travel_app.git"
        url2 = f"https://{token}@github.com/Abhi12negi34/travel_app.git"
        
        if os.path.exists("test_repo"):
            shutil.rmtree("test_repo", ignore_errors=True)
            
        print("Cloning repo with url2...")
        res = subprocess.run(["git", "clone", url2, "test_repo"], capture_output=True, text=True)
        print("clone res:", res.returncode, "err:", res.stderr)
        
        print("Creating dummy commit...")
        with open("test_repo/dummy.txt", "w") as f:
            f.write("test")
        
        subprocess.run(["git", "checkout", "-b", "test-push-branch-123"], cwd="test_repo")
        subprocess.run(["git", "add", "dummy.txt"], cwd="test_repo")
        subprocess.run(["git", "commit", "-m", "test push"], cwd="test_repo")
        
        print("Pushing...")
        res2 = subprocess.run(["git", "push", "origin", "test-push-branch-123"], cwd="test_repo", capture_output=True, text=True)
        print("push res:", res2.returncode, "err:", res2.stderr)

if __name__ == '__main__':
    test()
