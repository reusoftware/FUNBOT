const express = require("express");
const bodyParser = require("body-parser");
const WebSocket = require("ws");

const ChildBot = require("./childbot");
const { loadBots, saveBots } = require("./storage");

const app = express();

app.use(bodyParser.json());

let mainWS = null;
let loggedIn = false;
let loginResponse = null;

let currentMainBot = null;

let debugLogs = [];

const activeBots = [];

// ================= LOAD DATABASE =================

const db = loadBots();

if (!db.accounts) {
    db.accounts = {};
    saveBots(db);
}

// ================= DEBUG =================

function debug(msg) {

    console.log(msg);

    debugLogs.push(msg);

    if (debugLogs.length > 100) {
        debugLogs.shift();
    }
}

// ================= LOAD SAVED CHILDBOTS =================

function loadSavedBots(owner) {

    let account = db.accounts[owner];

    if (!account) return;

    if (!account.bots) return;

    for (let bot of account.bots) {

        let alreadyOnline =
            activeBots.find(
                x => x.username === bot.username
            );

        if (alreadyOnline) {
            continue;
        }

        try {

            let child = new ChildBot(bot);

            child.config = bot;

            activeBots.push(child);

            debug("♻ Restored childbot: " + bot.username);

        } catch (err) {

            debug("❌ Failed restoring bot: " + err.message);

        }
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

<input id="user" placeholder="Main Bot Username">
<input id="pass" type="password" placeholder="Main Bot Password">

<button onclick="login()">LOGIN</button>

<div id="status"></div>

<pre id="debug"></pre>

</div>

<script>

async function login(){

    let user = document.getElementById("user").value;
    let pass = document.getElementById("pass").value;

    document.getElementById("status").innerText = "Connecting...";

    let res = await fetch("/login",{
        method:"POST",
        headers:{
            "Content-Type":"application/json"
        },
        body:JSON.stringify({
            username:user,
            password:pass
        })
    });

    let data = await res.json();

    document.getElementById("status").innerText =
        data.message;

    document.getElementById("debug").innerText =
        data.debug.join("\\n");
}

setInterval(async()=>{

    let res = await fetch("/debug");

    let data = await res.json();

    document.getElementById("debug").innerText =
        data.logs.join("\\n");

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

// ================= LOGIN =================

app.post("/login", (req, res) => {

    let username = req.body.username;
    let password = req.body.password;

    if (!username || !password) {

        return res.json({
            success:false,
            message:"Missing username/password",
            debug:debugLogs
        });
    }

    currentMainBot = {
        username,
        password
    };

    connectMainBot(res);
});

// ================= CONNECT MAINBOT =================

function connectMainBot(res) {

    loginResponse = res;

    loggedIn = false;

    if (mainWS) {

        try {
            mainWS.close();
        } catch {}
    }

    debug("🔌 Connecting mainbot WS...");

    mainWS = new WebSocket(
        "wss://viberschat.space:8443/server"
    );

    let timeout = setTimeout(() => {

        if (!loggedIn && loginResponse) {

            loginResponse.json({
                success:false,
                message:"Login timeout",
                debug:debugLogs
            });

            loginResponse = null;
        }

    },10000);

    // ================= OPEN =================

    mainWS.on("open", () => {

        debug("✅ MAIN WS CONNECTED");

        mainWS.send(JSON.stringify({
            handler:"3rd_login",
            payload:{
                username:currentMainBot.username,
                password:currentMainBot.password,
                api_key:"xYn86hjOpJk$"
            }
        }));
    });

    // ================= MESSAGE =================

    mainWS.on("message", raw => {

        let msg;

        try {

            msg = JSON.parse(raw);

        } catch {

            return;
        }

        // ================= LOGIN RESULT =================

        if (msg.handler === "3rd_login") {

            let ok =
                msg.status === "success" ||
                msg.success === true;

            if (ok) {

                loggedIn = true;

                clearTimeout(timeout);

                debug("✅ MAINBOT LOGIN SUCCESS");

                // create account if not exists
                if (!db.accounts[currentMainBot.username]) {

                    db.accounts[currentMainBot.username] = {
                        password: currentMainBot.password,
                        bots:[]
                    };

                    saveBots(db);
                }

                // restore saved childbots
                loadSavedBots(currentMainBot.username);

                if (loginResponse) {

                    loginResponse.json({
                        success:true,
                        message:"Login successful",
                        debug:debugLogs
                    });

                    loginResponse = null;
                }

            } else {

                if (loginResponse) {

                    loginResponse.json({
                        success:false,
                        message:"Login failed",
                        debug:debugLogs
                    });

                    loginResponse = null;
                }
            }

            return;
        }

        if (!loggedIn) return;

        // ================= PRIVATE CHAT =================

        if (msg.handler === "pvt_chat") {

            let message = msg.message || {};

            let sender =
                message.from_username || "";

            let body =
                (message.body || "").trim();

            let messageId =
                message.id || "";

            if (messageId) {
                markSeen(messageId);
            }

            if (!sender || !body) return;

            debug("💬 PM: " + sender + " => " + body);

            // ================= HELP =================

            if (body.toLowerCase() === "help") {

                sendPM(sender,
`🤖 FUNBOT COMMANDS

Create Bot:
j/room#bot#pass

Example:
j/funroom#bot1#123456`);

                return;
            }

            // ================= CREATE BOT =================

            if (body.startsWith("j/")) {

                let p =
                    body.slice(2).split("#");

                if (p.length < 3) {

                    sendPM(
                        sender,
                        "❌ Invalid format"
                    );

                    return;
                }

                let room =
                    p[0].trim();

                let username =
                    p[1].trim();

                let password =
                    p[2].trim();

                // duplicate room
                let roomExist =
                    activeBots.find(
                        x => x.room === room
                    );

                if (roomExist) {

                    sendPM(
                        sender,
                        "❌ Room already has bot"
                    );

                    return;
                }

                // duplicate username
                let userExist =
                    activeBots.find(
                        x => x.username === username
                    );

                if (userExist) {

                    sendPM(
                        sender,
                        "❌ Bot already online"
                    );

                    return;
                }

                let config = {

                    owner:
                        currentMainBot.username,

                    room: room,

                    username: username,

                    password: password,

                    mainMaster: sender,

                    masters: [sender],

                    settings: {

                        welcome: true,
                        quiz: true,
                        cricket: false
                    },

                    cricket: {

                        runs: 0,
                        wickets: 0,
                        overs: 0
                    }
                };

                try {

                    let child =
                        new ChildBot(config);

                    child.config = config;

                    activeBots.push(child);

                    db.accounts[
                        currentMainBot.username
                    ].bots.push(config);

                    saveBots(db);

                    sendPM(sender,
`✅ Childbot created

Room: ${room}
Bot: ${username}`);

                    debug(
                        "✅ Created childbot: " +
                        username
                    );

                } catch (err) {

                    debug(err.message);

                    sendPM(
                        sender,
                        "❌ Failed creating bot"
                    );
                }
            }
        }
    });

    // ================= ERROR =================

    mainWS.on("error", err => {

        debug(
            "❌ MAIN WS ERROR: " +
            err.message
        );

    });

    // ================= CLOSE =================

    mainWS.on("close", () => {

        loggedIn = false;

        debug("🔌 MAIN WS CLOSED");

    });
}

// ================= SEND PM =================

function sendPM(user, text) {

    if (!mainWS || !loggedIn) return;

    mainWS.send(JSON.stringify({

        handler:"pvt_chat",

        payload:{
            to_username:user,
            body:text
        }
    }));
}

// ================= MARK SEEN =================

function markSeen(messageId) {

    if (!mainWS || !loggedIn) return;

    mainWS.send(JSON.stringify({

        handler:"pvt_msg_status",

        payload:{
            message_id:messageId,
            status:"seen"
        }
    }));
}

// ================= START =================

const PORT =
    process.env.PORT || 8080;

app.listen(PORT, () => {

    console.log(
        "🚀 FUNBOT RUNNING ON PORT",
        PORT
    );

});
