const WebSocket = require("ws");
const { generateQuestion } = require("./quiz");
const { globalCricket, bat } = require("./cricket");

class ChildBot{

    constructor(config){

        this.room = config.room;
        this.username = config.username;
        this.password = config.password;

        this.mainMaster = config.mainMaster;
        this.masters = config.masters || [config.mainMaster];

        this.quiz = config.quiz ?? true;
        this.welcome = config.welcome ?? true;

        this.currentAnswer = null;
        this.repeatCount = 0;
        this.repeatTimer = null;

        this.userScores = {};

        this.connect();
    }

    connect(){

        this.ws = new WebSocket("wss://viberschat.space:8443/server");

        this.ws.on("open", () => {

            console.log(`${this.username} connected`);

            this.ws.send(JSON.stringify({
                handler:"3rd_login",
                payload:{
                    username:this.username,
                    password:this.password,
                    api_key:"xYn86hjOpJk$"
                }
            }));
        });

        this.ws.on("message", raw => {

            let msg;

            try{
                msg = JSON.parse(raw);
            }catch{
                return;
            }

            this.handle(msg);
        });

        this.ws.on("close", () => {

            console.log(`${this.username} reconnecting...`);

            clearInterval(this.repeatTimer);

            setTimeout(() => {
                this.connect();
            }, 5000);
        });
    }

    send(text){

        this.ws.send(JSON.stringify({
            handler:"room_msg",
            payload:{
                room_name:this.room,
                body:text
            }
        }));
    }

    joinRoom(){

        this.ws.send(JSON.stringify({
            handler:"join_room",
            payload:{
                room_name:this.room
            }
        }));
    }

    nextQuestion(){

        clearInterval(this.repeatTimer);

        this.repeatCount = 0;

        let q = generateQuestion();

        this.currentAnswer = q.answer;

        this.send(q.question);

        this.repeatTimer = setInterval(() => {

            this.repeatCount++;

            if(this.currentAnswer === null){
                clearInterval(this.repeatTimer);
                return;
            }

            this.send(`⏳ ${q.question}`);

            if(this.repeatCount >= 5){

                clearInterval(this.repeatTimer);

                this.send(`❌ Time up! Answer: ${this.currentAnswer}`);

                this.currentAnswer = null;

                setTimeout(() => {
                    this.nextQuestion();
                }, 5000);
            }

        }, 15000);
    }

    handle(msg){

        switch(msg.handler){

            case "3rd_login":

                this.joinRoom();

                setTimeout(() => {
                    if(this.quiz){
                        this.nextQuestion();
                    }
                }, 5000);

            break;

            case "room_presence":

                if(this.welcome && msg.status === "update"){
                    this.send(`👋 Welcome ${msg.username}!`);
                }

            break;

            case "room_msg":

                let m = msg.message;

                if(!m || !m.body) return;

                let text = m.body.toLowerCase().trim();

                // ================= MASTERS =================
                if(this.masters.includes(m.sender)){

                    if(text.startsWith("+addmaster ")){

                        let user = text.replace("+addmaster ", "").trim();

                        if(!this.masters.includes(user)){
                            this.masters.push(user);
                            this.send(`✅ ${user} added as master`);
                        }
                    }

                    if(text.startsWith("+removemaster ")){

                        let user = text.replace("+removemaster ", "").trim();

                        if(user === this.mainMaster){
                            this.send("❌ Cannot remove main master");
                            return;
                        }

                        this.masters = this.masters.filter(x => x !== user);

                        this.send(`🗑 ${user} removed`);
                    }
                }

                // ================= CRICKET =================
                if(text === "+bat"){

                    let result = bat();

                    if(!globalCricket.scores[m.sender]){
                        globalCricket.scores[m.sender] = 0;
                    }

                    if(result !== "W"){
                        globalCricket.scores[m.sender] += result;
                    }

                    this.send(`🏏 ${m.sender}: ${result}`);
                }

                if(text === "+score"){

                    let s = globalCricket.scores[m.sender] || 0;

                    this.send(`🏏 ${m.sender} Total Runs: ${s}`);
                }

                // ================= QUIZ =================
                if(this.currentAnswer !== null){

                    if(text === this.currentAnswer.toLowerCase()){

                        clearInterval(this.repeatTimer);

                        this.currentAnswer = null;

                        if(!this.userScores[m.sender]){
                            this.userScores[m.sender] = 0;
                        }

                        this.userScores[m.sender] += 10;

                        this.send(`🏆 ${m.sender} correct! (+10)`);

                        setTimeout(() => {
                            this.nextQuestion();
                        }, 5000);
                    }
                }

            break;
        }
    }
}

module.exports = ChildBot;
