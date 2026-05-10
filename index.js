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

const activeBots = [];

// ================= LOAD SAVED BOTS =================
const db = loadBots();

for (let bot of db.bots || []) {
    console.log("Loading childbot:", bot.username);
    activeBots.push(new ChildBot(bot));
}

// ================= UI =================
app.get("/", (req, res) => {
    res.send(`
<!DOCTYPE html>
<html>
<head>
<title>FUNBOT LOGIN</title>

<style>
body{
    font-family:Arial;
    background:#f5f5f5;
    padding:30px;
}

.box{
    background:white;
    padding:20px;
    border-radius:10px;
    max-width:500px;
    margin:auto;
}

input{
    width:100%;
    padding:10px;
    margin-top:10px;
    box-sizing:border-box;
}

button{
    margin-top:10px;
    padding:10px;
    width:100%;
    background:#2196f3;
    color:white;
    border:none;
}

#status{
    margin-top:10px;
    font-weight:bold;
}

#debug{
    margin-top:15px;
    background:black;
    color:#00ff00;
    height:250px;
    overflow:auto;
    padding:10px;
    font-size:12px;
    white-space:pre-wrap;
}
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

function log(t){
    let d = document.getElementById("debug");
    d.innerText += t + "\\n";
    d.scrollTop = d.scrollHeight;
}

async function login(){

    let user = document.getElementById("user").value;
    let pass = document.getElementById("pass").value;

    document.getElementById("status").innerText = "Connecting...";

    log("➡ Sending login request");

    let res = await fetch("/login", {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ username:user, password:pass })
    });

    let data = await res.json();

    log("📦 RESPONSE:");
    log(JSON.stringify(data, null, 2));

    document.getElementById("status").innerText = data.message;
}

</script>

</body>
</html>
`);
});

// ================= LOGIN API =================
app.post("/login", (req, res) => {

    MAIN_USERNAME = req.body.username;
    MAIN_PASSWORD = req.body.password;

    if (!MAIN_USERNAME || !MAIN_PASSWORD) {
        return res.json({
            success: false,
            message: "Missing username/password"
        });
    }

    connectMainBot(res);
});

// ================= CONNECT MAIN BOT =================
function connectMainBot(res) {

    loginResponse = res;
    loggedIn = false;

    if (mainWS) mainWS.close();

    mainWS = new WebSocket("wss://viberschat.space:8443/server");

    // ================= OPEN =================
    mainWS.on("open", () => {

        console.log("🔌 WebSocket Connected");

        const loginPayload = {
            handler: "3rd_login",
            payload: {
                username: MAIN_USERNAME,
                password: MAIN_PASSWORD,
                api_key: "xYn86hjOpJk$"
            }
        };

        console.log("➡ Sending login:", loginPayload);

        mainWS.send(JSON.stringify(loginPayload));
    });

    // ================= MESSAGE (ONLY ONCE - FIXED) =================
    mainWS.on("message", (raw) => {

        const text = raw.toString();
        console.log("📩 RAW:", text);

        if (loginResponse) {
            loginResponse.write?.("RAW: " + text + "\n");
        }

        let msg;
        try {
            msg = JSON.parse(text);
        } catch (e) {
            console.log("❌ JSON ERROR");
            return;
        }

        console.log("📦 PARSED:", msg);

        // ================= LOGIN CHECK (MORE RELIABLE) =================
        if (msg.handler === "3rd_login") {

            const ok =
                msg.status === "success" ||
                msg.success === true ||
                msg.message?.toLowerCase?.().includes("success");

            if (ok) {

                loggedIn = true;

                console.log("✅ LOGIN SUCCESS");

                if (loginResponse) {
                    loginResponse.json({
                        success: true,
                        message: "✅ Login successful"
                    });
                    loginResponse = null;
                }

            } else {

                console.log("❌ LOGIN FAILED");

                if (loginResponse) {
                    loginResponse.json({
                        success: false,
                        message: "❌ Login failed (check credentials)"
                    });
                    loginResponse = null;
                }
            }

            return;
        }

        if (!loggedIn) return;

        // ================= PRIVATE MESSAGE =================
        if (msg.handler !== "private_msg") return;

        let sender = msg.sender || msg.message?.sender || "";
        let body = (msg.body || msg.message?.body || "").trim();

        console.log("💬 PM:", sender, body);

        // ================= HELP =================
        if (body.toLowerCase() === "help") {

            sendPM(sender, `🤖 FUNBOT GUIDE

Create bot:
j/room#bot#pass

Example:
j/funroom#bot1#123456`);

            return;
        }

        // ================= CREATE BOT =================
        if (body.startsWith("j/")) {

            let p = body.slice(2).split("#");
            if (p.length < 3) return;

            let room = p[0];
            let username = p[1];
            let password = p[2];

            if (db.bots.find(x => x.room === room)) {
                sendPM(sender, "❌ Room already has bot");
                return;
            }

            if (db.bots.find(x => x.username === username)) {
                sendPM(sender, "❌ Username exists");
                return;
            }

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

            sendPM(sender, `✅ Bot created: ${username}`);
        }
    });

    mainWS.on("error", (e) => {
        console.log("WS ERROR:", e.message);
    });

    mainWS.on("close", () => {
        console.log("🔌 WebSocket Closed");
        loggedIn = false;
    });
}

// ================= SEND PM =================
function sendPM(user, text) {
    if (!mainWS) return;

    mainWS.send(JSON.stringify({
        handler: "private_msg",
        payload: {
            username: user,
            body: text
        }
    }));
}

// ================= START =================
const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
    console.log("🚀 FUNBOT RUNNING ON", PORT);
});
