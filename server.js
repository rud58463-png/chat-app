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
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
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
const db = admin.firestore();

let onlineUsers = new Map();
let messages = [];

// API แชทสด
app.post('/join', async (req, res) => {
    try {
        const name = req.body.username || req.body.id;
        if (!name) return res.status(400).json({ ok: false, reason: "กรุณาระบุชื่อผู้ใช้งาน" });
        onlineUsers.set(name, Date.now());
        return res.json({ ok: true, message: "เข้าระบบสำเร็จ", username: name });
    } catch (error) {
        return res.status(500).json({ ok: false, reason: "เซิร์ฟเวอร์ขัดข้อง" });
    }
});

app.post('/chat', async (req, res) => {
    try {
        const name = req.body.username || req.body.id;
        const { text, profile } = req.body;
        if (!text) return res.status(400).json({ ok: false, reason: "ไม่พบข้อความ" });

        const newMessage = {
            id: Math.random().toString(36).substring(2),
            username: name || "ผู้ใช้งานทั่วไป",
            text: text,
            profile: profile || null,
            time: Date.now()
        };

        messages.push(newMessage);
        if (messages.length > 50) messages.shift();
        return res.json({ ok: true });
    } catch (error) {
        return res.status(500).json({ ok: false });
    }
});

app.get('/poll', (req, res) => {
    const name = req.query.username || req.query.id;
    const { since } = req.query;
    if (name) onlineUsers.set(name, Date.now());

    const now = Date.now();
    for (let [user, time] of onlineUsers.entries()) {
        if (now - time > 10000) onlineUsers.delete(user);
    }

    const sinceTime = parseInt(since) || 0;
    const newMessages = messages.filter(m => m.time > sinceTime);

    res.json({
        online: onlineUsers.size || 1,
        messages: newMessages
    });
});

// =========================================================
// ระบบจัดการโพสต์
// =========================================================
let cachedPosts = []; 

let lastFetchTime = 0;
const CACHE_DURATION = 240 * 1000; //  วินาที
// =========================================================
// ✅ ระบบจำกัดโพสต์วันละ 1 ครั้ง (ป้องกันโกงวันที่)
// =========================================================

// ตรวจสอบสิทธิ์ — เซิร์ฟเวอร์เป็นคนบอกวันที่จริง ไม่เชื่อมือถือ!
app.get('/check-daily-limit', async (req, res) => {
  const { email } = req.query; // ❌ ไม่รับวันจากมือถือเด็ดขาด!
  if (!email) return res.json({ hasPosted: false });

  try {
    // ✅ เซิร์ฟเวอร์คำนวณวันที่จริงเอง
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const docId = `${email}_${today}`;
    const doc = await db.collection('user_daily_limits').doc(docId).get();
    res.json({ hasPosted: doc.exists, serverDate: today });
  } catch (e) {
    console.error('เช็คสิทธิ์ล้มเหลว:', e);
    res.json({ hasPosted: false });
  }
});

// บันทึกโพสต์ + บันทึกสิทธิ์ — เซิร์ฟเวอร์เป็นคนกำหนดวันที่
app.post('/save-post', async (req, res) => {
  const { text, images, userId, userName, userProfileImage } = req.body;
  if (!userId) return res.status(400).json({ error: 'ขาดข้อมูลผู้ใช้' });

  try {
    // ✅ เซิร์ฟเวอร์กำหนดวันที่เอง ไม่เชื่อจากแอป
    const today = new Date().toISOString().slice(0, 10);
    const docId = `${userId}_${today}`;

    // 🔐 เช็คก่อนว่าวันนี้โพสต์ไปแล้วหรือยัง
    const limitDoc = await db.collection('user_daily_limits').doc(docId).get();
    if (limitDoc.exists) {
      return res.status(429).json({ error: 'โพสต์ได้ 1 ครั้งต่อวันเท่านั้นครับ' });
    }

    // ✅ บันทึกโพสต์ลง Firestore
    const postData = {
      text: text || '',
      images: images || [],
      timestamp: Date.now(),
      userId: userId,
      userName: userName || 'ไม่ระบุชื่อ',
      userProfileImage: userProfileImage || ''
    };
    const postRef = await db.collection('public_posts').add(postData);

    // ✅ บันทึกสิทธิ์ว่าโพสต์แล้ววันนี้
    await db.collection('user_daily_limits').doc(docId).set({
      userEmail: userId,
      date: today,
      postCount: 1,
      lastPostAt: Date.now()
    });

    // อัปเดตแคช
    cachedPosts.unshift({ id: postRef.id, ...postData });
    if (cachedPosts.length > 20) cachedPosts.pop();

    res.json({ success: true, postId: postRef.id });
  } catch (e) {
    console.error('บันทึกโพสต์ล้มเหลว:', e);
    res.status(500).json({ error: 'บันทึกไม่สำเร็จ' });
  }
});

// ดึงรายการโพสต์ทั้งหมด
app.get('/get-posts', async (req, res) => {
  try {
    const now = Date.now();
    if (cachedPosts.length === 0 || now - lastFetchTime > CACHE_DURATION) {
      const snapshot = await db.collection('public_posts')
        .orderBy('timestamp', 'desc')
        .limit(50)
        .get();
      
      cachedPosts = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      lastFetchTime = now;
    }
    res.json({ data: cachedPosts });
  } catch (e) {
    console.error('โหลดโพสต์ล้มเหลว:', e);
    res.json({ data: [] });
  }
});

// อย่าลืมบรรทัดนี้ไว้ท้ายสุดไฟล์นะครับ!
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ เซิร์ฟเวอร์ทำงานที่พอร์ต ${PORT}`);
});