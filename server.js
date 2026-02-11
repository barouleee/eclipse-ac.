require('dotenv').config();
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(express.static('public'));
app.use(express.json());

// ---------- Load / Save keys from keys.json ----------
const KEYS_FILE = path.join(__dirname, 'keys.json');
let keysDB = [];

try {
    const data = fs.readFileSync(KEYS_FILE, 'utf8');
    keysDB = JSON.parse(data);
} catch {
    // If file doesn't exist or is empty, start with an empty array
    keysDB = [];
}

function saveKeys() {
    fs.writeFileSync(KEYS_FILE, JSON.stringify(keysDB, null, 2));
}

// ---------- Helper: generate a random key ----------
function generateKeyCode(duration) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'ECL-';
    for (let i = 0; i < 3; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    code += '-';
    for (let i = 0; i < 4; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code + '-' + duration;
}

// ---------- 1️⃣ GENERATE KEY ----------
app.post('/api/generate-key', (req, res) => {
    const { duration } = req.body; // '1day', '1week', '1month', '3months', 'lifetime', 'booster'
    if (!duration) return res.status(400).json({ success: false, error: 'Missing duration' });

    const key = generateKeyCode(duration);
    
    // Set max scans: booster = 10, others = unlimited (999999)
    const maxScans = duration === 'booster' ? 10 : 999999;
    
    const newKeyEntry = {
        key,
        type: duration,
        scansUsed: 0,
        maxScans,
        createdAt: new Date().toISOString()
    };
    
    keysDB.push(newKeyEntry);
    saveKeys();
    
    res.json({ success: true, key });
});

// ---------- 2️⃣ ACTIVATE KEY (validate and return info) ----------
app.post('/api/activate-key', (req, res) => {
    const { key } = req.body;
    const found = keysDB.find(k => k.key === key);
    if (!found) {
        return res.json({ success: false, error: 'Invalid key' });
    }
    // Return key info (type, scans left)
    const scansLeft = found.maxScans - found.scansUsed;
    res.json({
        success: true,
        type: found.type,
        scansLeft: scansLeft < 0 ? 0 : scansLeft,
        maxScans: found.maxScans
    });
});

// ---------- 3️⃣ SCAN DISCORD ID ----------
app.post('/api/scan', async (req, res) => {
    const { discordId, apiKey } = req.body;

    // 1. Validate license key
    const keyEntry = keysDB.find(k => k.key === apiKey);
    if (!keyEntry) {
        return res.json({ success: false, error: 'Invalid or missing license key' });
    }
    if (keyEntry.scansUsed >= keyEntry.maxScans) {
        return res.json({ success: false, error: 'Scan limit reached', limitReached: true });
    }

    // 2. Call Discord API
    try {
        const discordRes = await axios.get(`https://discord.com/api/v10/users/${discordId}`, {
            headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` }
        });
        const user = discordRes.data;

        // 3. Simulate "cheater database" – you can replace this with your own list
        const cheaterIds = [
            '1202310138388807743', // dan875_21371
            '1052296368061960252'  // supermario4184
        ];
        const isCheater = cheaterIds.includes(discordId);
        
        // 4. For demo, also check if the user is in "leak servers" etc. (you can expand)
        const inLeakServers = ['80351110224678912'].includes(discordId);
        const cheatServerCount = isCheater ? 12 : 0;
        const leakServerCount = inLeakServers ? 1 : 0;

        // 5. Increment scan usage
        keyEntry.scansUsed++;
        saveKeys(); // save the updated counter

        // 6. Send response
        res.json({
            success: true,
            username: user.username,
            discriminator: user.discriminator || '0',
            id: user.id,
            avatar: user.avatar,
            cheater: isCheater,
            inLeakServers,
            cheatServerCount,
            leakServerCount,
            scansLeft: keyEntry.maxScans - keyEntry.scansUsed,
            keyType: keyEntry.type
        });

    } catch (error) {
        console.log(error.response?.data || error.message);
        res.json({ success: false, error: 'Discord ID not found or API error' });
    }
});

app.listen(PORT, () => {
    console.log(`✅ Eclipse AC server running at http://localhost:${PORT}`);
});