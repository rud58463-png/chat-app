import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module'; 
import admin from 'firebase-admin';
import { initializeApp, cert } from 'firebase-admin/app';
import { GoogleGenAI } from '@google/genai';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

let serviceAccount;
try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        console.log("โหลด Firebase จาก Environment สำเร็จ");
    } else {
        serviceAccount = require('./serviceAccountKey.json');
        console.log("โหลด Firebase จากไฟล์ serviceAccountKey.json สำเร็จ");
    }
} catch (error) {
    console.error("ไม่สามารถโหลด Firebase Key ได้:", error);
}

initializeApp({
    credential: cert(serviceAccount)
});

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

let onlineUsers = new Map();
let messages = [];

app.post('/join', async (req, res) => {
    try {
        const { id } = req.body;
        onlineUsers.set(id, Date.now());
        return res.json({ ok: true, message: "เข้าระบบสำเร็จ" });
    } catch (error) {
        return res.status(500).json({ ok: false, reason: "เซิร์ฟเวอร์ขัดข้อง" });
    }
});

app.post('/chat', async (req, res) => {
    try {
        const { id, text } = req.body;
        if (!text) return res.status(400).json({ ok: false });

        const newMessage = {
            id: Math.random().toString(36).substring(2),
            username: id === "ai_lumen_bot" ? "ลูเมน (Lumen)" : "ผู้ใช้งาน",
            text: text,
            time: Date.now(),
            profile: id === "ai_lumen_bot" ? "https://cdn-icons-png.flaticon.com/512/4712/4712109.png" : undefined
        };

        messages.push(newMessage);
        if (messages.length > 50) messages.shift();

        return res.json({ ok: true });
    } catch (error) {
        return res.status(500).json({ ok: false });
    }
});

app.get('/poll', (req, res) => {
    const { id, since } = req.query;
    if (id) onlineUsers.set(id, Date.now());

    const now = Date.now();
    for (let [userId, time] of onlineUsers.entries()) {
        if (now - time > 10000) onlineUsers.delete(userId);
    }

    const sinceTime = parseInt(since) || 0;
    const newMessages = messages.filter(m => m.time > sinceTime);

    res.json({
        online: onlineUsers.size || 1,
        messages: newMessages
    });
});

app.post('/api/chat', async (req, res) => {
    try {
        const message = req.body.message || req.body.prompt;
        if (!message) {
            return res.status(400).json({ error: "กรุณาระบุข้อความ" });
        }

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: message,
            config: {
                systemInstruction: "คุณชื่อ 'ลูเมน (Lumen)' เป็นผู้ช่วย AI อัจฉริยะที่ใจดี เป็นกันเอง และมีความรู้รอบตัวสูง",
                temperature: 0.7,
            }
        });

        const replyText = response.text || (response.candidates && response.candidates[0]?.content?.parts[0]?.text);
        res.json({ reply: replyText || "ขออภัย ฉันไม่สามารถประมวลผลคำตอบได้ในขณะนี้" });
    } catch (error) {
        console.error("Error calling Gemini API:", error);
        res.status(500).json({ error: "เกิดข้อผิดพลาดในการประมวลผลจากเซิร์ฟเวอร์" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});