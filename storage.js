const fs = require("fs");

const DB_FILE = "./bots.json";

function loadBots() {

    try {

        if (!fs.existsSync(DB_FILE)) {

            fs.writeFileSync(
                DB_FILE,
                JSON.stringify({
                    mainbots: {}
                }, null, 2)
            );
        }

        let raw =
            fs.readFileSync(DB_FILE);

        return JSON.parse(raw);

    } catch (err) {

        console.log(
            "DB LOAD ERROR:",
            err.message
        );

        return {
            mainbots: {}
        };
    }
}

function saveBots(data) {

    try {

        fs.writeFileSync(
            DB_FILE,
            JSON.stringify(data, null, 2)
        );

    } catch (err) {

        console.log(
            "DB SAVE ERROR:",
            err.message
        );
    }
}

module.exports = {
    loadBots,
    saveBots
};
