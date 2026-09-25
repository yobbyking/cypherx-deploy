# CypherX — Live Web Console Deploy

Deploy CypherX WhatsApp bot on Render or Railway with a **live web console** — see the bot's console output in real-time and type/paste your session ID directly in the browser.

<h1 align="center">
<img src="https://readme-typing-svg.herokuapp.com?font=Orbitron&size=35&duration=3000&pause=1000&color=00F7FF&center=true&vCenter=true&width=600&lines=CYPHER+X+BOT;Live+Web+Console;Deploy+on+Render/Railway"/>
</h1>

## 🚀 Deploy

### Render
1. New Web Service → connect this repo
2. `render.yaml` auto-detected → Deploy
3. Visit your Render URL → see the live console
4. When the bot asks for SESSION_ID, type/paste it in the input bar

### Railway
1. New Project → Deploy from GitHub → connect this repo
2. `railway.json` auto-detected → Deploy
3. Visit your Railway URL → see the live console
4. Type/paste your session ID in the input bar

## 🖥️ Web Console Features

- **Live console output** — see everything the bot prints (stdout + stderr)
- **Type input** — send text to the bot's stdin (paste session ID, type commands)
- **Auto-reconnect** — if the bot crashes, it auto-restarts after 5s
- **Buffered history** — new connections see the last 500 lines of output
- **Premium dark UI** — cyan/violet theme, JetBrains Mono font, glassmorphism

## 📋 How to Use

1. Open the deploy URL in your browser
2. Wait for the bot to start — you'll see the console output live
3. When it shows "Enter SESSION_ID:" — type/paste your session ID in the input bar at the bottom
4. Press Enter or click Send
5. The bot will connect and you'll see the CONNECTED banner in the console

## 🔑 Getting a Session ID

Visit a CypherX pairing site to get your session ID, then paste it in the web console.

## 📄 License

MIT
