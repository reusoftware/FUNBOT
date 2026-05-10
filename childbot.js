const WebSocket = require("ws");

const { generateQuestion } =
    require("./quiz");

const {
    loadBots,
    saveBots
} = require("./storage");

class ChildBot {

    constructor(config, owner) {

        this.owner = owner;

        this.room = config.room;
        this.username = config.username;
        this.password = config.password;

        this.mainMaster =
            config.mainMaster;

        this.masters =
            config.masters || [
                config.mainMaster
            ];

        this.settings =
            config.settings || {

                welcome: true,
                quiz: true,
                cricket: false
            };

        this.cricket =
            config.cricket || {

                runs: 0,
                wickets: 0,
                overs: 0
            };

        this.currentAnswer = null;

        this.repeatTimer = null;

        this.repeatCount = 0;

        this.userScores = {};

        this.connect();
    }

    // ================= SAVE =================
    saveConfig() {

        let db = loadBots();

        let ownerData =
            db.mainbots[this.owner];

        if (!ownerData) return;

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

            let msg;

            try {

                msg = JSON.parse(raw);

            } catch {

                return;
            }

            this.handle(msg);
        });

        this.ws.on("close", () => {

            console.log(
                `${this.username} reconnecting...`
            );

            clearInterval(this.repeatTimer);

            setTimeout(() => {

                this.connect();

            }, 5000);
        });
    }

    // ================= SEND =================
    send(text) {

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
    }

    // ================= JOIN =================
    joinRoom() {

        this.ws.send(JSON.stringify({

            handler: "join_room",

            payload: {

                room_name: this.room
            }
        }));
    }

    // ================= QUIZ =================
    nextQuestion() {

        if (!this.settings.quiz)
            return;

        clearInterval(this.repeatTimer);

        this.repeatCount = 0;

        let q = generateQuestion();

        this.currentAnswer =
            q.answer.toLowerCase();

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
                    this.settings.welcome &&
                    msg.status === "join"
                ) {

                    this.send(
                        `👋 Welcome ${msg.username}!`
                    );
                }

            break;

            // ================= ROOM MESSAGE =================
            case "room_msg":

                let m = msg.message;

                if (!m || !m.body)
                    return;

                let text =
                    m.body
                    .toLowerCase()
                    .trim();

                let sender =
                    m.sender;

                // ================= MASTER =================
                let isMaster =
                    this.masters.includes(
                        sender
                    );

                let isMainMaster =
                    sender ===
                    this.mainMaster;

                // ================= SETTINGS =================
                if (isMaster) {

                    if (text === "+quiz on") {

                        this.settings.quiz = true;

                        this.saveConfig();

                        this.send(
                            "✅ Quiz ON"
                        );

                        this.nextQuestion();

                        return;
                    }

                    if (text === "+quiz off") {

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

                    if (text === "+welcome on") {

                        this.settings.welcome = true;

                        this.saveConfig();

                        this.send(
                            "✅ Welcome ON"
                        );

                        return;
                    }

                    if (text === "+welcome off") {

                        this.settings.welcome = false;

                        this.saveConfig();

                        this.send(
                            "❌ Welcome OFF"
                        );

                        return;
                    }

                    if (text === "+cricket on") {

                        this.settings.cricket = true;

                        this.saveConfig();

                        this.send(
                            "🏏 Cricket ON"
                        );

                        return;
                    }

                    if (text === "+cricket off") {

                        this.settings.cricket = false;

                        this.saveConfig();

                        this.send(
                            "🏏 Cricket OFF"
                        );

                        return;
                    }
                }

                // ================= MAIN MASTER =================
                if (
                    isMainMaster &&
                    text.startsWith(
                        "+addmaster "
                    )
                ) {

                    let user =
                        text.replace(
                            "+addmaster ",
                            ""
                        ).trim();

                    if (
                        !this.masters.includes(user)
                    ) {

                        this.masters.push(user);

                        this.saveConfig();

                        this.send(
`✅ ${user}
added as master`
                        );
                    }

                    return;
                }

                // ================= REMOVE MASTER =================
                if (
                    isMaster &&
                    text.startsWith(
                        "+removemaster "
                    )
                ) {

                    let user =
                        text.replace(
                            "+removemaster ",
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

                // ================= MASTERS =================
                if (text === "+masters") {

                    this.send(
`👑 Masters

${this.masters.join("\n")}`
                    );

                    return;
                }

                // ================= CRICKET =================
                if (
                    this.settings.cricket &&
                    text === "+bat"
                ) {

                    let results = [
                        0,1,2,4,6,"W"
                    ];

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

${this.cricket.runs}/${this.cricket.wickets}`
                        );

                    } else {

                        this.cricket.runs += result;

                        this.send(
`🏏 ${sender}
scored ${result}

${this.cricket.runs}/${this.cricket.wickets}`
                        );
                    }

                    this.saveConfig();

                    return;
                }

                if (
                    this.settings.cricket &&
                    text === "+score"
                ) {

                    this.send(
`🏏 Cricket Score

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

                    this.currentAnswer = null;

                    if (
                        !this.userScores[sender]
                    ) {

                        this.userScores[sender] = 0;
                    }

                    this.userScores[sender] += 10;

                    this.send(
`🏆 ${sender} correct!

+10 points`
                    );

                    setTimeout(() => {

                        this.nextQuestion();

                    }, 5000);
                }

            break;
        }
    }
}

module.exports = ChildBot;
