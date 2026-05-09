const fs = require("fs");

const FILE = "bots.json";

function loadBots(){

    if(!fs.existsSync(FILE)){
        fs.writeFileSync(FILE, JSON.stringify({ bots: [] }, null, 2));
    }

    return JSON.parse(fs.readFileSync(FILE));
}

function saveBots(data){
    fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

module.exports = {
    loadBots,
    saveBots
};
