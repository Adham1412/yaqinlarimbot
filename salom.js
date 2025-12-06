require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');
const express = require('express');
const axios = require('axios'); // Buni eng tepaga qo'shishni unutmang!
// Ovozga aylantirish uchun kutubxona
const googleTTS = require('google-tts-api');

// .env dan o'qish
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!TELEGRAM_TOKEN || !GEMINI_API_KEY) {
    console.error("Xatolik: Tokenlar yo'q!");
    process.exit(1);
}

const bot = new TelegramBot(TELEGRAM_TOKEN);
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Xavfsizlik filtrlari (Gemini o'zi bloklamasligi uchun hammasini ochib qo'yamiz,
// nazoratni Prompt orqali o'zimiz qilamiz)
const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

const model = genAI.getGenerativeModel({ 
    model: "gemini-2.5-flash", // 1.5-flash tavsiya etiladi (tezroq va arzonroq)
    safetySettings: safetySettings 
});

// =================================================================
// 1. AQLIY MARKAZ (SYSTEM PROMPT)
// =================================================================
const SYSTEM_PROMPT = `
Sen Telegramdasan. Vazifang: Foydalanuvchi yozgan matnni tahlil qilish va javob berish.

QAT'IY QOIDALAR (Haqoratlarni filtrlash):
1. **O'ta og'ir haqoratlar:** Agar matnda onadan so'kish, jinsiy zo'ravonlik, o'ta og'ir shaxsiyatga tegish yoki millatchilik bo'lsa -> Faqatgina "BLOCK_HEAVY" deb javob qaytar (boshqa hech narsa yozma).
2. **Yengil haqoratlar va hazillar:** Agar "tentak", "jinni", "do'd", "xarip" kabi oddiy so'kishlar yoki do'stona "so'kinishlar" bo'lsa -> Bunga ruxsat ber va unga mos hazil aralash "krutoy" javob qaytar.
3. **Oddiy matn:** Oddiy matn bo'lsa,o'sha aytgan so'zini bir xil ovoz qilib  ber foydalanuvchi nimani yozsa o'sha narsani ovoz qilib olsin o'zgarib ketmasin.
4. So'zlaring 200 ta belgidan umuman oshmasin.
5.Javobing qisqa, lo'nda va o'zbek tilida bo'lsin.
`;

// Ovozga aylantirish funksiyasi (Universal va Tuzatilgan)
async function sendVoiceMessage(chatId, text, replyToMessageId) {
    try {
        // 1. Matnni qisqartirish
        const safeText = text.substring(0, 190); // 200 dan sal kamroq olamiz xavfsizlik uchun

        // 2. Havolani olish
        const url = googleTTS.getAudioUrl(safeText, {
            lang: 'uz',
            slow: false,
            host: 'https://translate.google.com',
        });

        // 3. Audio faylni yuklab olish (Buffer)
        const response = await axios({
            method: 'get',
            url: url,
            responseType: 'arraybuffer' // Muhim!
        });

        // 4. Telegramga yuborish (Maxsus opsiyalar bilan)
        await bot.sendVoice(chatId, Buffer.from(response.data), {
            reply_to_message_id: replyToMessageId,
            caption: "🤖 " + text
        }, {
            // MANA SHU YERDA OLDIN XATO BOR EDI:
            filename: 'voice.mp3',
            contentType: 'audio/mpeg'
        });

    } catch (e) {
        console.error("Ovoz yuborishda xatolik:", e.message);
        // Agar ovoz o'xshamasa, shunchaki matn yuborilsin
        await bot.sendMessage(chatId, text, { reply_to_message_id: replyToMessageId });
    }
}

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

    // Javob berish mantiqi
    if (botMentioned || (isReply && isReply.from.id === bot.id)) {
        shouldReply = true;
    } else if (isReply && isReply.from.id !== bot.id) {
        shouldReply = false;
    } else if ((currentTime - lastMessageTime > 15000) && !isReply) {
        shouldReply = true;
    }

    // Sinov uchun har doim javob beradigan qilib turish (ixtiyoriy)
    // shouldReply = true; 

    if (!shouldReply) return;
    lastMessageTime = currentTime;

    try {
        bot.sendChatAction(chatId, 'typing');

        // Geminiga so'rov yuboramiz
        const chat = model.startChat({
            history: [
                { role: "user", parts: [{ text: SYSTEM_PROMPT }] },
                { role: "model", parts: [{ text: "Tushundim, filtrlash tizimi va javob berishga tayyorman." }] },
            ],
        });

        const result = await chat.sendMessage(`Foydalanuvchi (${senderName}) yozdi: "${text}".`);
        const response = result.response.text().trim();

        // =================================================================
        // 2. FILTRLASH VA OVOZLI JAVOB
        // =================================================================
        
        if (response.includes("BLOCK_HEAVY")) {
            // Agar Gemini buni o'ta og'ir deb topsa:
            await bot.sendMessage(chatId, `⚠️ ${senderName}, chegaradan chiqmaylik! Bunday gaplarni ovozlashtira olmayman.`, { reply_to_message_id: msg.message_id });
        } else {
            // Agar yengil yoki oddiy gap bo'lsa -> Ovozli javob yuboramiz
            // Bot "yozmoqda" emas, "ovoz yozmoqda" statusini ko'rsatadi
            bot.sendChatAction(chatId, 'record_voice');
            
            // Ovozli xabar yuborish funksiyasini chaqiramiz
            await sendVoiceMessage(chatId, response, msg.message_id);
        }

    } catch (error) {
        console.error("Ichki xatolik:", error.message);
    }
});

// Server qismi
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot ovozli rejimda ishlayapti'));
app.listen(PORT, () => console.log(`Server ishga tushdi: ${PORT}`));



