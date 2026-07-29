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

// ตั้งค่า Google GenAI SDK (ระบบจะดึง GEMINI_API_KEY จาก process.env โดยอัตโนมัติ)
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// เพิ่ม Endpoint /join เพื่อรองรับการเข้าห้องแชทจากหน้าบ้าน (แก้ปัญหา Error 404)
app.post('/join', async (req, res) => {
    try {
        const { username } = req.body;
        // คุณสามารถเพิ่มตรรกะตรวจสอบหรือบันทึกข้อมูลผู้เข้าห้องลง Firebase ตรงนี้ได้
        res.json({ success: true, message: "เข้าระบบสำเร็จ", username });
    } catch (error) {
        console.error("Error joining chat:", error);
        res.status(500).json({ error: "ไม่สามารถเข้าห้องแชทได้เนื่องจากเซิร์ฟเวอร์ขัดข้อง" });
    }
});

// Endpoint สำหรับคุยกับแชทบอท พร้อมกำหนด Persona (System Instruction)
app.post('/api/chat', async (req, res) => {
    try {
        const { message } = req.body;

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