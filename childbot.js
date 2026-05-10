const WebSocket = require("ws");

const { generateQuestion } = require("./quiz");

const {
    loadBots,
    saveBots
} = require("./storage");

// ================= GLOBAL =================
let GLOBAL_SCORES = {};
let ROOM_SCORES = {};

class ChildBot {

    constructor(config, owner) {

        this.owner = owner;

        this.room = config.room;
        this.username = config.username;
        this.password = config.password;

        // ================= MASTER =================
        this.mainMaster = config.mainMaster;

        this.masters =
            config.masters || [
                config.mainMaster
            ];

        // ================= SETTINGS =================
        this.settings =
            config.settings || {

                welcome: true,
                quiz: true,
                cricket: false
            };

        // ================= CRICKET =================
        this.cricket =
            config.cricket || {

                runs: 0,
                wickets: 0,
                overs: 0,
                players: []
            };

        if (!this.cricket.players) {
            this.cricket.players = [];
        }

        // ================= QUIZ =================
        this.currentAnswer = null;

        this.repeatTimer = null;

        this.repeatCount = 0;

        this.questionStartTime = 0;

        // ================= SCORES =================
        this.userScores = {};

        this.connect();
    }

    // ================= SAVE =================
    saveConfig() {

        try {

            let db = loadBots();

            if (
                !db.mainbots ||
                !db.mainbots[this.owner]
            ) return;

            let ownerData =
                db.mainbots[this.owner];

            let index =
                ownerData.childbots.findIndex(
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

            console.log(
                "saveConfig error:",
                err.message
            );
        }
    }

    // ================= CONNECT =================
    connect() {

        this.ws = new WebSocket(
            "wss://viberschat.space:8443/server"
        );

        this.ws.on("open", () => {

            console.log(
                `${this.username} connected`
            );

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

                let msg =
                    JSON.parse(raw);

                this.handle(msg);

            } catch (err) {

                console.log(
                    "Message Error:",
                    err.message
                );
            }
        });

        this.ws.on("close", () => {

            console.log(
                `${this.username} reconnecting...`
            );

            clearInterval(
                this.repeatTimer
            );

            setTimeout(() => {

                this.connect();

            }, 5000);
        });

        this.ws.on("error", err => {

            console.log(
                "WS Error:",
                err.message
            );
        });
    }

    // ================= SEND =================
    send(text) {

        try {

            if (!this.ws) return;

            if (
                this.ws.readyState !==
                WebSocket.OPEN
            ) return;

            this.ws.send(JSON.stringify({

                handler: "room_msg",

                payload: {

                    room_name: this.room,

                    body: text
                }
            }));

        } catch (err) {

            console.log(
                "Send Error:",
                err.message
            );
        }
    }

    // ================= JOIN ROOM =================
    joinRoom() {

        try {

            this.ws.send(JSON.stringify({

                handler: "join_room",

                payload: {

                    room_name: this.room
                }
            }));

        } catch {}
    }

    // ================= QUIZ =================
    nextQuestion() {

        if (!this.settings.quiz)
            return;

        clearInterval(
            this.repeatTimer
        );

        this.repeatCount = 0;

        // FIXED
        let q = generateQuestion();

        this.currentAnswer =
            q.answer
            .toString()
            .toLowerCase();

        // FIXED
        this.questionStartTime =
            Date.now();

        this.send(q.question);

        this.repeatTimer =
            setInterval(() => {

                this.repeatCount++;

                if (
                    this.currentAnswer === null
                ) {

                    clearInterval(
                        this.repeatTimer
                    );

                    return;
                }

                this.send(
                    `⏳ ${q.question}`
                );

                if (
                    this.repeatCount >= 5
                ) {

                    clearInterval(
                        this.repeatTimer
                    );

                    this.send(
`❌ Time up!

Answer:
${this.currentAnswer}`
                    );

                    this.currentAnswer = null;

                    setTimeout(() => {

                        this.nextQuestion();

                    }, 5000);
                }

            }, 15000);
    }

