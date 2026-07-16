const express = require('express');
const app = express();

app.use(express.json({ limit: "50mb" })); 
app.use(express.urlencoded({ limit: "50mb", extended: true }));

const messages = [];
const clients = new Map();
const joinedUsers = new Set();

// ระบบตรวจจับคนออกจากห้องแชทแบบ Real-time
setInterval(() => {
    const now = Date.now();
    for(const [id, c] of clients){
        if(now - c.lastSeen > 4000) {
            joinedUsers.delete(c.username);
            clients.delete(id); 
        }
    }
}, 2000);

// ✅ ตรวจสอบข้อมูลจากแอปเท่านั้น - ไม่รับชื่อที่กรอกเอง
app.post('/join', (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    const { id, username, profile, uid } = req.body;
    // ต้องมี uid จากระบบบัญชีแอปด้วยเสมอ
    if(!id || !username || !uid) return res.json({ ok: false, reason: 'invalid_access' });
    
    const trimmedUsername = username.trim();

    // บล็อกถ้าห้องเต็ม 28 คน
    if (!clients.has(id) && !joinedUsers.has(trimmedUsername) && joinedUsers.size >= 28) {
        return res.json({ ok: false, reason: 'full' });
    }
    
    if(messages.length > 200) messages.shift();
    
    clients.set(id, { 
        username: trimmedUsername, 
        profile: profile || 'https://cdn-icons-png.flaticon.com/512/149/149071.png', 
        uid: uid,
        lastSeen: Date.now() 
    });
    res.json({ ok: true });
});

