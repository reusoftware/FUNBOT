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

// ================= LOAD DATABASE =================
const db = loadBots();

if (!db.bots) db.bots = [];

// ================= LOAD SAVED BOTS =================
for (let bot of db.bots) {

    console.log("Loading childbot:", bot.username);

    try {

        let child = new ChildBot(bot);

        // store config reference
        child.config = bot;

        activeBots.push(child);

    } catch (err) {

        console.log("Failed loading childbot:", err.message);

    }
}

// ================= DEBUG =================
function debug(msg) {

    console.log(msg);

    debugLogs.push(msg);

    if (debugLogs.length > 100) {
        debugLogs.shift();
    }
}

// ================= FRONTEND =================
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
}

button{
    width:100%;
    padding:10px;
    margin-top:10px;
    border:none;
    background:#2196f3;
    color:white;
    cursor:pointer;
}

#status{
    margin-top:10px;
    font-weight:bold;
}

#debug{
    margin-top:15px;
    background:black;
    color:#00ff00;
    height:300px;
    overflow:auto;
    padding:10px;
    font-size:12px;
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

async function login(){

    let user = document.getElementById("user").value;
    let pass = document.getElementById("pass").value;

    document.getElementById("status").innerText = "Connecting...";

    let res = await fetch("/login", {
        method:"POST",
        headers:{
            "Content-Type":"application/json"
        },
        body: JSON.stringify({
            username:user,
            password:pass
        })
    });

    let data = await res.json();

    document.getElementById("status").innerText = data.message;
    document.getElementById("debug").innerText = data.debug.join("\\n");
}

setInterval(async()=>{

    let res = await fetch("/debug");
    let data = await res.json();

    document.getElementById("debug").innerText = data.logs.join("\\n");

},2000);

</script>

</body>
</html>
`);
});

// ================= DEBUG API =================
app.get("/debug", (req, res) => {

    res.json({
        logs: debugLogs
    });

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

// ================= CONNECT MAIN BOT =================
function connectMainBot(res) {

    loginResponse = res;
    loggedIn = false;

    if (mainWS) {

        try {
            mainWS.close();
        } catch {}

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

    // ================= OPEN =================
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

    // ================= MESSAGE =================
    mainWS.on("message", async(raw) => {

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

        // ================= LOGIN RESULT =================
        if (msg.handler === "3rd_login") {

            let ok =
                msg.status === "success" ||
                msg.success === true;

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
        if (msg.handler === "pvt_chat") {

            // incoming format from server
            let message = msg.message || {};

            let sender =
                message.from_username ||
                "";

            let body =
                (message.body || "")
                .trim();

            let messageId =
                message.id || "";

            debug("💬 PM: " + sender + " => " + body);

            // mark seen
            if (messageId) {

                markSeen(messageId);

            }

            // ignore empty
            if (!sender || !body) return;

            // ================= HELP =================
            if (body.toLowerCase() === "help") {

                sendPM(sender,
`🤖 FUNBOT GUIDE

Request Bot:
j/roomname#botid#botpassword

Example:
j/chatfun#bot1#123456

Rules:
✔ only 1 bot per room
✔ bot must be offline
✔ bot joins automatically`);

                return;
            }

            // ================= CREATE BOT =================
            if (body.startsWith("j/")) {

                let p = body.slice(2).split("#");

                if (p.length < 3) {

                    sendPM(sender,
                        "❌ Invalid format\\nUse:\\nj/room#bot#pass"
                    );

                    return;
                }

                let room = p[0].trim();
                let username = p[1].trim();
                let password = p[2].trim();

                // check empty
                if (!room || !username || !password) {

                    sendPM(sender,
                        "❌ Missing room/bot/password"
                    );

                    return;
                }

                // room already taken
                let roomExists =
                    db.bots.find(x => x.room === room) ||
                    activeBots.find(x => x.config?.room === room);

                if (roomExists) {

                    sendPM(sender,
                        "❌ Only 1 bot allowed per room"
                    );

                    return;
                }

                // username already used
                let botExists =
                    db.bots.find(x => x.username === username) ||
                    activeBots.find(x => x.config?.username === username);

                if (botExists) {

                    sendPM(sender,
                        "❌ Bot already online/exist"
                    );

                    return;
                }

                // create config
                let config = {
                    room: room,
                    username: username,
                    password: password,
                    mainMaster: sender,
                    masters: [sender],
                    welcome: true,
                    quiz: true
                };

                db.bots.push(config);

                saveBots(db);

                try {

                    let child = new ChildBot(config);

                    child.config = config;

                    activeBots.push(child);

                    sendPM(sender,
                        "✅ Bot created successfully\\nRoom: " + room
                    );

                    debug("✅ ChildBot created: " + username);

                } catch (err) {

                    debug("❌ ChildBot error: " + err.message);

                    sendPM(sender,
                        "❌ Failed creating childbot"
                    );
                }

                return;
            }
        }

    });

    // ================= ERROR =================
    mainWS.on("error", (err) => {

        debug("❌ WS ERROR: " + err.message);

    });

    // ================= CLOSE =================
    mainWS.on("close", () => {

        debug("🔌 WS CLOSED");

        loggedIn = false;

    });

}

// ================= SEND PM =================
function sendPM(user, text) {

    if (!mainWS || !loggedIn) return;

    let payload = {
        handler: "pvt_chat",
        payload: {
            to_username: user,
            body: text
        }
    };

    debug("📤 SEND PM: " + JSON.stringify(payload));

    mainWS.send(JSON.stringify(payload));

}

// ================= MARK SEEN =================
function markSeen(messageId) {

    if (!mainWS || !loggedIn) return;

    let payload = {
        handler: "pvt_msg_status",
        payload: {
            message_id: messageId,
            status: "seen"
        }
    };

    mainWS.send(JSON.stringify(payload));

}

// ================= START SERVER =================
const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {

    console.log("🚀 FUNBOT RUNNING ON PORT", PORT);

});
