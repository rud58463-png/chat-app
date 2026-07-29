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

// รองรับ Endpoint /join
app.post('/join', async (req, res) => {
    try {
        console.log("ข้อมูลที่ส่งเข้ามาที่ /join:", req.body);
        const username = req.body.username || req.body.name || req.body.user || "Guest";
        res.json({ success: true, message: "เข้าระบบสำเร็จ", username });
    } catch (error) {
        console.error("Error joining chat:", error);
        res.status(500).json({ error: "ไม่สามารถเข้าห้องแชทได้เนื่องจากเซิร์ฟเวอร์ขัดข้อง" });
    }
});

// Endpoint /chat (แก้จุดพิมพ์ผิดจาก return.status เป็น return res.status แล้วครับ)
app.post('/chat', async (req, res) => {
    try {
        console.log("ข้อมูลที่ส่งเข้ามาที่ /chat:", req.body);
        const message = req.body.message || req.body.prompt || req.body.text || req.body.msg;

        if (!message) {
            return res.status(400).json({ error: "กรุณาระบุข้อความ" });
        }

        // เรียกใช้งาน Gemini
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
    } catch (error) {
        console.error("Error calling Gemini API Detail:", error);
        res.status(500).json({ error: "เกิดข้อผิดพลาดในการประมวลผลจากเซิร์ฟเวอร์" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});