/**
 * CypherX — Web Console Wrapper
 * 
 * Starts the bot (index.js) as a child process and streams its console
 * output to a web UI via WebSocket. User can type in the web terminal
 * to send input to the bot (e.g. paste a session ID).
 */

'use strict';

const { spawn } = require('child_process');
const express = require('express');
const cors = require('cors');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

// Store all console output for late connections
const consoleBuffer = [];
const MAX_BUFFER = 500;

// WebSocket connections
const clients = new Set();

// Start the bot as a child process
let botProcess = null;
let botStartTime = null;

function startBot() {
  botStartTime = Date.now();
  console.log('[WRAPPER] Starting CypherX bot...');
  
  botProcess = spawn('node', ['index.js'], {
    cwd: __dirname,
    env: { ...process.env, FORCE_COLOR: '1' },
    stdio: ['pipe', 'pipe', 'pipe']
  });

  // Stream stdout
  botProcess.stdout.on('data', (data) => {
    const text = data.toString();
    consoleBuffer.push({ type: 'stdout', text, ts: Date.now() });
    if (consoleBuffer.length > MAX_BUFFER) consoleBuffer.shift();
    broadcast({ type: 'stdout', text });
  });

  // Stream stderr
  botProcess.stderr.on('data', (data) => {
    const text = data.toString();
    consoleBuffer.push({ type: 'stderr', text, ts: Date.now() });
    if (consoleBuffer.length > MAX_BUFFER) consoleBuffer.shift();
    broadcast({ type: 'stderr', text });
  });

  botProcess.on('exit', (code, signal) => {
    const text = `\n[BOT] Process exited with code ${code} signal ${signal}\n`;
    consoleBuffer.push({ type: 'exit', text, ts: Date.now() });
    broadcast({ type: 'exit', text, code });
    console.log('[WRAPPER] Bot exited:', code, signal);
    
    // Auto-restart after 5s
    setTimeout(() => {
      console.log('[WRAPPER] Auto-restarting bot...');
      startBot();
    }, 5000);
  });
}

function broadcast(msg) {
  const data = JSON.stringify(msg);
  for (const ws of clients) {
    if (ws.readyState === 1) {
      ws.send(data);
    }
  }
}

// Routes
app.get('/health', (req, res) => {
  res.json({ 
    ok: true, 
    botRunning: botProcess !== null,
    uptime: botStartTime ? Date.now() - botStartTime : 0,
    clients: clients.size 
  });
});

