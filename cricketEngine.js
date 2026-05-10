// cricketEngine.js

function randomBall() {

    let balls = [
        0,1,2,3,4,6,"W"
    ];

    return balls[
        Math.floor(
            Math.random() * balls.length
        )
    ];
}

module.exports = {
    randomBall
};
