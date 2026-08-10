import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module'; 
import admin from 'firebase-admin';
import { initializeApp, cert } from 'firebase-admin/app';

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

let onlineUsers = new Map();
let messages = [];

// 1. รองรับการเข้าระบบ (Login)
app.post('/join', async (req, res) => {
    try {
        const { id } = req.body;
        if (!id) return res.status(400).json({ ok: false, reason: "ไม่พบข้อมูลผู้ใช้" });
        
        onlineUsers.set(id, Date.now());
        return res.json({ ok: true, message: "เข้าระบบสำเร็จ" });
    } catch (error) {
        console.error("Error joining chat:", error);
        return res.status(500).json({ ok: false, reason: "เซิร์ฟเวอร์ขัดข้อง" });
    }
});

// 2. รองรับการส่งข้อความเข้าห้องแชท (แบบไม่มี AI แล้ว)
app.post('/chat', async (req, res) => {
    try {
        const { id, text } = req.body;
        if (!text) return res.status(400).json({ ok: false });

        const newMessage = {
            id: Math.random().toString(36).substring(2),
            username: id || "ผู้ใช้งาน",
            text: text,
            time: Date.now()
        };

        messages.push(newMessage);
        if (messages.length > 50) messages.shift(); // เก็บข้อความล่าสุดไว้ 50 ข้อความ

        return res.json({ ok: true });
    } catch (error) {
        console.error("Error in /chat:", error);
        return res.status(500).json({ ok: false });
    }
});

// 3. รองรับการดึงข้อความและเช็คคนออนไลน์ (Poll)
app.get('/poll', (req, res) => {
    const { id, since } = req.query;
    if (id) onlineUsers.set(id, Date.now());

    // ล้างรายชื่อคนที่ไม่ได้ active เกิน 10 วินาทีออก
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});