    // ================= HANDLE =================
    handle(msg) {

        try {

            switch (msg.handler) {

                // ================= LOGIN =================
                case "3rd_login":

                    this.joinRoom();

                    setTimeout(() => {

                        if (
                            this.settings.quiz &&
                            this.currentAnswer === null
                        ) {

                            this.nextQuestion();
                        }

                    }, 5000);

                break;

                // ================= WELCOME =================
                case "room_presence":

                    if (
                        this.settings.welcome
                    ) {

                        let username =
                            msg.username ||
                            msg.payload?.username;

                        if (
                            username &&
                            username !== this.username
                        ) {

                            this.send(
                                `👋 Welcome ${username}!`
                            );
                        }
                    }

                break;

                // ================= ROOM MESSAGE =================
                case "room_msg":

                    let m =
                        msg.message || {};

                    if (!m.body)
                        return;

                    let text =
                        m.body
                        .toLowerCase()
                        .trim();

                    let sender =
                        m.sender ||
                        m.username ||
                        "";

                    if (!sender)
                        return;

                    // ignore self
                    if (
                        sender === this.username
                    ) return;

                    let isMaster =
                        this.masters.includes(
                            sender
                        );

                    let isMainMaster =
                        sender ===
                        this.mainMaster;

                    // ================= HELP =================
                    if (
                        text === "help" &&
                        isMaster
                    ) {

                        this.send(
`🤖 FUNBOT COMMANDS

👑 MASTER
addmas username
removemas username
maslist

⚙ SETTINGS
+quiz
-quiz
+wc
-wc
+cc
-cc

📊 SCORE
+myscore
@top
@gtop

🏏 CRICKET
+startcricket
+join
+bat
+score
+ccreset`
                        );

                        return;
                    }

                    // ================= MY SCORE =================
                    if (text === "+myscore") {

                        let u =
                            this.userScores[sender];

                        if (!u) {

                            this.send(
                                `❌ ${sender}, no score yet`
                            );

                            return;
                        }

                        this.send(
`📊 ${sender}

🏆 Score: ${u.score}
⚡ Last Speed: ${u.last}s
🥇 Best Speed: ${u.best}s`
                        );

                        return;
                    }

                    // ================= TOP =================
                    if (text === "@top") {

                        let list =
                            Object.entries(
                                this.userScores
                            )
                            .map(([name, data]) => ({
                                name,
                                score: data.score
                            }))
                            .sort((a, b) =>
                                b.score - a.score
                            )
                            .slice(0, 10);

                        if (
                            list.length === 0
                        ) {

                            this.send(
                                "❌ No scores yet"
                            );

                            return;
                        }

                        let topMsg =
                            "🏆 TOP 10 PLAYERS\n\n";

                        list.forEach((u, i) => {

                            topMsg +=
`${i + 1}. ${u.name} - ${u.score}\n`;
                        });

                        this.send(topMsg);

                        return;
                    }

                    // ================= GLOBAL TOP =================
                    if (text === "@gtop") {

                        let rooms =
                            Object.entries(
                                ROOM_SCORES
                            );

                        let roomWinners =
                            rooms.map(([room, users]) => {

                                let topUser =
                                    Object.entries(users)
                                    .sort((a, b) =>
                                        b[1] - a[1]
                                    )[0];

                                return {

                                    room,

                                    user:
                                        topUser
                                        ? topUser[0]
                                        : null,

                                    score:
                                        topUser
                                        ? topUser[1]
                                        : 0
                                };
                            });

                        let bestRoom =
                            roomWinners.sort((a, b) =>
                                b.score - a.score
                            )[0];

                        if (
                            !bestRoom ||
                            !bestRoom.user
                        ) {

                            this.send(
                                "❌ No global data yet"
                            );

                            return;
                        }

                        this.send(
`🌍 GLOBAL TOP ROOM

🏆 Room: ${bestRoom.room}
👑 Player: ${bestRoom.user}
📊 Score: ${bestRoom.score}`
                        );

                        return;
                    }

                    // ================= SETTINGS =================
                    if (isMaster) {

                        if (text === "+quiz") {

                            this.settings.quiz = true;

                            this.saveConfig();

                            this.send(
                                "✅ Quiz ON"
                            );

                            if (
                                this.currentAnswer === null
                            ) {

                                this.nextQuestion();
                            }

                            return;
                        }

                        if (text === "-quiz") {

                            this.settings.quiz = false;

                            clearInterval(
                                this.repeatTimer
                            );

                            this.currentAnswer = null;

                            this.saveConfig();

                            this.send(
                                "❌ Quiz OFF"
                            );

                            return;
                        }

                        if (text === "+wc") {

                            this.settings.welcome = true;

                            this.saveConfig();

                            this.send(
                                "✅ Welcome ON"
                            );

                            return;
                        }

                        if (text === "-wc") {

                            this.settings.welcome = false;

                            this.saveConfig();

                            this.send(
                                "❌ Welcome OFF"
                            );

                            return;
                        }

                        if (text === "+cc") {

                            this.settings.cricket = true;

                            this.saveConfig();

                            this.send(
                                "🏏 Cricket ON"
                            );

                            return;
                        }

                        if (text === "-cc") {

                            this.settings.cricket = false;

                            this.saveConfig();

                            this.send(
                                "🏏 Cricket OFF"
                            );

                            return;
                        }

                        if (text === "+ccreset") {

                            this.cricket = {

                                runs: 0,
                                wickets: 0,
                                overs: 0,
                                players: []
                            };

                            this.saveConfig();

                            this.send(
                                "🏏 Cricket Reset"
                            );

                            return;
                        }
                    }

                    // ================= ADD MASTER =================
                    if (
                        isMainMaster &&
                        text.startsWith(
                            "addmas "
                        )
                    ) {

                        let user =
                            text.replace(
                                "addmas ",
                                ""
                            ).trim();

                        if (
                            !this.masters.includes(user)
                        ) {

                            this.masters.push(user);

                            this.saveConfig();

                            this.send(
`✅ ${user} added as master`
                            );
                        }

                        return;
                    }

                    // ================= REMOVE MASTER =================
                    if (
                        isMaster &&
                        text.startsWith(
                            "removemas "
                        )
                    ) {

                        let user =
                            text.replace(
                                "removemas ",
                                ""
                            ).trim();

                        if (
                            user ===
                            this.mainMaster
                        ) {

                            this.send(
                                "❌ Cannot remove main master"
                            );

                            return;
                        }

                        this.masters =
                            this.masters.filter(
                                x => x !== user
                            );

                        this.saveConfig();

                        this.send(
                            `🗑 ${user} removed`
                        );

                        return;
                    }

                    // ================= MASTER LIST =================
                    if (text === "maslist") {

                        this.send(
`👑 Masters

${this.masters.join("\n")}`
                        );

                        return;
                    }

                    // ================= START CRICKET =================
                    if (
                        isMaster &&
                        text === "+startcricket"
                    ) {

                        if (
                            !this.settings.cricket
                        ) {

                            this.send(
                                "❌ Cricket OFF"
                            );

                            return;
                        }

                        this.cricket.players = [];

                        this.send(
`🏏 CRICKET TEAM OPEN

Need 3 players

Use:
+join`
                        );

                        return;
                    }

                    // ================= JOIN TEAM =================
                    if (text === "+join") {

                        if (
                            this.cricket.players.includes(sender)
                        ) {

                            this.send(
                                "Already joined"
                            );

                            return;
                        }

                        if (
                            this.cricket.players.length >= 3
                        ) {

                            this.send(
                                "Team full"
                            );

                            return;
                        }

                        this.cricket.players.push(sender);

                        let remain =
                            3 -
                            this.cricket.players.length;

                        this.send(
`🏏 ${sender} joined

Players:
${this.cricket.players.join(", ")}

Remaining:
${remain}`
                        );

                        if (
                            this.cricket.players.length === 3
                        ) {

                            this.send(
`✅ TEAM COMPLETE

${this.cricket.players.join(", ")}`
                            );
                        }

                        this.saveConfig();

                        return;
                    }

                    // ================= BAT =================
                    if (
                        this.settings.cricket &&
                        text === "+bat"
                    ) {

                        let results =
                            [0,1,2,3,4,6,"W"];

                        let result =
                            results[
                                Math.floor(
                                    Math.random() *
                                    results.length
                                )
                            ];

                        if (result === "W") {

                            this.cricket.wickets++;

                            this.send(
`❌ OUT

Score:
${this.cricket.runs}/${this.cricket.wickets}`
                            );

                        } else {

                            this.cricket.runs += result;

                            this.send(
`🏏 ${sender} scored ${result}

Score:
${this.cricket.runs}/${this.cricket.wickets}`
                            );
                        }

                        this.saveConfig();

                        return;
                    }

                    // ================= SCORE =================
                    if (
                        this.settings.cricket &&
                        text === "+score"
                    ) {

                        this.send(
`🏏 SCOREBOARD

Runs:
${this.cricket.runs}

Wickets:
${this.cricket.wickets}`
                        );

                        return;
                    }

                    // ================= QUIZ ANSWER =================
                    if (
                        this.currentAnswer !== null &&
                        text === this.currentAnswer
                    ) {

                        clearInterval(
                            this.repeatTimer
                        );

                        let speedSec =
                            (
                                Date.now() -
                                this.questionStartTime
                            ) / 1000;

                        speedSec =
                            Number(
                                speedSec.toFixed(2)
                            );

                        this.currentAnswer = null;

                        // init
                        if (
                            !this.userScores[sender]
                        ) {

                            this.userScores[sender] = {

                                score: 0,
                                best: null,
                                last: null
                            };
                        }

                        let u =
                            this.userScores[sender];

                        let addScore = 10;

                        // SPEED SCORE
                        if (
                            speedSec >= 2 &&
                            speedSec <= 4
                        ) {

                            addScore = 100;

                        } else if (
                            speedSec >= 5 &&
                            speedSec <= 7
                        ) {

                            addScore = 80;

                        } else if (
                            speedSec >= 8 &&
                            speedSec <= 10
                        ) {

                            addScore = 50;
                        }

                        u.score += addScore;

                        u.last = speedSec;

                        if (
                            !u.best ||
                            speedSec < u.best
                        ) {

                            u.best = speedSec;
                        }

                        // ROOM SCORE
                        if (
                            !ROOM_SCORES[this.room]
                        ) {

                            ROOM_SCORES[this.room] = {};
                        }

                        if (
                            !ROOM_SCORES[this.room][sender]
                        ) {

                            ROOM_SCORES[this.room][sender] = 0;
                        }

                        ROOM_SCORES[this.room][sender] += addScore;

                        // GLOBAL SCORE
                        if (
                            !GLOBAL_SCORES[sender]
                        ) {

                            GLOBAL_SCORES[sender] = 0;
                        }

                        GLOBAL_SCORES[sender] += addScore;

                        this.send(
`🏆 ${sender} correct!

⚡ Speed: ${speedSec}s
➕ +${addScore} points
📊 Total Score: ${u.score}`
                        );

                        setTimeout(() => {

                            this.nextQuestion();

                        }, 3000);
                    }

                break;
            }

        } catch (err) {

            console.log(
                "HANDLE ERROR:",
                err.message
            );
        }
    }
}

module.exports = ChildBot;