app.post('/chat', (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    const { id, text } = req.body;
    const user = clients.get(id);
    
    if(!user || !text) return res.json({ ok: false });
    
    user.lastSeen = Date.now(); 
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

app.post('/leave', (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    const { id } = req.body;
    if(clients.has(id)) {
        const user = clients.get(id);
        joinedUsers.delete(user.username);
        clients.delete(id);
    }
    res.json({ ok: true });
});

app.get('/', (req, res) => 
    res.send(`<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>ห้องแชทรวม</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { 
    margin: 0; 
    background: #0d0e12; 
    color: #f1f2f6; 
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; 
    display: flex; 
    flex-direction: column; 
    height: 100vh; 
    overflow: hidden; 
  }
  header { 
    background: #16171e; 
    padding: 14px 16px; 
    border-bottom: 1px solid #232530; 
    flex-shrink: 0; 
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .header-top {
    flex: 1;
  }
  h2 { margin: 0; font-size: 18px; font-weight: 600; color: #fff; display: flex; align-items: center; gap: 6px; }
  #online { font-size: 12px; color: #a4b0be; margin-top: 4px; display: flex; align-items: center; gap: 4px; }
  #myName { font-size: 12px; color: #747d8c; margin-top: 2px; }
  #myProfile { 
    width: 48px; height: 48px; border-radius: 50%; object-fit: cover; 
    border: 2px solid #0056ff; cursor: pointer; background: #1e202c; 
    transition: transform 0.2s, border-color 0.2s;
    box-shadow: 0 0 10px rgba(0, 86, 255, 0.2);
    flex-shrink: 0;
  }
  #myProfile:active { transform: scale(0.95); border-color: #00a2ff; }

  /* ✅ ซ่อนช่องกรอกชื่อ+ปุ่ม Join ตลอดเวลา */
  #joinBox { 
    display: none !important;
  }

  #errorBlock {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 20px;
    text-align: center;
    color: #ff6b6b;
    font-size: 18px;
  }
  #chat { flex: 1; overflow-y: auto; padding: 16px; background: #0d0e12; scroll-behavior: smooth; display: none; }
  .msg { 
    background: #16171e; margin-bottom: 12px; padding: 12px; border-radius: 14px; 
    border: 1px solid #1f212c; max-width: 90%; animation: fadeIn 0.2s ease-out;
  }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
  .messageRow { display: flex; gap: 10px; align-items: flex-start; }
  .profileImg { width: 36px; height: 36px; border-radius: 50%; object-fit: cover; flex-shrink: 0; background: #1e202c; border: 1px solid #2d3043; }
  .messageContent { flex: 1; word-break: break-all; }
  .messageName { font-weight: 600; color: #54a0ff; margin-bottom: 3px; font-size: 13px; }
  .messageText { font-size: 14px; color: #e1e2eb; line-height: 1.4; }
  .joinMsg { 
    text-align: center; font-size: 12px; padding: 6px 12px; background: #16171e; 
    margin: 10px auto; border-radius: 20px; border: 1px solid #232530; font-weight: 500; max-width: fit-content;
  }
  #bottomBar { 
    display: none; 
    gap: 8px; padding: 12px 16px; border-top: 1px solid #232530; 
    background: #16171e; flex-shrink: 0; box-shadow: 0 -4px 12px rgba(0,0,0,0.1);
  }
  #msg { 
    flex: 1; border: 1px solid #2d3043; outline: none; border-radius: 24px; 
    padding: 10px 16px; font-size: 14px; background: #0d0e12; color: white; transition: border-color 0.2s;
  }
  #msg:focus { border-color: #0056ff; }
  #sendBtn { 
    border: none; border-radius: 24px; padding: 10px 20px; font-size: 14px; 
    cursor: pointer; background: #0056ff; color: #fff; font-weight: bold; transition: background 0.2s;
  }
  #sendBtn:active { background: #0041c2; }
</style>
</head>
<body>

<div id="errorBlock">⚠️ กรุณาเข้าสู่ระบบผ่านแอป Rudjiroad ก่อนใช้งานแชท</div>

<header id="chatHeader" style="display: none;">
  <img id="myProfile" src="https://cdn-icons-png.flaticon.com/512/149/149071.png" alt="รูปโปรไฟล์">
  <div class="header-top">
    <h2>💬 ห้องแชทรวม</h2>
    <div id="online">👥 ออนไลน์: 0 คน</div>
    <div id="myName">👤 ชื่อของคุณ: <span id="displayName"></span></div>
  </div>
</header>

<div id="joinBox">
  <input type="text" id="username" placeholder="กรอกชื่อผู้ใช้ที่นี่...">
  <button id="joinBtn" onclick="joinChat()">กดเพื่อ Join เข้าแชท</button>
</div>

<div id="chat"></div>

<div id="bottomBar" id="inputBar">
  <input id="msg" placeholder="พิมพ์ข้อความ...">
  <button id="sendBtn" onclick="sendMsg()">ส่ง</button>
</div>

<script>
var chat = document.getElementById("chat");
var imgProfileElement = document.getElementById("myProfile");
var params = new URLSearchParams(window.location.search);

// ✅ รับข้อมูลจากแอปเท่านั้น
var appName = params.get("name");
var appUid = params.get("uid");
var appAvatar = params.get("avatar");

var joined = false;
var isFirstJoinTriggered = false; 
var myId = "id_" + Math.random().toString(36).slice(2);
var myUsername = "";
var myUid = "";
var myProfile = "https://cdn-icons-png.flaticon.com/512/149/149071.png";
var lastTime = Date.now() - 30000; 

// ✅ ตรวจสอบว่ามาจากแอปจริงหรือไม่
if(!appName || !appUid){
  // แสดงข้อความแจ้งเตือนเท่านั้น - ไม่ให้ใช้งาน
} else {
  // แสดงหน้าแชทเมื่อข้อมูลครบถ้วน
  document.getElementById("errorBlock").style.display = "none";
  document.getElementById("chatHeader").style.display = "flex";
  document.getElementById("chat").style.display = "block";
  document.getElementById("bottomBar").style.display = "flex";
  
  // ตั้งค่าข้อมูลผู้ใช้จากแอป
  myUsername = appName;
  myUid = appUid;
  if(appAvatar) myProfile = appAvatar;
  document.getElementById("displayName").textContent = myUsername;
  imgProfileElement.src = myProfile;
  
  // เข้าร่วมแชทอัตโนมัติ
  setTimeout(() => {
    doJoin(myUsername, myProfile, myUid);
  }, 300);
}

function setStatus(msg){ document.getElementById("myName").innerHTML = msg; }

function xhr(method, url, data, cb){
    var x = new XMLHttpRequest();
    x.open(method, url, true);
    x.timeout = 5000; 
    if(method === "POST") x.setRequestHeader("Content-Type", "application/json");
    x.onreadystatechange = function(){
        if(x.readyState === 4){ try{ cb(JSON.parse(x.responseText)); }catch(e){ cb(null); } }
    };
    x.onerror = function(){ cb(null); };
    x.ontimeout = function(){ cb(null); };
    x.send(data ? JSON.stringify(data) : null);
}

function doJoin(username, profile, uid){
    setStatus("⏳ กำลังเชื่อมต่อห้องแชท...");
    var timeout = setTimeout(function(){
        setStatus("⚠️ เชื่อมต่อไม่ได้ ลองใหม่อีกครั้ง");
    }, 6000);
    xhr("POST", "/join", { id: myId, username: username, profile: profile, uid: uid }, function(data){
        clearTimeout(timeout);
        if(data && data.ok){
            joined = true;
            setStatus("👤 ชื่อของคุณ: " + username);
            try { localStorage.setItem("savedUsername", username); localStorage.setItem("profileImage", profile); } catch(e){}
            poll();
        } else if(data && data.reason === 'full') {
            setStatus("🚫 ห้องแชทเต็มแล้ว! (28/28 คน)");
        } else if(data && data.reason === 'invalid_access') {
            setStatus("⚠️ ไม่มีสิทธิ์เข้าใช้งาน");
        } else {
            setStatus("⚠️ เข้าร่วมไม่สำเร็จ ลองใหม่");
        }
    });
}

// ❌ ปิดการใช้งานปุ่มกรอกชื่อเองทั้งหมด
function joinChat(){
    alert("กรุณาเข้าสู่ระบบผ่านแอป Rudjiroad เท่านั้น");
}

function sendMsg(){
    if(!joined){ setStatus("⚠️ รอการเชื่อมต่อสักครู่..."); return; }
    var msg = document.getElementById("msg");
    var text = msg.value.trim();
    if(text === "") return;
    var tempText = text;
    msg.value = ""; 
    xhr("POST", "/chat", { id: myId, text: tempText }, function(res){
        if(!res || !res.ok) { msg.value = tempText; setStatus("⚠️ ส่งข้อความไม่สำเร็จ ลองอีกครั้ง"); }
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
                    chat.innerHTML += '<div class="joinMsg">' + m.username + ' เข้าร่วมห้องแชท</div>';
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
    try { window.AppInventor.setWebViewString("PICK_IMAGE"); } catch(e) { alert("ต้องเปลี่ยนรูปผ่านหน้าแอปเท่านั้น"); }
};

var lastWVS = "";
setInterval(function(){
    try{
        var wvs = window.AppInventor.getWebViewString();
        if(!wvs) return;
        if(wvs !== "PICK_IMAGE" && wvs !== lastWVS && wvs.length > 100 && !wvs.startsWith("LOAD_DATA")){
            lastWVS = wvs;
            var base64Data = wvs;
            if (!base64Data.startsWith("data:image")) { base64Data = "data:image/jpeg;base64," + base64Data; }
            var img = new Image();
            img.src = base64Data;
            img.onload = function() {
                var canvas = document.createElement('canvas');
                var ctx = canvas.getContext('2d');
                var MAX_WIDTH = 300; 
                var scaleSize = MAX_WIDTH / img.width;
                if(img.width > MAX_WIDTH) { canvas.width = MAX_WIDTH; canvas.height = img.height * scaleSize; } 
                else { canvas.width = img.width; canvas.height = img.height; }
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                var resizedBase64 = canvas.toDataURL('image/jpeg', 0.8);
                myProfile = resizedBase64;
                imgProfileElement.src = resizedBase64;
                document.querySelectorAll(".profileImg").forEach(function(el){
                    if(el.getAttribute("data-user") === myUsername){ el.src = resizedBase64; }
                });
                try{ localStorage.setItem("profileImage", resizedBase64); }catch(e){}
                if(joined){
                    xhr("POST", "/join", { id: myId, username: myUsername, profile: resizedBase64, uid: myUid }, function(){
                        setStatus("👤 ชื่อของคุณ: " + myUsername + " (อัปเดตรูปแล้ว)");
                    });
                }
            };
            try{ window.AppInventor.setWebViewString(""); }catch(err){}
        }
    }catch(e){}
}, 500);

function startPolling() {
    if (!joined) { setTimeout(startPolling, 500); return; }
    poll();
    setTimeout(startPolling, 1500); 
}
if(appName && appUid) startPolling();

function disconnectFromServer() {
    if (joined && myId) {
        var x = new XMLHttpRequest();
        x.open("POST", "/leave", false);
        x.setRequestHeader("Content-Type", "application/json");
        x.send(JSON.stringify({ id: myId }));
    }
}
window.addEventListener("beforeunload", disconnectFromServer);
window.addEventListener("unload", disconnectFromServer);

document.addEventListener("visibilitychange", function() {
    if (!document.hidden && joined) poll();
});
</script>       
</body>
</html>`));

app.listen(3000, () => console.log('Server running on port 3000'));