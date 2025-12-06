require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');
const express = require('express');
const googleTTS = require('google-tts-api');
const axios = require('axios'); // package.json da bo'lishi shart!

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!TELEGRAM_TOKEN || !GEMINI_API_KEY) {
    console.error("Xatolik: Tokenlar yo'q!");
    process.exit(1);
}

const bot = new TelegramBot(TELEGRAM_TOKEN;
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

const model = genAI.getGenerativeModel({ 
    model: "gemini-2.5-flash", 
    safetySettings: safetySettings 
});

const SYSTEM_PROMPT = `
Sen Telegram guruh adminisan. 
Agar matnda o'ta og'ir so'kish (ona, jinsiy) bo'lsa -> faqat "BLOCK_HEAVY" deb yoz.
Boshqa hollarda -> qisqa, hazil aralash o'zbekcha javob yoz. Sen foydalanuvchi nima desa shuni qaytar bo'ldi.
`;

// Ovoz yuborish funksiyasi (Debug rejimi bilan)
async function sendVoiceMessage(chatId, text, replyToMessageId) {
    try {
        const safeText = text.substring(0, 190); 
        
        const url = googleTTS.getAudioUrl(safeText, {
            lang: 'uz',
            // MANA BU YERGA QO'YING:
            slow: true, // <--- Hozirgi muammoni hal qilish uchun TRUE ga o'zgartirdik
            host: 'https://translate.google.com',
        });
        // Audio yuklab olish
        const response = await axios({
            method: 'get',
            url: url,
            responseType: 'arraybuffer'
        });
        
        // Yuborish
        await bot.sendVoice(chatId, Buffer.from(response.data), { 
            reply_to_message_id: replyToMessageId,
            caption: "🤖 " + text 
        }, {
            filename: 'voice.mp3',
            contentType: 'audio/mpeg'
        });

    } catch (e) {
        console.error("TTS Xato:", e.message);
        // Ovoz o'xshamasa, matn yuboramiz va xatoni aytamiz (vaqtincha)
        await bot.sendMessage(chatId, text + "\n(Ovozda xato: " + e.message + ")", { reply_to_message_id: replyToMessageId });
    }
}

let lastMessageTime = 0;

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    
    if (!text || msg.from.is_bot) return;

    // SINOV UCHUN: Hamma filtrlarni o'chirdim. Har qanday xabarga javob beradi.
    // Keyinroq yana yoqamiz.
    
    try {
        bot.sendChatAction(chatId, 'typing');

        const chat = model.startChat({
            history: [
                { role: "user", parts: [{ text: SYSTEM_PROMPT }] },
            ],
        });

        const result = await chat.sendMessage(`Foydalanuvchi (${msg.from.first_name}) yozdi: "${text}"`);
        const response = result.response.text().trim();

        if (response.includes("BLOCK_HEAVY")) {
            await bot.sendMessage(chatId, "Chegaradan chiqmaylik!", { reply_to_message_id: msg.message_id });
        } else {
            bot.sendChatAction(chatId, 'record_voice');
            await sendVoiceMessage(chatId, response, msg.message_id);
        }

    } catch (error) {
        console.error("Xatolik:", error.message);
        // XATOLIKNI TELEGRAMGA YUBORISH (Siz ko'rishingiz uchun):
        await bot.sendMessage(chatId, "⚠️ Botda xatolik: " + error.message);
    }
});

// Server
const app = express();
app.get('/', (req, res) => res.send('Bot ishlayapti...'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server: ${PORT}`));



