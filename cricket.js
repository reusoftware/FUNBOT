const globalCricket = {
    scores:{}
};

function bat(){

    let results = [0,1,2,4,6,"W"];

    return results[Math.floor(Math.random() * results.length)];
}

module.exports = {
    globalCricket,
    bat
};
