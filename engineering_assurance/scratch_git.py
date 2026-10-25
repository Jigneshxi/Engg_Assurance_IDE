import sys
import os
import requests
from dotenv import load_dotenv

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

from backend.core.database import SessionLocal, GitIntegration
from backend.core.vault import SecretVault

def check_git():
    with SessionLocal() as db:
        git_configs = db.query(GitIntegration).all()
        for g in git_configs:
            if "travel_app" in g.repo_url:
                token = SecretVault.decrypt(g.encrypted_token)
                print(f"Testing repo permissions: {g.repo_url}")
                url = "https://api.github.com/repos/Abhi12negi34/travel_app"
                headers = {"Authorization": f"token {token}", "Accept": "application/vnd.github.v3+json"}
                response = requests.get(url, headers=headers)
                print(f"Status Code: {response.status_code}")
                if response.status_code == 200:
                    data = response.json()
                    print(f"Permissions: {data.get('permissions')}")
                else:
                    print(f"Response: {response.text}")

if __name__ == "__main__":
    check_git()
