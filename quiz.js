function generateQuestion(){

    const modes = ["math", "word", "guess"];

    const type = modes[Math.floor(Math.random() * modes.length)];

    // ================= MATH =================
    if(type === "math"){

        let ops = ["+", "-", "*"];
        let op = ops[Math.floor(Math.random() * ops.length)];

        let a = Math.floor(Math.random() * 20) + 1;
        let b = Math.floor(Math.random() * 20) + 1;

        let answer = 0;

        if(op === "+") answer = a + b;

        if(op === "-"){
            if(b > a){
                [a,b] = [b,a];
            }
            answer = a - b;
        }

        if(op === "*"){
            a = Math.floor(Math.random() * 10) + 1;
            b = Math.floor(Math.random() * 10) + 1;
            answer = a * b;
        }

        return {
            type,
            question:`🧮 ${a} ${op} ${b} = ?`,
            answer:answer.toString().toLowerCase()
        };
    }

    // ================= WORD =================
    if(type === "word"){

        let words = [
            "apple",
            "banana",
            "robot",
            "tiger",
            "music",
            "dragon",
            "house"
        ];

        let word = words[Math.floor(Math.random() * words.length)];

        let scrambled = word
            .split("")
            .sort(() => Math.random() - 0.5)
            .join("");

        return {
            type,
            question:`🧠 Unscramble: ${scrambled}`,
            answer:word.toLowerCase()
        };
    }

    // ================= GUESS =================
    let num = Math.floor(Math.random() * 50) + 1;

    return {
        type,
        question:"🎯 Guess number (1-50)",
        answer:num.toString()
    };
}

module.exports = {
    generateQuestion
};
