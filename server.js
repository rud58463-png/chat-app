const express = require('express');
const app = express();

// ขยายขนาดการรับส่งรูปภาพผ่าน Base64 ให้ลื่นไหล ไม่หลุดบ่อย
app.use(express.json({ limit: "50mb" })); 
app.use(express.urlencoded({ limit: "50mb", extended: true }));

const messages = [];
const clients = new Map();

// ระบบตรวจจับคนออกจากห้องแชท (ปรับเวลาให้เสถียรขึ้น ป้องกันการหลุดปล่อย)
setInterval(() => {
    const now = Date.now();
    for(const [id, c] of clients){
        // ขยายเวลาเช็กเป็น 20 วินาที เพื่อป้องกันระบบมองว่าหลุดตอนที่อินเทอร์เน็ตสะดุดชั่วคราว
        if(now - c.lastSeen > 10000) {
            messages.push({
                type: 'join',
                username: `<span style="color: #ff4a4a;">🔴 ${c.username} ออกจากห้องแชทแล้ว</span>`,
                time: Date.now()
            });
            clients.delete(id); 
        }
    }
}, 20000);

app.post('/join', (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    const { id, username, profile } = req.body;
    if(!id || !username) return res.json({ ok: false });
    
    // แจ้งเตือนเข้าห้องเฉพาะตอนที่เข้ามาใหม่จริงๆ เท่านั้น ป้องกันข้อความเด้งซ้ำซ้อน
    if (!clients.has(id)) {
        messages.push({ 
            type: 'join', 
            username: `<span style="color: #2ed573;">🟢 ${username} เข้าห้องแชทแล้ว</span>`, 
            time: Date.now() 
        });
    }

    if(messages.length > 200) messages.shift();
    
    clients.set(id, { username, profile: profile || 'https://cdn-icons-png.flaticon.com/512/149/149071.png', lastSeen: Date.now() });
    res.json({ ok: true });
});

app.post('/chat', (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    const { id, text } = req.body;
    const user = clients.get(id);
    
    if(!user || !text) return res.json({ ok: false });
    
    user.lastSeen = Date.now(); // อัปเดตเวลาออนไลน์ทันทีที่ส่งข้อความ
    messages.push({ type:'message', username: user.username, profile: user.profile, text, time: Date.now() });
    
    if(messages.length > 200) messages.shift();
    res.json({ ok: true });
});

app.get('/poll', (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    const { id, since } = req.query;
    
    if(clients.has(id)) clients.get(id).lastSeen = Date.now();
    
    const sinceTime = parseInt(since) || 0;
    const newMsgs = messages.filter(m => m.time > sinceTime);
    res.json({ online: clients.size, messages: newMsgs, serverTime: Date.now() });
});

