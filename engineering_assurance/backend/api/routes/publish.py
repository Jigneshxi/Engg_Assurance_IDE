"""
PUBLISHING SYSTEM
External Export logic for pushing generated plans to Confluence.
"""
import logging
import requests
import markdown
from fastapi import APIRouter, HTTPException, Depends
from backend.api.models import PublishRequest

from backend.api.routes.auth import get_current_user
from backend.core.auth_models import User

router = APIRouter(prefix="/api/publish", tags=["Export Systems"])
logger = logging.getLogger(__name__)

@router.post("/confluence")
async def push_to_confluence(req: PublishRequest, current_user: User = Depends(get_current_user)):
    """
    ACTION: PUBLISH ARTIFACT TO WIKI
    Logic: 
    1. MD Translation: Converts generated test plan markdown into XHTML.
    2. Payload Construction: Builds the Confluence storage format JSON.
    3. Auth Workflow: Uses PAT/Email Basic Auth for secure transmission.
    4. Feedback: Returns the final URL of the created page.
    """
    try:
        # Action: Markdown to XHTML conversion.
        html_content = markdown.markdown(req.markdown_content)
        
        # Identity Mapping.
        base_url = req.confluence_url.rstrip('/')
        endpoint = f"{base_url}/rest/api/content"
        auth = (req.connection.email, req.connection.token)
        
        # Logic: Confluence Storage Format encapsulation.
        payload = {
            "type": "page",
            "title": req.title,
            "space": { "key": req.space_key.upper() },
            "body": { 
                "storage": { 
                    "value": html_content, 
                    "representation": "storage" 
                } 
            }
        }
        
        # Action: Secure content push.
        res = requests.post(endpoint, json=payload, auth=auth, timeout=18)
        
        if res.status_code in [200, 201]:
            result = res.json()
            return {"url": f"{base_url}/spaces/{req.space_key}/pages/{result.get('id')}"}
        else:
            msg = res.json().get("message", "Internal Confluence Error")
            raise HTTPException(status_code=res.status_code, detail=f"External Publishing Error: {msg}")
            
    except Exception as e:
        logger.error(f"[PUBLISH] Confluence failure: {e}")
        raise HTTPException(status_code=500, detail=str(e))
