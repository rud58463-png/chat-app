app.post('/chat', async (req, res) => {
    try {
        const { id, text } = req.body;
        if (!text) return res.status(400).json({ ok: false });

        // 1. บันทึกข้อความของผู้ใช้ลงระบบ
        const userMessage = {
            id: Math.random().toString(36).substring(2),
            username: id === "ai_lumen_bot" ? "ลูเมน (Lumen)" : "rudjiroad 123", // ใช้ชื่อตามที่คุณล็อกอิน
            text: text,
            time: Date.now(),
            profile: id === "ai_lumen_bot" ? "https://cdn-icons-png.flaticon.com/512/4712/4712109.png" : undefined
        };
        messages.push(userMessage);

        // 2. ถ้าข้อความนั้นไม่ใช่บอทร่างเอง ให้เรียก Gemini AI ตอบกลับทันที
        if (id !== "ai_lumen_bot") {
            // เรียก Gemini API
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: text,
                config: {
                    systemInstruction: "คุณชื่อ 'ลูเมน (Lumen)' เป็นผู้ช่วย AI อัจฉริยะที่ใจดี เป็นกันเอง และมีความรู้รอบตัวสูง",
                    temperature: 0.7,
                }
            });

            const replyText = response.text || (response.candidates && response.candidates[0]?.content?.parts[0]?.text) || "ขออภัยค่ะ ฉันประมวลผลไม่ทัน";

            // 3. บันทึกคำตอบของ "ลูเมน" ลงในห้องแชทด้วยทันที
            const botMessage = {
                id: Math.random().toString(36).substring(2),
                username: "ลูเมน (Lumen)",
                text: replyText,
                time: Date.now() + 100, // ให้เวลาเหลื่อมกันเล็กน้อยเรียงลำดับถูก
                profile: "https://cdn-icons-png.flaticon.com/512/4712/4712109.png"
            };
            messages.push(botMessage);
        }

        if (messages.length > 50) messages.shift();

        return res.json({ ok: true });
    } catch (error) {
        console.error("Error in /chat:", error);
        return res.status(500).json({ ok: false });
    }
});