app.get('/', (req, res) => 
    res.send(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>Chat Room</title>
<style>
*{ box-sizing:border-box; }
body{ margin:0; background:#111; color:white; font-family:sans-serif; display:flex; flex-direction:column; height:100vh; overflow:hidden; }
header{ background:#1b1b1b; padding:15px; border-bottom:1px solid #333; flex-shrink:0; display:flex; justify-content:space-between; align-items:center; }
.header-info { flex:1; }
h2{ margin:0; font-size:20px; }
#online,#myName{ margin-top:6px; font-size:14px; color:#aaa; }
#myProfile{ width:55px; height:55px; border-radius:50%; object-fit:cover; border:2px solid #00a2ff; cursor:pointer; background:#222; display:block; }
#joinBox{ background:#222; padding:15px; border-bottom:2px solid #333; display:flex; flex-direction:column; gap:10px; flex-shrink:0; }
#joinBox input[type="text"]{ width:100%; border:none; outline:none; border-radius:8px; padding:12px; font-size:16px; background:#333; color:white; }
#joinBtn{ width:100%; border:none; border-radius:8px; padding:12px; font-size:16px; cursor:pointer; background:#007bff; color:white; font-weight:bold; }
#chat{ flex:1; overflow-y:auto; padding:12px; background:#181818; }
.msg{ background:#262626; margin-bottom:10px; padding:10px; border-radius:10px; border:1px solid #333; }
.messageRow{ display:flex; gap:10px; align-items:flex-start; }
.profileImg{ width:40px; height:40px; border-radius:50%; object-fit:cover; flex-shrink:0; }
.messageContent{ flex:1; word-break:break-all; }
.messageName{ font-weight:bold; color:#00a2ff; margin-bottom:2px; font-size:14px; }
.messageText{ font-size:15px; color:#eee; }
.joinMsg{ text-align:center; font-size:13px; padding:6px; background:#1f1f1f; margin-bottom:10px; border-radius:6px; border: 1px dashed #333; font-weight:bold; }
#bottomBar{ display:flex; gap:8px; padding:12px; border-top:1px solid #333; background:#1b1b1b; flex-shrink:0; }
#msg{ flex:1; border:none; outline:none; border-radius:8px; padding:12px; font-size:16px; background:#252525; color:white; }
#sendBtn{ border:none; border-radius:8px; padding:12px 20px; font-size:16px; cursor:pointer; background:#fff; color:#000; font-weight:bold; }
</style>
</head>
<body>
<header>
  <div class="header-info">
    <h2>💬 ห้องแชทรวม</h2>
    <div id="online">👥 ออนไลน์: 0 คน</div>
    <div id="myName">👤 ชื่อของคุณ: ยังไม่ได้ Join</div>
  </div>
  <img id="myProfile" src="https://cdn-icons-png.flaticon.com/512/149/149071.png">
</header>
<div id="joinBox">
  <input type="text" id="username" placeholder="กรอกชื่อผู้ใช้ที่นี่...">
  <button id="joinBtn" onclick="joinChat()">กดเพื่อ Join เข้าแชท</button>
</div>
<div id="chat"></div>
<div id="bottomBar">
  <input id="msg" placeholder="พิมพ์ข้อความ...">
  <button id="sendBtn" onclick="sendMsg()">ส่ง</button>
</div>
<script>
var chat = document.getElementById("chat");
var imgProfileElement = document.getElementById("myProfile");
var params = new URLSearchParams(window.location.search);
var appName = params.get("name");
var joined = false;
var myId = "id_" + Math.random().toString(36).slice(2);
var myUsername = "";
var myProfile = "https://cdn-icons-png.flaticon.com/512/149/149071.png";
var lastTime = Date.now() - 30000; // ดึงข้อความย้อนหลัง 30 วินาทีแรกที่เข้าแชท ป้องกันข้อความไม่ขึ้น

try {
    var savedName = localStorage.getItem("savedUsername");
    var savedImg = localStorage.getItem("profileImage");
    if(savedImg) { myProfile = savedImg; imgProfileElement.src = savedImg; }
    if(savedName) { document.getElementById("username").value = savedName; }
} catch(e){}

function setStatus(msg){ document.getElementById("myName").innerHTML = msg; }

function xhr(method, url, data, cb){
    var x = new XMLHttpRequest();
    x.open(method, url, true);
    x.timeout = 8000; // timeout 8 วินาที ป้องกันค้าง
    if(method === "POST") x.setRequestHeader("Content-Type", "application/json");
    x.onreadystatechange = function(){
        if(x.readyState === 4){
            try{ cb(JSON.parse(x.responseText)); }catch(e){ cb(null); }
        }
    };
    x.onerror = function(){ cb(null); };
    x.ontimeout = function(){ cb(null); }; // เพิ่มบรรทัดนี้
    x.send(data ? JSON.stringify(data) : null);
}

function doJoin(username, profile){
    myUsername = username;
    myProfile = profile || myProfile;
    setStatus("⏳ กำลัง Join...");
    var timeout = setTimeout(function(){
        setStatus("⚠️ เชื่อมต่อ server ไม่ได้ ลองรีเฟรช");
        document.getElementById("joinBox").style.display = "flex";
    }, 8000);
    
    xhr("POST", "/join", { id: myId, username: username, profile: myProfile }, function(data){
        if(data && data.ok){
            joined = true;
            setStatus("👤 ชื่อของคุณ: " + username);
            imgProfileElement.src = myProfile;
            try {
                localStorage.setItem("savedUsername", myUsername);
                localStorage.setItem("profileImage", myProfile);
            } catch(e){}
            document.getElementById("joinBox").style.display = "none";
            poll();
        } else {
            setStatus("⚠️ Join ไม่สำเร็จ ลองใหม่");
        }
    });
}

function joinChat(){
    var username = document.getElementById("username").value.trim();
    if(username === ""){ setStatus("⚠️ กรุณากรอกชื่อก่อน"); return; }
    doJoin(username, myProfile);
}

function sendMsg(){
    if(!joined){ setStatus("⚠️ กรุณา Join ก่อน"); return; }
    var msg = document.getElementById("msg");
    var text = msg.value.trim();
    if(text === "") return;
    var tempText = text;
    msg.value = ""; // เคลียร์ช่องพิมพ์ทันที
    xhr("POST", "/chat", { id: myId, text: tempText }, function(res){
        if(!res || !res.ok) {
            msg.value = tempText; // ถ้าส่งไม่ไป ให้คืนข้อความกลับมาพิมพ์ใหม่
            setStatus("⚠️ ส่งข้อความไม่สำเร็จ ลองอีกครั้ง");
        } else {
            poll(); // ส่งผ่านปุ๊บ ให้ดึงแชทมาโชว์ทันที ไม่ต้องรอลูป
        }
    });
}

function poll(){
    if(!joined) return;
    xhr("GET", "/poll?id=" + myId + "&since=" + lastTime, null, function(data){
        if(!data) return;
        document.getElementById("online").innerHTML = "👥 ออนไลน์: " + data.online + " คน";
        if(data.messages && data.messages.length > 0){
            data.messages.forEach(function(m){
                if(m.type === "join"){
                    chat.innerHTML += '<div class="joinMsg">' + m.username + '</div>';
                } else {
                    chat.innerHTML += '<div class="msg"><div class="messageRow"><img class="profileImg" data-user="' + m.username + '" src="' + (m.profile || 'https://cdn-icons-png.flaticon.com/512/149/149071.png') + '"><div class="messageContent"><div class="messageName">' + m.username + '</div><div class="messageText">' + m.text + '</div></div></div></div>';
                }
                if(m.time > lastTime) lastTime = m.time;
            });
            chat.scrollTop = chat.scrollHeight;
        }
    });
}

document.getElementById("msg").addEventListener("keypress", function(e){
    if(e.key === "Enter"){ sendMsg(); }
});

imgProfileElement.onclick = function() {
    try { window.AppInventor.setWebViewString("PICK_IMAGE"); } catch(e) { setStatus("⚠️ ต้องกดผ่านหน้าจอแอปมือถือเท่านั้น"); }
};

var lastWVS = "";
    setInterval(function(){
        try{
            var wvs = window.AppInventor.getWebViewString();
            if(wvs && wvs !== "PICK_IMAGE" && wvs !== lastWVS){
                lastWVS = wvs;
                if(wvs.length > 100){
                    if (wvs.length > 10000000) { 
                        setStatus("⚠️ ขนาดรูปภาพใหญ่เกินไป");
                        try{ window.AppInventor.setWebViewString(""); }catch(err){}
                        return; 
                    }
                    var base64Data = wvs;
                    if (!base64Data.startsWith("data:image")) { base64Data = "data:image/jpeg;base64," + base64Data; }
                    myProfile = base64Data;
                    imgProfileElement.src = base64Data;
                    document.querySelectorAll(".profileImg").forEach(function(img){
                         if(img.getAttribute("data-user") === myUsername){
                             img.src = base64Data;
                            }
                        });
                    try{ localStorage.setItem("profileImage", base64Data); }catch(e){}
                    if(joined){
                        xhr("POST", "/join", { id: myId, username: myUsername, profile: base64Data }, function(){
                            setStatus("👤 ชื่อของคุณ: " + myUsername + " (อัปเดตรูปแล้ว)");
                        });
                    }
                    try{ window.AppInventor.setWebViewString(""); }catch(err){}
                }
            }
        }catch(e){}
    }, 500);

    function startPolling() {
        if (!joined) { setTimeout(startPolling, 500); return; }
        poll();
        setTimeout(startPolling, 2000);
    }
    startPolling();

    document.addEventListener("visibilitychange", function() {
        if (!document.hidden && joined) poll();
    });

</script>       
</body>
</html>`));
app.listen(3000, () => console.log('Server running on port 3000'));