const express = require("express");
const app = express();
const path = require("path");

const admin = require("firebase-admin");

// โหลด Firebase Key
let serviceAccount;

try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    console.log("✅ โหลด Firebase จาก Environment");
  } else {
    serviceAccount = require("./serviceAccountKey.json");
    console.log("✅ โหลด Firebase จากไฟล์");
  }
} catch (err) {
  console.error("❌ โหลดคีย์ Firebase ไม่สำเร็จ");
  console.error(err);
  process.exit(1);
}

// เริ่มต้น Firebase
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

console.log("✅ Firebase Admin พร้อมใช้งาน");

app.use(express.json({ limit: "50mb" })); 
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// ให้เซิร์ฟเวอร์แสดงไฟล์ในโฟลเดอร์ public
app.use(express.static(path.join(__dirname, 'public')));

const messages = [];
const clients = new Map();
const joinedUsers = new Set();

// ตรวจสอบสิทธิ์ด้วย Firebase Token
async function verifyToken(req, res, next) {
  const idToken = req.headers.authorization?.split(' ')[1];
  if (!idToken) return res.status(401).json({ ok: false, reason: 'unauthorized' });
  
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.user = decodedToken;
    next();
  } catch (err) {
    console.error("❌ ตรวจสอบโทเค็นไม่ผ่าน:", err.message);
    return res.status(401).json({ ok: false, reason: 'invalid_token' });
  }
}

// ตรวจจับคนออกจากห้องแชทแบบ Real-time
setInterval(() => {
    const now = Date.now();
    for(const [id, c] of clients){
        if(now - c.lastSeen > 4000) {
            joinedUsers.delete(c.username);
            clients.delete(id); 
        }
    }
}, 2000);

// เข้าร่วมห้องแชท
app.post('/join', verifyToken, (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    const { id } = req.body;
    const firebaseUser = req.user;
    
    if(!id) return res.json({ ok: false, reason: 'invalid_access' });
    
    const username = firebaseUser.name || firebaseUser.email.split('@')[0];
    const profile = firebaseUser.picture || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
    const uid = firebaseUser.uid;

    if (!clients.has(id) && !joinedUsers.has(username) && joinedUsers.size >= 28) {
        return res.json({ ok: false, reason: 'full' });
    }
    
    if(messages.length > 200) messages.shift();
    
    clients.set(id, { 
        username: username, 
        profile: profile, 
        uid: uid,
        lastSeen: Date.now() 
    });
    res.json({ ok: true, username, profile });
});

// ส่งข้อความ
app.post('/chat', verifyToken, (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    const { id, text } = req.body;
    const user = clients.get(id);
    
    if(!user || !text) return res.json({ ok: false });
    
    user.lastSeen = Date.now(); 
    messages.push({ type:'message', username: user.username, profile: user.profile, text, time: Date.now() });
    
    if(messages.length > 200) messages.shift();
    res.json({ ok: true });
});

// ดึงข้อความใหม่
app.get('/poll', verifyToken, (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    const { id, since } = req.query;
    
    if(clients.has(id)) clients.get(id).lastSeen = Date.now();
    
    const sinceTime = parseInt(since) || 0;
    const newMsgs = messages.filter(m => m.time > sinceTime);
    res.json({ online: clients.size, messages: newMsgs, serverTime: Date.now() });
});

// ออกจากห้องแชท
app.post('/leave', verifyToken, (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    const { id } = req.body;
    if(clients.has(id)) {
        const user = clients.get(id);
        joinedUsers.delete(user.username);
        clients.delete(id);
    }
    res.json({ ok: true });
});

// เส้นทางหลัก
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ เซิร์ฟเวอร์ทำงานที่พอร์ต ${PORT}`));