const WebSocket = require("ws");

let GLOBAL_SCORES = {};
let ROOM_SCORES = {};

const { generateQuestion } = require("./quiz");
const { loadBots, saveBots } = require("./storage");

class ChildBot {

    constructor(config, owner) {

        this.owner = owner;

        this.room = config.room;
        this.username = config.username;
        this.password = config.password;

        this.mainMaster = config.mainMaster;
        this.masters = config.masters || [config.mainMaster];

        this.settings = config.settings || {
            welcome: true,
            quiz: true,
            cricket: false
        };

        this.cricket = config.cricket || {
            runs: 0,
            wickets: 0,
            overs: 0,
            players: []
        };

        if (!this.cricket.players) {
            this.cricket.players = [];
        }

        this.currentAnswer = null;
        this.questionStartTime = null;

        this.repeatTimer = null;
        this.repeatCount = 0;

        this.userScores = {};

        this.connect();
    }

    // ================= SAVE =================
    saveConfig() {

        try {

            let db = loadBots();

            if (!db.mainbots?.[this.owner]) return;

            let ownerData = db.mainbots[this.owner];

            let index = ownerData.childbots.findIndex(
                x => x.username === this.username
            );

            if (index === -1) return;

            ownerData.childbots[index] = {
                room: this.room,
                username: this.username,
                password: this.password,
                mainMaster: this.mainMaster,
                masters: this.masters,
                settings: this.settings,
                cricket: this.cricket
            };

            saveBots(db);

        } catch (err) {
            console.log("saveConfig error:", err.message);
        }
    }

    // ================= CONNECT =================
    connect() {

        this.ws = new WebSocket("wss://viberschat.space:8443/server");

        this.ws.on("open", () => {

            this.ws.send(JSON.stringify({
                handler: "3rd_login",
                payload: {
                    username: this.username,
                    password: this.password,
                    api_key: "xYn86hjOpJk$"
                }
            }));
        });

        this.ws.on("message", raw => {
            try {
                let msg = JSON.parse(raw);
                this.handle(msg);
            } catch {}
        });

        this.ws.on("close", () => {
            clearInterval(this.repeatTimer);
            setTimeout(() => this.connect(), 5000);
        });
    }

    // ================= SEND =================
    send(text) {

        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        this.ws.send(JSON.stringify({
            handler: "room_msg",
            payload: {
                room_name: this.room,
                body: text
            }
        }));
    }

    // ================= JOIN =================
    joinRoom() {

        this.ws.send(JSON.stringify({
            handler: "join_room",
            payload: { room_name: this.room }
        }));
    }

    // ================= QUIZ =================
    nextQuestion() {

        if (!this.settings.quiz) return;

        clearInterval(this.repeatTimer);

        let q = generateQuestion();

        this.currentAnswer = q.answer.toString().toLowerCase();
        this.questionStartTime = Date.now();

        this.send(q.question);

        this.repeatTimer = setInterval(() => {

            this.repeatCount++;

            if (this.currentAnswer === null) {
                clearInterval(this.repeatTimer);
                return;
            }

            if (this.repeatCount >= 5) {

                clearInterval(this.repeatTimer);

                this.send(`❌ Time up!\n\nAnswer:\n${this.currentAnswer}`);

                this.currentAnswer = null;

                setTimeout(() => this.nextQuestion(), 5000);
            }

        }, 15000);
    }

    // ================= HANDLE =================
    handle(msg) {

        switch (msg.handler) {

            case "3rd_login":
                this.joinRoom();

                setTimeout(() => {
                    if (this.settings.quiz && !this.currentAnswer) {
                        this.nextQuestion();
                    }
                }, 5000);
                break;

            case "room_presence":
                if (this.settings.welcome) {
                    let username = msg.username || msg.payload?.username;

                    if (username && username !== this.username) {
                        this.send(`👋 Welcome ${username}!`);
                    }
                }
                break;

            case "room_msg":

                let m = msg.message || {};
                if (!m.body) return;

                let text = m.body.toLowerCase().trim();
                let sender = m.sender || m.username;

                if (!sender || sender === this.username) return;

                let isMaster = this.masters.includes(sender);
                let isMainMaster = sender === this.mainMaster;

                // ================= MY SCORE =================
                if (text === "+myscore") {

                    let u = this.userScores[sender];

                    if (!u) {
                        this.send(`❌ ${sender}, no score yet`);
                        return;
                    }

                    this.send(
`📊 ${sender}

🏆 Score: ${u.score}
⚡ Last: ${u.last}s
🥇 Best: ${u.best}s`
                    );

                    return;
                }

                // ================= TOP =================
                if (text === "@top") {

                    let list = Object.entries(this.userScores)
                        .map(([name, d]) => ({ name, score: d.score || 0 }))
                        .sort((a, b) => b.score - a.score)
                        .slice(0, 10);

                    if (!list.length) {
                        this.send("❌ No scores yet");
                        return;
                    }

                    let msgText = "🏆 TOP 10\n\n";
                    list.forEach((u, i) => {
                        msgText += `${i + 1}. ${u.name} - ${u.score}\n`;
                    });

                    this.send(msgText);
                    return;
                }

                // ================= GLOBAL TOP =================
                if (text === "@gtop") {

                    let rooms = Object.entries(ROOM_SCORES);

                    let best = null;

                    rooms.forEach(([room, users]) => {

                        let top = Object.entries(users)
                            .sort((a, b) => b[1] - a[1])[0];

                        if (top) {
                            if (!best || top[1] > best.score) {
                                best = { room, user: top[0], score: top[1] };
                            }
                        }
                    });

                    if (!best) {
                        this.send("❌ No global data");
                        return;
                    }

                    this.send(
`🌍 GLOBAL WINNER

Room: ${best.room}
Player: ${best.user}
Score: ${best.score}`
                    );

                    return;
                }

                // ================= QUIZ ANSWER =================
                if (
                    this.currentAnswer &&
                    text === this.currentAnswer
                ) {

                    clearInterval(this.repeatTimer);

                    let speed = (Date.now() - this.questionStartTime) / 1000;

                    let score = 10;

                    if (speed <= 4) score = 100;
                    else if (speed <= 7) score = 80;
                    else if (speed <= 10) score = 50;

                    if (!this.userScores[sender]) {
                        this.userScores[sender] = { score: 0, best: null, last: null };
                    }

                    let u = this.userScores[sender];

                    u.score += score;
                    u.last = speed;
                    if (!u.best || speed < u.best) u.best = speed;

                    if (!ROOM_SCORES[this.room]) ROOM_SCORES[this.room] = {};
                    ROOM_SCORES[this.room][sender] = (ROOM_SCORES[this.room][sender] || 0) + score;

                    if (!GLOBAL_SCORES[sender]) GLOBAL_SCORES[sender] = 0;
                    GLOBAL_SCORES[sender] += score;

                    this.currentAnswer = null;

                    this.send(
`🏆 ${sender} correct!

⚡ ${speed}s
➕ +${score}
📊 Total: ${u.score}`
                    );

                    setTimeout(() => this.nextQuestion(), 3000);
                }

                break;
        }
    }
}

module.exports = ChildBot;
