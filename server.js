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
// ระบบจัดการโพสต์สาธารณะ
// =========================================================
let cachedPosts = []; 
let lastFetchTime = 0;
const CACHE_DURATION = 300 * 1000; // 4 นาที

// ตรวจสอบสิทธิ์โพสต์วันละ 1 ครั้ง
app.get('/check-daily-limit', async (req, res) => {
  const { email } = req.query;
  if (!email) return res.json({ hasPosted: false });

  try {
    const today = new Date().toISOString().slice(0, 10);
    const docId = `${email}_${today}`;
    const doc = await db.collection('user_daily_limits').doc(docId).get();
    res.json({ hasPosted: doc.exists, serverDate: today });
  } catch (e) {
    console.error('เช็คสิทธิ์ล้มเหลว:', e);
    res.json({ hasPosted: false });
  }
});

// บันทึกโพสต์สาธารณะ
app.post('/save-post', async (req, res) => {
  const { text, images, userId, userName, userProfileImage } = req.body;
  if (!userId) return res.status(400).json({ error: 'ขาดข้อมูลผู้ใช้' });

  try {
    const today = new Date().toISOString().slice(0, 10);
    const docId = `${userId}_${today}`;

    const limitDoc = await db.collection('user_daily_limits').doc(docId).get();
    if (limitDoc.exists) {
      return res.status(429).json({ error: 'โพสต์ได้ 1 ครั้งต่อวันเท่านั้นครับ' });
    }

    const postData = {
      text: text || '',
      images: images || [],
      timestamp: Date.now(),
      userId: userId,
      userName: userName || 'ไม่ระบุชื่อ',
      userProfileImage: userProfileImage || ''
    };
    const postRef = await db.collection('public_posts').add(postData);

    await db.collection('user_daily_limits').doc(docId).set({
      userEmail: userId,
      date: today,
      postCount: 1,
      lastPostAt: Date.now()
    });

    cachedPosts.unshift({ id: postRef.id, ...postData });
    if (cachedPosts.length > 20) cachedPosts.pop();

    res.json({ success: true, postId: postRef.id });
  } catch (e) {
    console.error('บันทึกโพสต์ล้มเหลว:', e);
    res.status(500).json({ error: 'บันทึกไม่สำเร็จ' });
  }
});

// ดึงรายการโพสต์สาธารณะ
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

// =========================================================
// ✅ ระบบสินค้า / ขาย / ซื้อ / งาน (เพิ่มใหม่)
// =========================================================
let cachedProducts = [];
let lastProductFetchTime = 0;

// ดึงรายการสินค้า+งาน (แคช 4 นาที)
app.get('/api/products', async (req, res) => {
  try {
    const now = Date.now();
    if (cachedProducts.length === 0 || now - lastProductFetchTime > CACHE_DURATION) {
      const snapshot = await db.collection('products')
        .orderBy('createdAt', 'desc')
        .limit(100)
        .get();
      
      cachedProducts = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      lastProductFetchTime = now;
    }
    res.json(cachedProducts);
  } catch (e) {
    console.error('โหลดสินค้าล้มเหลว:', e);
    res.json([]);
  }
});

// บันทึกสินค้า/ขาย/ซื้อ/งาน + จำกัด 3 รายการ
app.post('/save-product', async (req, res) => {
  const { 
    name, price, description, imageUrls, 
    latitude, longitude, ownerEmail,
    messengerLink, lineLink, userProfileImage,
    type,
    title, companyName, salary, phone,  // สำหรับงาน
    images  // รองรับชื่อฟิลด์ 2 แบบ
  } = req.body;

  const userId = ownerEmail;
  if (!userId) return res.status(400).json({ error: 'ขาดข้อมูลผู้ใช้' });

  try {
    // 🔐 นับจำนวนรายการที่มีอยู่ จำกัดสูงสุด 3
    const userDocs = await db.collection('products')
      .whereEqualTo('ownerEmail', userId)
      .get();
    
    if (userDocs.size >= 3) {
      return res.status(429).json({ error: 'คุณลงประกาศได้สูงสุด 3 รายการเท่านั้น! กรุณาลบรายการเก่าก่อน' });
    }

    // ✅ เตรียมข้อมูล (รองรับทั้งสินค้าและงาน)
    const data = {
      // สินค้า/ขาย/ซื้อ
      name: name || '',
      price: price || 0,
      description: description || '',
      imageUrls: imageUrls || images || [],
      // งาน
      title: title || '',
      companyName: companyName || '',
      salary: salary || 0,
      phone: phone || '',
      // ทั่วไป
      latitude: latitude || 0,
      longitude: longitude || 0,
      ownerEmail: userId,
      messengerLink: messengerLink || '',
      lineLink: lineLink || '',
      userProfileImage: userProfileImage || '',
      type: type || 'sell',
      createdAt: Date.now()
    };

    // ✅ บันทึก
    const ref = await db.collection('products').add(data);

    // ✅ อัปเดตแคช
    cachedProducts.unshift({ id: ref.id, ...data });
    if (cachedProducts.length > 100) cachedProducts.pop();

    res.json({ success: true, id: ref.id });
  } catch (e) {
    console.error('บันทึกสินค้าล้มเหลว:', e);
    res.status(500).json({ error: 'บันทึกไม่สำเร็จ' });
  }
});

// ดึงข้อมูลผู้ใช้
app.get('/get-user', async (req, res) => {
  const { email } = req.query;
  if (!email) return res.json({});

  try {
    const doc = await db.collection('users').doc(email).get();
    if (doc.exists) {
      res.json(doc.data());
    } else {
      res.json({});
    }
  } catch (e) {
    console.error('โหลดข้อมูลผู้ใช้ล้มเหลว:', e);
    res.json({});
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ เซิร์ฟเวอร์ทำงานที่พอร์ต ${PORT}`);
});