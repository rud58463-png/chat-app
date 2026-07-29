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

// รองรับ Endpoint /join สำหรับเข้าห้องแชท
app.post('/join', async (req, res) => {
    try {
        const { username } = req.body;
        res.json({ success: true, message: "เข้าระบบสำเร็จ", username });
    } catch (error) {
        console.error("Error joining chat:", error);
        res.status(500).json({ error: "ไม่สามารถเข้าห้องแชทได้เนื่องจากเซิร์ฟเวอร์ขัดข้อง" });
    }
});

// ปรับ Endpoint เป็น /chat ให้ตรงกับที่หน้าเว็บ (Frontend) เรียกใช้งาน
app.post('/chat', async (req, res) => {
    try {
        // รองรับทั้งคีย์ message หรือข้อความจากฟอร์มหน้าเว็บ
        const message = req.body.message || req.body.prompt;

        // เรียกใช้งาน Gemini รุ่นล่าสุด
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: message,
            config: {
                systemInstruction: "คุณชื่อ 'ลูเมน (Lumen)' เป็นผู้ช่วย AI อัจฉริยะที่ใจดี เป็นกันเอง และมีความรู้รอบตัวสูง คอยช่วยเหลือผู้ใช้อย่างกระตือรือร้น",
                temperature: 0.7,
            }
        });

        res.json({ reply: response.text });
    } catch (error) {
        console.error("Error calling Gemini API:", error);
        res.status(500).json({ error: "เกิดข้อผิดพลาดในการประมวลผล" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});