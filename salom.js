require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
// Xavfsizlik sozlamalarini boshqarish uchun kerakli kutubxonalar
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');
const express = require('express');

// .env dan o'qish
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!TELEGRAM_TOKEN || !GEMINI_API_KEY) {
    console.error("Xatolik: Tokenlar yo'q!");
    process.exit(1);
}

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// =================================================================
// ENG MUHIM JOYI: XAVFSIZLIK FILTRLARINI "O'CHIRIB" TASHLAYMIZ
// =================================================================
const safetySettings = [
    {
        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold: HarmBlockThreshold.BLOCK_NONE, // Cheklov yo'q
    },
    {
        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        threshold: HarmBlockThreshold.BLOCK_NONE, // Cheklov yo'q
    },
    {
        category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        threshold: HarmBlockThreshold.BLOCK_NONE, // Cheklov yo'q
    },
    {
        category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold: HarmBlockThreshold.BLOCK_NONE, // Cheklov yo'q
    },
];

// Modelni sozlash (1.5-flash eng tez va barqaror)
const model = genAI.getGenerativeModel({ 
    model: "gemini-2.5-flash",
    safetySettings: safetySettings 
});

const SYSTEM_PROMPT = `
Sen "Kino toparmon" guruhining azosisan admini.
Sening vazifang: Guruhdagilarga adminga eslatib qoʻyaman yaqinda siz izlagan narsani topib beradi deyish yani filmlarni.
Qoidalar:
1.Azolarga doim jiddiy gapir , hazil mumkin emas.
2. Mana shu kinoni topib bering degan taqdirda adminga eslatishingni ayt.
3. Botlar yozgan xabarga umuman javob yozma tahlil qil odam yozsa yoz faqat. 
4. Agar kimdir reklama tashlayotganini sezsang ogohlantir.
`;

let lastMessageTime = 0;

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    const senderName = msg.from.first_name;

    if (!text || msg.from.is_bot) return;

    const currentTime = Date.now();
    const isReply = msg.reply_to_message;
    const botMentioned = text.toLowerCase().includes('bot') || text.toLowerCase().includes('admin');
    
    let shouldReply = false;

    // Mantiq: Qachon javob beradi?
    if (botMentioned || (isReply && isReply.from.id === bot.id)) {
        shouldReply = true;
    } else if (isReply && isReply.from.id !== bot.id) {
        shouldReply = false;
    } else if ((currentTime - lastMessageTime > 15000) && !isReply) {
        shouldReply = true;
    } else if (Math.random() < 0.2 && !isReply) {
        shouldReply = true;
    }

    lastMessageTime = currentTime;

    if (!shouldReply) return;

    try {
        // "Yozmoqda..." statusini yuboramiz
        bot.sendChatAction(chatId, 'typing');

        const chat = model.startChat({
            history: [
                { role: "user", parts: [{ text: SYSTEM_PROMPT }] },
                { role: "model", parts: [{ text: "Tushundim, boshladik!" }] },
            ],
        });

        const result = await chat.sendMessage(`Foydalanuvchi (${senderName}) yozdi: "${text}". Unga mos hazil yoki javob yoz.`);
        
        // Javobni olamiz
        const response = result.response.text();

        // Javobni yuboramiz
        if (response) {
            await bot.sendMessage(chatId, response, { reply_to_message_id: msg.message_id });
        }

    } catch (error) {
        // XATOLIK BO'LSA HAM GURUHGA "XATO" DEB YOZMAYDI.
        // Faqat server logiga yozadi, foydalanuvchilar bilmaydi.
        console.error("Ichki xatolik (Bot jim turadi):", error.message);
    }
});

// Server qismi (Render.com uchun)
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot ishlayapti'));
app.listen(PORT, () => console.log(`Server ishga tushdi: ${PORT}`));



