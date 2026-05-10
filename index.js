const WebSocket = require("ws");
const ChildBot = require("./childbot");
const { loadBots, saveBots } = require("./storage");

const express = require("express");
const path = require("path");

const app = express();

app.use(express.json());
app.use(express.static("public"));

const PORT = process.env.PORT || 8080;

// ================= MAIN BOT LOGIN =================
let MAIN_USERNAME = "";
let MAIN_PASSWORD = "";

let ws;

// ================= ACTIVE BOTS =================
const activeBots = [];

// ================= LOAD DATABASE =================
const db = loadBots();

// ================= AUTO LOAD CHILD BOTS =================
for(let bot of db.bots){

    console.log("Loading childbot:", bot.username);

    activeBots.push(new ChildBot(bot));
}

// ================= WEB PAGE =================
app.get("/", (req,res)=>{
    res.sendFile(path.join(__dirname,"public","index.html"));
});

// ================= LOGIN API =================
app.post("/login", (req,res)=>{

    MAIN_USERNAME = req.body.username;
    MAIN_PASSWORD = req.body.password;

    startMainBot();

    res.json({
        success:true
    });
});

// ================= START SERVER =================
app.listen(PORT, ()=>{
    console.log("Web server running on " + PORT);
});

// ================= MAIN BOT FUNCTION =================
function startMainBot(){

    // prevent duplicate connect
    if(ws){
        try{ ws.close(); }catch{}
    }

    ws = new WebSocket("wss://viberschat.space:8443/server");

    ws.on("open", ()=>{

        console.log("MainBot connected");

        ws.send(JSON.stringify({
            handler:"3rd_login",
            payload:{
                username:MAIN_USERNAME,
                password:MAIN_PASSWORD,
                api_key:"xYn86hjOpJk$"
            }
        }));
    });

    // ================= RECEIVE =================
    ws.on("message", raw => {

        let msg;

        try{
            msg = JSON.parse(raw);
        }catch{
            return;
        }

        // ================= LOGIN SUCCESS =================
        if(msg.handler === "3rd_login"){

            console.log("MainBot login success");
            return;
        }

        // ================= ONLY PRIVATE =================
        if(msg.handler !== "private_msg") return;

        let body = (msg.body || "").trim();

        // ================= HELP =================
        if(body.toLowerCase() === "help"){

            ws.send(JSON.stringify({
                handler:"private_msg",
                payload:{
                    username:msg.sender,
                    body:
`🤖 FUNBOT GUIDE

Create childbot:

j/roomname#childbotusername#childbotpassword

Example:

j/chatfun#funbot1#123456

FEATURES:
✅ Auto Join Room
✅ Welcome Greeting
✅ Fun Quiz
✅ Trivia
✅ Guess Number
✅ Word Game
✅ Auto Reconnect`
                }
            }));

            return;
        }

        // ================= CREATE BOT =================
        if(body.startsWith("j/")){

            let parts = body.substring(2).split("#");

            if(parts.length < 3){

                ws.send(JSON.stringify({
                    handler:"private_msg",
                    payload:{
                        username:msg.sender,
                        body:"❌ Invalid format"
                    }
                }));

                return;
            }

            let room = parts[0].trim();
            let username = parts[1].trim();
            let password = parts[2].trim();

            // ================= ROOM CHECK =================
            let roomExist = db.bots.find(x => x.room === room);

            if(roomExist){

                ws.send(JSON.stringify({
                    handler:"private_msg",
                    payload:{
                        username:msg.sender,
                        body:"❌ Room already has childbot"
                    }
                }));

                return;
            }

            // ================= USER CHECK =================
            let userExist = db.bots.find(x => x.username === username);

            if(userExist){

                ws.send(JSON.stringify({
                    handler:"private_msg",
                    payload:{
                        username:msg.sender,
                        body:"❌ Username already exists"
                    }
                }));

                return;
            }

            // ================= CONFIG =================
            let config = {

                room: room,
                username: username,
                password: password,

                mainMaster: msg.sender,
                masters: [msg.sender],

                welcome: true,
                quiz: true
            };

            // ================= SAVE =================
            db.bots.push(config);

            saveBots(db);

            // ================= START CHILD =================
            activeBots.push(new ChildBot(config));

            // ================= SUCCESS =================
            ws.send(JSON.stringify({
                handler:"private_msg",
                payload:{
                    username:msg.sender,
                    body:
`✅ CHILD BOT CREATED

🤖 Username: ${username}
🏠 Room: ${room}

FEATURES:
✅ Auto Join
✅ Welcome Greeting
✅ Quiz Activated
✅ Auto Reconnect`
                }
            }));
        }
    });

    // ================= RECONNECT =================
    ws.on("close", ()=>{

        console.log("MainBot reconnecting...");

        setTimeout(()=>{
            startMainBot();
        },5000);
    });

    // ================= ERROR =================
    ws.on("error", err=>{
        console.log("MainBot error:", err.message);
    });
}
