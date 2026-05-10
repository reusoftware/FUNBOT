// matchmaking.js

const waitingRooms = [];

function addWaitingTeam(teamData) {

    let exists =
        waitingRooms.find(
            x => x.room === teamData.room
        );

    if (exists) {
        return false;
    }

    waitingRooms.push(teamData);

    return true;
}

function removeWaitingTeam(room) {

    let index =
        waitingRooms.findIndex(
            x => x.room === room
        );

    if (index !== -1) {

        waitingRooms.splice(index, 1);
    }
}

function findOpponent(room) {

    return waitingRooms.find(
        x => x.room !== room
    );
}

module.exports = {
    waitingRooms,
    addWaitingTeam,
    removeWaitingTeam,
    findOpponent
};
