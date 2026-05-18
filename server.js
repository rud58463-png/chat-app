const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static("public"));

function broadcast(data){

    const json = JSON.stringify(data);

    wss.clients.forEach(client => {

        if(client.readyState === WebSocket.OPEN){

            client.send(json);

        }

    });

}

function sendOnlineCount(){

    broadcast({
        type: "online",
        count: wss.clients.size
    });

}

wss.on("connection", (ws) => {

    ws.username = "Unknown";

    console.log("มีคนเชื่อมต่อ");

    sendOnlineCount();

    ws.on("message", (message) => {

        const data = JSON.parse(message);

        if(data.type === "join"){

            ws.username = data.username;

            console.log(ws.username + " เข้าห้อง");

            broadcast({
                type: "message",
                text: "🟢 " + ws.username + " เข้าห้อง"
            });

            sendOnlineCount();

        }

        if(data.type === "chat"){

            if(data.text.trim() !== ""){

                console.log(ws.username + ": " + data.text);

                broadcast({
                    type: "message",
                    text: ws.username + ": " + data.text
                });

            }

        }

    });

    ws.on("close", ()=>{

        console.log(ws.username + " ออกจากห้อง");

        broadcast({
            type: "message",
            text: "🔴 " + ws.username + " ออกจากห้อง"
        });

        sendOnlineCount();

    });

});

const PORT = process.env.PORT || 3000;

    server.listen(PORT, "0.0.0.0", ()=>{

    console.log("Server Running");

});