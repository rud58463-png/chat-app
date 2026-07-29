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

// โหลด Firebase Key
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

// ตั้งค่า Google GenAI SDK
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// เก็บข้อมูลห้องแชทและข้อความในหน่วยความจำชั่วคราว
let onlineUsers = new Map();
let messages = [];

// 1. รองรับ /join
app.post('/join', async (req, res) => {
    try {
        const { id } = req.body;
        onlineUsers.set(id, Date.now());
        console.log("ผู้ใช้เข้าระบบ ID:", id);
        return res.json({ ok: true, message: "เข้าระบบสำเร็จ" });
    } catch (error) {
        console.error("Error joining chat:", error);
        return res.status(500).json({ ok: false, reason: "เซิร์ฟเวอร์ขัดข้อง" });
    }
});

// 2. รองรับ /chat สำหรับรับส่งข้อความในห้องแชท
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
        console.error("Error in /chat:", error);
        return res.status(500).json({ ok: false });
    }
});

// 3. รองรับ /poll สำหรับดึงข้อความใหม่และจำนวนคนออนไลน์
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

// 4. รองรับ /api/chat สำหรับคุยกับ Gemini AI (แก้ return.status เป็น return res.status เรียบร้อย)
app.post('/api/chat', async (req, res) => {
    try {
        const message = req.body.message || req.body.prompt;
        console.log("ข้อความคุยกับ AI:", message);

        if (!message) {
            return res.status(400).json({ error: "กรุณาระบุข้อความ" });
        }

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: message,
            config: {
                systemInstruction: "คุณชื่อ 'ลูเมน (Lumen)' เป็นผู้ช่วย AI อัจฉริยะที่ใจดี เป็นกันเอง และมีความรู้รอบตัวสูง คอยช่วยเหลือผู้ใช้อย่างกระตือรือร้น",
                temperature: 0.7,
            }
        });

        const replyText = response.text || (response.candidates && response.candidates[0]?.content?.parts[0]?.text);

        res.json({ reply: replyText || "ขออภัย ฉันไม่สามารถประมวลผลคำตอบได้ในขณะนี้" });
    } the catch (error) { // ตรวจสอบโครงสร้าง try-catch ให้ถูกต้อง
        console.error("Error calling Gemini API:", error);
        res.status(500).json({ error: "เกิดข้อผิดพลาดในการประมวลผลจากเซิร์ฟเวอร์" });
    }
});