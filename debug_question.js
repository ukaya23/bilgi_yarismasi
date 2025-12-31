const db = require('./database/db');

async function checkQuestion() {
    await db.initialize();
    const questions = db.getAllQuestions();

    // Index 6 (7. soru) veya ID'si 7 olanı bul
    if (questions.length > 6) {
        console.log('7. Soru (Index 6):', questions[6]);
    } else {
        console.log('Index 6 da soru yok.');
    }

    const q7 = questions.find(q => q.id === 7);
    if (q7) {
        console.log('ID 7 Olan Soru:', q7);
    }

    process.exit();
}

checkQuestion();
