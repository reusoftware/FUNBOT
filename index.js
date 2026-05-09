const WebSocket = require("ws");
const ChildBot = require("./childbot");
const { loadBots, saveBots } = require("./storage");

const MAIN_USERNAME = "YOUR_MAINBOT_USERNAME";
const MAIN_PASSWORD = "YOUR_MAINBOT_PASSWORD";

const activeBots = [];

// ================= LOAD SAVED BOTS =================
const db = loadBots();

for(let bot of db.bots){

    console.log(`Loading childbot ${bot.username}`);

    activeBots.push(new ChildBot(bot));
}

// ================= MAIN BOT =================
const ws = new WebSocket("wss://viberschat.space:8443/server");

ws.on("open", () => {

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

ws.on("message", raw => {

    let msg;

    try{
        msg = JSON.parse(raw);
    }catch{
        return;
    }

    if(msg.handler !== "private_msg") return;

    let body = msg.body || "";

    // ================= CREATE BOT =================
    // j/room#user#pass

    if(body.startsWith("j/")){

        let parts = body.substring(2).split("#");

        if(parts.length < 3) return;

        let room = parts[0].trim();
        let username = parts[1].trim();
        let password = parts[2].trim();

        // ROOM CHECK
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

        // USER CHECK
        let userExist = db.bots.find(x => x.username === username);

        if(userExist){

            ws.send(JSON.stringify({
                handler:"private_msg",
                payload:{
                    username:msg.sender,
                    body:"❌ Child username already exists"
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

        ws.send(JSON.stringify({
            handler:"private_msg",
            payload:{
                username:msg.sender,
                body:`✅ ChildBot ${username} created for room ${room}`
            }
        }));
    }
});

ws.on("close", () => {

    console.log("MainBot reconnecting...");

    setTimeout(() => {
        process.exit();
    }, 5000);
});
