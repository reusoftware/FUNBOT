const express = require("express");
const bodyParser = require("body-parser");
const WebSocket = require("ws");

const ChildBot = require("./childbot");
const { loadBots, saveBots } = require("./storage");

const app = express();

app.use(bodyParser.urlencoded({ extended:true }));
app.use(bodyParser.json());

let MAIN_USERNAME = "";
let MAIN_PASSWORD = "";

let mainWS = null;
let loggedIn = false;

const activeBots = [];

// ================= LOAD SAVED CHILDBOTS =================
const db = loadBots();

for(let bot of db.bots || []){

    console.log("Loading childbot:", bot.username);

    activeBots.push(new ChildBot(bot));
}

// ================= HTML PAGE =================
app.get("/", (req,res)=>{

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
    max-width:400px;
    margin:auto;
}

input{
    width:100%;
    padding:10px;
    margin-top:10px;
}

button{
    margin-top:10px;
    padding:10px;
    width:100%;
    background:#2196f3;
    color:white;
    border:none;
    cursor:pointer;
}

#status{
    margin-top:15px;
    font-weight:bold;
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

</div>

<script>

async function login(){

    let user = document.getElementById("user").value;
    let pass = document.getElementById("pass").value;

    document.getElementById("status").innerHTML = "Connecting...";

    try{

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

        document.getElementById("status").innerHTML = data.message;

    }catch(err){

        document.getElementById("status").innerHTML = "Server error";

    }
}
</script>

</body>
</html>
`);
});

// ================= LOGIN API =================
app.post("/login",(req,res)=>{

    MAIN_USERNAME = req.body.username;
    MAIN_PASSWORD = req.body.password;

    if(!MAIN_USERNAME || !MAIN_PASSWORD){

        return res.json({
            success:false,
            message:"Missing username/password"
        });
    }

    connectMainBot(res);
});

// ================= MAIN BOT CONNECT =================
function connectMainBot(res){

    if(mainWS){
        try{
            mainWS.close();
        }catch{}
    }

    loggedIn = false;

    mainWS = new WebSocket("wss://viberschat.space:8443/server");

    mainWS.on("open",()=>{

        console.log("Connecting mainbot...");

        mainWS.send(JSON.stringify({
            handler:"3rd_login",
            payload:{
                username:MAIN_USERNAME,
                password:MAIN_PASSWORD,
                api_key:"xYn86hjOpJk$"
            }
        }));
    });

    mainWS.on("message",(raw)=>{

        let msg;

        try{
            msg = JSON.parse(raw);
        }catch{
            return;
        }

        // ================= LOGIN SUCCESS =================
        if(msg.handler === "3rd_login"){

            loggedIn = true;

            console.log("MainBot logged in");

            if(res){

                res.json({
                    success:true,
                    message:"✅ Login successful"
                });

                res = null;
            }
        }

        // ================= PRIVATE MESSAGE =================
        if(msg.handler === "private_msg"){

            let body = msg.body || "";

            // ================= HELP =================
            if(body.toLowerCase() === "help"){

                mainWS.send(JSON.stringify({
                    handler:"private_msg",
                    payload:{
                        username:msg.sender,
                        body:
`🤖 FUNBOT GUIDE

Create childbot:
j/roomname#botusername#botpassword

Example:
j/funroom#quizbot1#123456

Features:
✅ Auto welcome
✅ Auto quiz
✅ Saved settings
✅ Auto reconnect`
                    }
                }));

                return;
            }

            // ================= CREATE CHILDBOT =================
            if(body.startsWith("j/")){

                let parts = body.substring(2).split("#");

                if(parts.length < 3){

                    mainWS.send(JSON.stringify({
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

                // ROOM CHECK
                let roomExist = db.bots.find(x=>x.room===room);

                if(roomExist){

                    mainWS.send(JSON.stringify({
                        handler:"private_msg",
                        payload:{
                            username:msg.sender,
                            body:"❌ Room already has childbot"
                        }
                    }));

                    return;
                }

                // USER CHECK
                let userExist = db.bots.find(x=>x.username===username);

                if(userExist){

                    mainWS.send(JSON.stringify({
                        handler:"private_msg",
                        payload:{
                            username:msg.sender,
                            body:"❌ Childbot username already exists"
                        }
                    }));

                    return;
                }

                let config = {
                    room,
                    username,
                    password,
                    mainMaster:msg.sender,
                    masters:[msg.sender],
                    quiz:true,
                    welcome:true
                };

                db.bots.push(config);

                saveBots(db);

                activeBots.push(new ChildBot(config));

                mainWS.send(JSON.stringify({
                    handler:"private_msg",
                    payload:{
                        username:msg.sender,
                        body:
`✅ Childbot created

Room: ${room}
Bot: ${username}`
                    }
                }));
            }
        }
    });

    // ================= LOGIN FAIL =================
    setTimeout(()=>{

        if(!loggedIn && res){

            res.json({
                success:false,
                message:"❌ Login failed"
            });

            res = null;
        }

    },8000);

    mainWS.on("close",()=>{

        console.log("MainBot disconnected");

    });

    mainWS.on("error",(err)=>{

        console.log("WS Error:",err.message);

    });
}

// ================= START SERVER =================
const PORT = process.env.PORT || 8080;

app.listen(PORT,()=>{

    console.log("FUNBOT WEB ONLINE:",PORT);

});