// Web UI
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>CypherX — Live Console</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--bg:#02030a;--cyan:#00f0ff;--violet:#a855f7;--green:#00ff9d;--red:#ff4d6d;--muted:#6f7c8d}
body{background:var(--bg);color:#e8f7ff;font-family:'JetBrains Mono','Courier New',monospace;height:100vh;overflow:hidden}
.bg{position:fixed;inset:0;z-index:0;background:radial-gradient(circle at 20% 20%,rgba(168,85,247,.15),transparent 50%),radial-gradient(circle at 80% 80%,rgba(0,240,255,.12),transparent 50%),var(--bg)}
.header{position:fixed;top:0;left:0;right:0;z-index:10;background:rgba(2,3,10,.9);border-bottom:1px solid rgba(0,240,255,.2);padding:12px 20px;display:flex;align-items:center;justify-content:space-between}
.header h1{font-size:18px;font-weight:700;background:linear-gradient(135deg,var(--cyan),var(--violet));-webkit-background-clip:text;background-clip:text;color:transparent}
.status{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--muted)}
.status .dot{width:8px;height:8px;border-radius:50%;background:var(--green);box-shadow:0 0 10px var(--green);animation:pulse 1.5s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
#console{position:fixed;top:50px;left:0;right:0;bottom:50px;z-index:5;overflow-y:auto;padding:12px;font-size:13px;line-height:1.5;white-space:pre-wrap;word-break:break-all}
.line{padding:1px 0}
.line.stderr{color:var(--red)}
.line.stdout{color:#e8f7ff}
.line.exit{color:var(--violet);font-weight:bold}
.line.system{color:var(--cyan)}
.input-bar{position:fixed;bottom:0;left:0;right:0;z-index:10;background:rgba(2,3,10,.9);border-top:1px solid rgba(0,240,255,.2);padding:10px 20px;display:flex;gap:10px}
.input-bar input{flex:1;background:rgba(10,10,20,.8);border:1px solid rgba(168,85,247,.3);border-radius:8px;padding:10px 14px;color:#e8f7ff;font-family:inherit;font-size:13px;outline:none}
.input-bar input:focus{border-color:var(--cyan);box-shadow:0 0 12px rgba(0,240,255,.2)}
.input-bar button{background:linear-gradient(135deg,var(--cyan),var(--violet));border:none;border-radius:8px;padding:10px 20px;color:#02030a;font-weight:700;font-size:13px;cursor:pointer;text-transform:uppercase;letter-spacing:.05em}
.input-bar button:hover{filter:brightness(1.15)}
.footer{position:fixed;bottom:50px;left:0;right:0;text-align:center;font-size:10px;color:var(--muted);padding:4px;z-index:9;pointer-events:none}
</style>
</head>
<body>
<div class="bg"></div>
<div class="header">
  <h1>CypherX</h1>
  <div class="status"><span class="dot"></span><span id="status-text">Connecting...</span></div>
</div>
<div id="console"></div>
<div class="footer">Powered by CypherX · Live Console</div>
<div class="input-bar">
  <input id="input" type="text" placeholder="Type or paste session ID here..." autocomplete="off">
  <button id="send">Send</button>
</div>
<script>
const consoleEl=document.getElementById('console');
const inputEl=document.getElementById('input');
const sendBtn=document.getElementById('send');
const statusText=document.getElementById('status-text');
const wsUrl=(location.protocol==='https:'?'wss://':'ws://')+location.host+'/ws';
const ws=new WebSocket(wsUrl);
ws.onopen=()=>{statusText.textContent='Live';statusText.style.color='var(--green)'};
ws.onclose=()=>{statusText.textContent='Disconnected';statusText.style.color='var(--red)'};
ws.onmessage=(e)=>{
  try{
    const msg=JSON.parse(e.data);
    const div=document.createElement('div');
    div.className='line '+(msg.type||'system');
    div.textContent=msg.text||'';
    consoleEl.appendChild(div);
    consoleEl.scrollTop=consoleEl.scrollHeight;
  }catch{}
};
function send(){
  const text=inputEl.value;
  if(!text)return;
  ws.send(JSON.stringify({type:'input',text:text+'\\n'}));
  const div=document.createElement('div');
  div.className='line system';
  div.textContent='> '+text;
  consoleEl.appendChild(div);
  consoleEl.scrollTop=consoleEl.scrollHeight;
  inputEl.value='';
}
sendBtn.onclick=send;
inputEl.onkeydown=(e)=>{if(e.key==='Enter')send()};
</script>
</body>
</html>`);
});

// WebSocket server
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log('[WRAPPER] WebSocket client connected, sending', consoleBuffer.length, 'buffered lines');
  
  // Send buffered output
  for (const line of consoleBuffer) {
    ws.send(JSON.stringify(line));
  }
  
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'input' && botProcess && botProcess.stdin.writable) {
        botProcess.stdin.write(msg.text);
      }
    } catch {}
  });
  
  ws.on('close', () => {
    clients.delete(ws);
  });
});

// Start everything
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[WRAPPER] CypherX Console on :${PORT}`);
  console.log(`[WRAPPER] Web UI: http://0.0.0.0:${PORT}/`);
  console.log(`[WRAPPER] WebSocket: ws://0.0.0.0:${PORT}/ws`);
  console.log(`[WRAPPER] Health: http://0.0.0.0:${PORT}/health`);
  startBot();
});

process.on('SIGTERM', () => {
  if (botProcess) botProcess.kill('SIGTERM');
  server.close();
  process.exit(0);
});
process.on('SIGINT', () => {
  if (botProcess) botProcess.kill('SIGINT');
  server.close();
  process.exit(0);
});
