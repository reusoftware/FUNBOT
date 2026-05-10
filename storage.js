const fs = require("fs");

const DB_FILE = "./bots.json";

function loadBots() {

    try {

        if (!fs.existsSync(DB_FILE)) {

            return {
                mainbots: {}
            };
        }

        let data =
            fs.readFileSync(
                DB_FILE,
                "utf8"
            );

        return JSON.parse(data);

    } catch (err) {

        console.log(
            "LOAD DB ERROR:",
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
            JSON.stringify(
                data,
                null,
                2
            )
        );

    } catch (err) {

        console.log(
            "SAVE DB ERROR:",
            err.message
        );
    }
}

module.exports = {

    loadBots,
    saveBots
};
