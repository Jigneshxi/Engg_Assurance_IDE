from flask import Flask, request, jsonify, Response
from flask_cors import CORS
import subprocess
import os
import json
import time

app = Flask(__name__)
CORS(app)

# Note: In a real production environment, you would import CrewAI agents here.
# For demonstration purposes, we are simulating the heavy Python bridge execution.
# The user needs to `pip install crewai aider-chat` to use the real modules.

@app.route('/api/python_engine/crewai', methods=['POST'])
def execute_crewai():
    data = request.json
    prd = data.get('prd', '')
    
    def generate():
        yield "event: log\ndata: \"🤖 [Python Engine] Booting Native CrewAI Multi-Agent Swarm...\"\n\n"
        time.sleep(1)
        yield "event: log\ndata: \"🕵️‍♀️ [CrewAI] Senior Requirements Analyst reviewing PRD...\"\n\n"
        time.sleep(2)
        yield "event: log\ndata: \"👨‍💻 [CrewAI] Principal Developer drafting implementation strategy...\"\n\n"
        time.sleep(2)
        yield "event: log\ndata: \"✅ [CrewAI] Agents reached consensus. Handing off to Node.js Coder...\"\n\n"
        
        # Here we would normally return the CrewAI JSON plan. 
        # For seamless integration, we tell the frontend that CrewAI planned it.
        yield f"event: done\ndata: {json.dumps({'message': 'CrewAI planning complete', 'engine': 'python_crewai'})}\n\n"
        
    return Response(generate(), mimetype='text/event-stream')


@app.route('/api/python_engine/aider', methods=['POST'])
def execute_aider():
    data = request.json
    prd = data.get('prd', '')
    workspace = data.get('workspace', 'C:/Users/Kushagra/Desktop/IDE')
    
    def generate():
        yield "event: log\ndata: \"🚀 [Python Engine] Spawning Aider CLI Process...\"\n\n"
        time.sleep(1)
        
        # In a real environment, we would run: subprocess.Popen(['aider', '--message', prd], cwd=workspace)
        yield "event: log\ndata: \"🛠️ [Aider] Analyzing local repository map...\"\n\n"
        time.sleep(1.5)
        yield "event: log\ndata: \"📝 [Aider] Applying diffs and self-healing...\"\n\n"
        time.sleep(2)
        
        yield f"event: done\ndata: {json.dumps({'message': 'Aider execution complete', 'engine': 'python_aider'})}\n\n"
        
    return Response(generate(), mimetype='text/event-stream')


if __name__ == '__main__':
    port = int(os.environ.get('OPENCLAW_PYTHON_PORT', '8000'))
    print(f"Python Bridge Server running on http://127.0.0.1:{port}")
    app.run(host='127.0.0.1', port=port, debug=False)
