const express = require("express");
const bodyParser = require("body-parser");
const WebSocket = require("ws");

const ChildBot = require("./childbot");
const { loadBots, saveBots } = require("./storage");

const app = express();
app.use(bodyParser.json());

let MAIN_USERNAME = "";
let MAIN_PASSWORD = "";

let mainWS = null;
let loggedIn = false;

let loginResponse = null;
let debugLogs = [];

const activeBots = [];

// ================= LOAD BOTS =================
const db = loadBots();

for (let bot of db.bots || []) {
    console.log("Loading childbot:", bot.username);
    activeBots.push(new ChildBot(bot));
}

// ================= DEBUG HELPER =================
function debug(msg) {
    console.log(msg);
    debugLogs.push(msg);

    if (debugLogs.length > 50) debugLogs.shift();
}

// ================= FRONTEND =================
app.get("/", (req, res) => {
    res.send(`
<!DOCTYPE html>
<html>
<head>
<title>FUNBOT LOGIN</title>

<style>
body{font-family:Arial;background:#f5f5f5;padding:30px}
.box{background:white;padding:20px;border-radius:10px;max-width:500px;margin:auto}
input{width:100%;padding:10px;margin-top:10px}
button{margin-top:10px;padding:10px;width:100%;background:#2196f3;color:white;border:none}
#status{margin-top:10px;font-weight:bold}
#debug{margin-top:15px;background:black;color:#00ff00;height:250px;overflow:auto;padding:10px;font-size:12px}
</style>
</head>

<body>

<div class="box">
<h2>🤖 FUNBOT LOGIN</h2>

<input id="user" placeholder="Username">
<input id="pass" type="password" placeholder="Password">

<button onclick="login()">LOGIN</button>

<div id="status"></div>
<pre id="debug"></pre>
</div>

<script>

async function login(){

    let user = document.getElementById("user").value;
    let pass = document.getElementById("pass").value;

    document.getElementById("status").innerText = "Connecting...";

    let res = await fetch("/login", {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ username:user, password:pass })
    });

    let data = await res.json();

    document.getElementById("status").innerText = data.message;
    document.getElementById("debug").innerText = data.debug.join("\\n");
}

// auto refresh debug
setInterval(async () => {
    let res = await fetch("/debug");
    let data = await res.json();
    document.getElementById("debug").innerText = data.logs.join("\\n");
}, 2000);

</script>

</body>
</html>
`);
});

// ================= DEBUG API =================
app.get("/debug", (req, res) => {
    res.json({ logs: debugLogs });
});

// ================= LOGIN API =================
app.post("/login", (req, res) => {

    MAIN_USERNAME = req.body.username;
    MAIN_PASSWORD = req.body.password;

    debug("➡ Login request received");

    if (!MAIN_USERNAME || !MAIN_PASSWORD) {
        return res.json({
            success: false,
            message: "Missing credentials",
            debug: debugLogs
        });
    }

    connectMainBot(res);
});

// ================= CONNECT BOT =================
function connectMainBot(res) {

    loginResponse = res;
    loggedIn = false;

    if (mainWS) {
        try { mainWS.close(); } catch {}
    }

    debug("🔌 Connecting WebSocket...");

    mainWS = new WebSocket("wss://viberschat.space:8443/server");

    let timeout = setTimeout(() => {
        if (!loggedIn && loginResponse) {
            debug("⛔ LOGIN TIMEOUT");

            loginResponse.json({
                success: false,
                message: "Login timeout",
                debug: debugLogs
            });

            loginResponse = null;
        }
    }, 10000);

    mainWS.on("open", () => {

        debug("✅ WS CONNECTED");

        let payload = {
            handler: "3rd_login",
            payload: {
                username: MAIN_USERNAME,
                password: MAIN_PASSWORD,
                api_key: "xYn86hjOpJk$"
            }
        };

        debug("➡ Sending login payload");
        debug(JSON.stringify(payload));

        mainWS.send(JSON.stringify(payload));
    });

    mainWS.on("message", (raw) => {

        let text = raw.toString();
        debug("📩 RAW: " + text);

        let msg;
        try {
            msg = JSON.parse(text);
        } catch {
            debug("❌ JSON PARSE FAIL");
            return;
        }

        debug("📦 PARSED: " + JSON.stringify(msg));

        // ================= LOGIN CHECK (FIXED LOGIC) =================
        if (msg.handler === "3rd_login") {

            let ok =
                msg.status === "success" ||
                msg.success === true ||
                (msg.message || "").toLowerCase().includes("success");

            if (ok) {

                loggedIn = true;
                clearTimeout(timeout);

                debug("✅ LOGIN SUCCESS");

                if (loginResponse) {
                    loginResponse.json({
                        success: true,
                        message: "Login successful",
                        debug: debugLogs
                    });
                    loginResponse = null;
                }

            } else {

                debug("❌ LOGIN FAILED");

                if (loginResponse) {
                    loginResponse.json({
                        success: false,
                        message: "Login failed",
                        debug: debugLogs
                    });
                    loginResponse = null;
                }
            }

            return;
        }

        if (!loggedIn) return;

        // ================= PRIVATE MESSAGE =================
        if (msg.handler !== "pvt_chat") return;

        let sender = msg.sender || msg.message?.sender || "";
        let body = (msg.body || msg.message?.body || "").trim();

        debug("💬 PM: " + sender + " => " + body);

        if (body.toLowerCase() === "help") {

            sendPM(sender, `🤖 FUNBOT GUIDE

j/room#bot#pass
Example:
j/funroom#bot1#123456`);
            return;
        }

        if (body.startsWith("j/")) {

            let p = body.slice(2).split("#");
            if (p.length < 3) return;

            let room = p[0];
            let username = p[1];
            let password = p[2];

            if (db.bots.find(x => x.room === room)) return sendPM(sender, "Room exists");
            if (db.bots.find(x => x.username === username)) return sendPM(sender, "User exists");

            let config = {
                room,
                username,
                password,
                mainMaster: sender,
                masters: [sender],
                quiz: true,
                welcome: true
            };

            db.bots.push(config);
            saveBots(db);

            activeBots.push(new ChildBot(config));

            sendPM(sender, `Bot created: ${username}`);
        }
    });

    mainWS.on("error", (e) => {
        debug("WS ERROR: " + e.message);
    });

    mainWS.on("close", () => {
        debug("🔌 WS CLOSED");
        loggedIn = false;
    });
}

// ================= SEND PM =================
function sendPM(user, text) {
    if (!mainWS) return;

    mainWS.send(JSON.stringify({
        handler: "pvt_chat",
        payload: {
            username: user,
            body: text
        }
    }));
}

// ================= START SERVER =================
const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
    console.log("🚀 FUNBOT RUNNING ON", PORT);
});
