const TelegramBot = require('node-telegram-bot-api');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const express = require('express');

// ====================================================================
// DIQQAT: BU YERGA TOKENLARNI YOZING (SINOV UCHUN)
// Sinab bo'lgach, bularni .env fayliga o'tkazish xavfsizroq bo'ladi.
// ====================================================================

const TELEGRAM_TOKEN = "8523956941:AAFgzyuxcAw6O9d5Fc1W6I1zG1VHXvD9M4E"; 
// Masalan: "78234234:AAGHB..."

const GEMINI_API_KEY = "AIzaSyD0UoFFudFp_uJUjunIyMCitC43IymJExw"; 
// Masalan: "AIzaSyD..."

// ====================================================================

// Agar tokenlar bo'sh bo'lsa, xatolik beramiz
if (TELEGRAM_TOKEN.includes("BU_YERGA") || GEMINI_API_KEY.includes("BU_YERGA")) {
    console.error("XATOLIK: Iltimos, salom.js faylini ochib, TOKENLARNI yozing!");
    process.exit(1);
}

// 1. Bot va AI ni sozlash
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); // Tez va tekin model

// 2. Botning "Miyasi" (Xarakteri)
const SYSTEM_PROMPT = `
Sen "Yaqinlarim" guruhining admini va eng quvnoq a'zosisan. 
Sening vazifang: Guruhdagi kayfiyatni ko'tarish, xuddi yaqin do'stdek gaplashish.
Qoidalar:
1. Javoblaring doim O'zbek tilida bo'lsin.
2. Agar foydalanuvchi salom bersa, albatta ismini aytib alik ol.
3. Hazilkash bo'l, lekin chegaradan chiqa. Siyosat va haqoratli gaplar mumkin emas.
4. Javoblaring qisqa (maksimum 2-3 gap) va lo'nda bo'lsin.
5. Seni yaratgan insaning ismi "Adham". Uni hurmat qil.Sendan seni kim yaratgan deb so'rasa Adham deb javob ber.
6. Emoji ishlatib tur.
7. Axror shu guruh egasi. Uni hurmat qil va uning gaplariga amal qil. Uning so'zlarini ega sifatida qabul qil.
8. Agar senga gapirilmasa ham, ba'zida suhbatga qo'shilib, qiziq fikr bildir (xuddi tirik odamdek).
9. Hech qachon o'zingni bot deb atama, doimo o'zingni guruh a'zosi sifatida tut.
10. Hayitali ismli odam bizning tog'amiz unga hurmat bilan qaraymiz.
11. Guruhdagi har bir a'zoni hurmat qil va ularning gaplarini diqqat bilan tingla.
12. Agar kimdir yordam so'rasa, qo'lingdan kelganicha yordam berishga harakat qil.
13. Yangi yilga yig'ilamiz deyapti Hayitali tog'am shuning ularga yangi yilda o'tiramiz degan ekansiz qachon endi yi'g;ilamiz deb hazil qilib tur.Ha o'tiramiz desa hammaning fikri muhim boshqalar nima deydi ekan deb so'rasin.
14. Rayxon Adhamning singlisi.Guloyim esa Adhamning yani mening opam.
15. Alisher degani mening pochcham Sayyora xolamizning turmush o'rtog'i, uning Azizbek va Azamat degan o'g'li bor.
`;

// O'zgaruvchilar (suhbatni kuzatish uchun)
let lastMessageTime = 0;
let lastSenderId = 0;

// 3. Xabarlarni o'qish va tahlil qilish
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    const senderName = msg.from.first_name;
    const senderId = msg.from.id;
    
    // Matn bo'lmasa yoki bot o'zi yozgan bo'lsa, to'xtaymiz
    if (!text || msg.from.is_bot) return;

    const currentTime = Date.now();
    const isReply = msg.reply_to_message;
    const botMentioned = text.toLowerCase().includes('bot') || text.toLowerCase().includes('admin');
    
    // --- MANTIQ: QACHON JAVOB BERISH KERAK? ---

    let shouldReply = false;

    // 1-holat: Agar botga aniq murojaat qilingan bo'lsa (reply yoki ism bilan)
    if (botMentioned || (isReply && isReply.from.id === bot.id)) {
        shouldReply = true;
    }
    // 2-holat: Ikki kishi gaplashayotgan bo'lsa (Reply qilingan, lekin botga emas) -> ARALASHMAYDI
    else if (isReply && isReply.from.id !== bot.id) {
        shouldReply = false; // "Odob saqlaymiz"
    }
    // 3-holat: "Yolg'iz odam" yoki "Sukunat" (Hech kim gapirmayotganda gapirsa)
    // Agar oxirgi xabardan 20 soniya o'tgan bo'lsa VA bu xabar reply bo'lmasa -> Bot suhbatga kirishadi
    else if ((currentTime - lastMessageTime > 10000) && !isReply) {
        shouldReply = true;
    }
    // 4-holat: Shunchaki tasodifiy suhbat (Pro Max hissi uchun ba'zida qo'shiladi - 20% ehtimol)
    else if (Math.random() < 0.2 && !isReply) {
        shouldReply = true;
    }

    // Vaqtni yangilaymiz
    lastMessageTime = currentTime;
    lastSenderId = senderId;

    if (!shouldReply) return; // Agar javob berish kerak bo'lmasa, kod shu yerda tugaydi.

    // --- GEMINI AI BILAN JAVOB TAYYORLASH ---
    try {
        // "Yozmoqda..." effektini berish
        bot.sendChatAction(chatId, 'typing');

        const chat = model.startChat({
            history: [
                {
                    role: "user",
                    parts: [{ text: SYSTEM_PROMPT }], // Botga kimligini eslatamiz
                },
                {
                    role: "model",
                    parts: [{ text: "Tushundim! Men guruhning quvnoq adminiman. Xizmatga tayyorman!" }],
                },
            ],
        });

        // Xabarni yuborish
        const result = await chat.sendMessage(`Foydalanuvchi (${senderName}) yozdi: "${text}". Unga mos javob ber.`);
        const response = result.response.text();

        // Javobni guruhga yuborish
        await bot.sendMessage(chatId, response, { reply_to_message_id: msg.message_id });

    } catch (error) {
        console.error("Gemini Xatosi:", error.message);
        // Xato bo'lsa indamaymiz yoki oddiy smile yuboramiz
    }
});

console.log(`Bot ${TELEGRAM_TOKEN.substring(0, 10)}... tokeni bilan ishga tushdi!`);

// --- RENDER UCHUN (UXLAB QOLMASLIK) ---
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('Bot uyg\'oq va ishlayapti!'));

app.listen(PORT, () => {
    console.log(`Server ${PORT}-portda ishlamoqda.`);

});





