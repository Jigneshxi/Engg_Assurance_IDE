import fs from 'fs';
import path from 'path';

const logFile = 'C:\\Users\\VVNT SeQuor\\.gemini\\antigravity-ide\\brain\\0bf1cc9a-58c5-44ad-bc20-127ee0966019\\.system_generated\\logs\\transcript.jsonl';
const targetDir = 'D:\\Jignesh\\VVnT AI Coding Agent_test_10\\docs\\Jignesh Agent Chats\\17-10-2026 Agent Chats';

if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

const lines = fs.readFileSync(logFile, 'utf8').split('\n');

let fullDialogue = '# Full Chronological Dialogue Transcript — 17-10-2026\n\n' +
  '**Workspace:** `d:/Jignesh/VVnT AI Coding Agent_test_10`  \n' +
  '**Session ID:** `0bf1cc9a-58c5-44ad-bc20-127ee0966019`  \n' +
  '**Date:** 17-10-2026 (09:28:52 – Present)  \n\n---\n\n';

let count = 0;
for (const line of lines) {
  if (!line.trim()) continue;
  try {
    const obj = JSON.parse(line);
    const time = obj.created_at || '';
    if (obj.type === 'USER_INPUT') {
      const match = obj.content ? obj.content.match(/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/) : null;
      const text = match ? match[1].trim() : (obj.content || '').trim();
      count++;
      fullDialogue += `### 👤 [${time}] User Request #${count}\n\n\`\`\`text\n${text}\n\`\`\`\n\n`;
    } else if (obj.source === 'MODEL' && obj.type === 'PLANNER_RESPONSE' && obj.content && obj.content.trim()) {
      fullDialogue += `### 🤖 [${time}] Agent Response\n\n${obj.content.trim()}\n\n---\n\n`;
    }
  } catch (e) {}
}

const dialoguePath = path.join(targetDir, '00_full_dialogue_transcript_17-10-2026.md');
fs.writeFileSync(dialoguePath, fullDialogue, 'utf8');
console.log('Successfully wrote dialogue transcript:', dialoguePath, 'Bytes:', fs.statSync(dialoguePath).size);
