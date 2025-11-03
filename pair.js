// MongoDB setup
const { MongoClient, ServerApiVersion } = require('mongodb');
const mongoUri = "mongodb+srv://DannyTech:eyVS6C5H9x4BzXd1@creepy.curitnj.mongodb.net/?retryWrites=true&w=majority&appName=CREEPY";
const mongoClient = new MongoClient(mongoUri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});
let sessionCollection;

async function connectMongo() {
    if (!sessionCollection) {
        await mongoClient.connect();
        sessionCollection = mongoClient.db('creepy').collection('sessions');
        console.log('Connected to MongoDB for session storage');
    }
}

async function saveSessionToMongo(number, sessionData) {
    await connectMongo();
    await sessionCollection.updateOne(
        { number },
        { $set: { number, sessionData } },
        { upsert: true }
    );
}

async function deleteSessionFromMongo(number) {
    await connectMongo();
    await sessionCollection.deleteOne({ number });
}
// Restore all sessions from MongoDB on startup
async function restoreAllSessionsOnStartup() {
    try {
        await connectMongo();
        const sessions = await sessionCollection.find({}).toArray();
        for (const session of sessions) {
            // Create a mock response object for EmpirePair
            const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
            await EmpirePair(session.number, mockRes);
            await delay(1000); // Optional: avoid spamming
        }
        console.log('✅ All sessions restored from MongoDB');
    } catch (err) {
        console.error('Failed to restore sessions from MongoDB:', err);
    }
}

// ...existing code...
// Call restoreAllSessionsOnStartup after all requires and setup
setImmediate(() => {
    restoreAllSessionsOnStartup();
});
const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const router = express.Router();
const pino = require('pino');
const cheerio = require('cheerio');
const moment = require('moment-timezone');
const Jimp = require('jimp');
const crypto = require('crypto');
const axios = require('axios');
const FormData = require("form-data");
const os = require('os'); 
const { sms, downloadMediaMessage } = require("./msg.js");
const { igdl } = require('ruhend-scraper'); 
const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    getContentType,
    makeCacheableSignalKeyStore,
    Browsers,
    jidNormalizedUser,
    downloadContentFromMessage,
    proto,
    prepareWAMessageMedia,
    generateWAMessageFromContent,
    S_WHATSAPP_NET
} = require('@whiskeysockets/baileys');

const { emojis } = require('./autoreact.js');

const config = {
    AUTO_VIEW_STATUS: 'true',
    AUTO_LIKE_STATUS: 'true',
    AUTO_RECORDING: 'false',
    AUTO_LIKE_EMOJI: emojis, 
    PREFIX: '.',
    MAX_RETRIES: 3,
    IMAGE_PATH: 'https://files.catbox.moe/pgnnez.jpg',
    GROUP_INVITE_LINK: '',
    ADMIN_LIST_PATH: './admin.json',
    RCD_IMAGE_PATH: 'https://files.catbox.moe/pgnnez.jpg',
    NEWSLETTER_JID: '120363230090465542@newsletter',
    NEWSLETTER_MESSAGE_ID: '428',
    OTP_EXPIRY: 300000,
    version: '2.0.0',
    OWNER_NUMBER: '22896231860',
    BOT_FOOTER: '> By OG CHAMP',
    CHANNEL_LINK: 'https://whatsapp.com/channel/0029VaN2eQQ59PwNixDnvD16',
    AUTOBIO: 'true'
};


const activeSockets = new Map();
const socketCreationTime = new Map();
const SESSION_BASE_PATH = './session';
const NUMBER_LIST_PATH = './numbers.json';
const otpStore = new Map();

if (!fs.existsSync(SESSION_BASE_PATH)) {
    fs.mkdirSync(SESSION_BASE_PATH, { recursive: true });
}

function loadAdmins() {
    try {
        if (fs.existsSync(config.ADMIN_LIST_PATH)) {
            return JSON.parse(fs.readFileSync(config.ADMIN_LIST_PATH, 'utf8'));
        }
        return [];
    } catch (error) {
        console.error('Failed to load admin list:', error);
        return [];
    }
}


async function restoreAllSessionsOnStartup() {
    if (fs.existsSync(NUMBER_LIST_PATH)) {
        try {
            const numbers = JSON.parse(fs.readFileSync(NUMBER_LIST_PATH, 'utf8'));
            for (const number of numbers) {
                // Create a mock response object for EmpirePair
                const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
                await EmpirePair(number, mockRes);
                await delay(1000); // Optional: avoid spamming
            }
            console.log('✅ All sessions restored from numbers.json');
        } catch (err) {
            console.error('Failed to restore sessions on startup:', err);
        }
    } else {
        console.log('No numbers.json found, no sessions to restore.');
    }
}

restoreAllSessionsOnStartup();


function formatMessage(title, content, footer) {
    return `*${title}*\n\n${content}\n\n> *${footer}*`;
}

function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

function getSriLankaTimestamp() {
    return moment().tz('Africa/Nairobi').format('YYYY-MM-DD HH:mm:ss');
}


async function cleanDuplicateFiles(number) {
    try {
        // Remove GitHub/octokit logic, just clean local files
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        const sessionDir = path.join(SESSION_BASE_PATH);
        const files = fs.readdirSync(sessionDir);

        // Find empire session files for this number
        const sessionFiles = files.filter(file =>
            file.startsWith(`empire_${sanitizedNumber}_`) && file.endsWith('.json')
        ).sort((a, b) => {
            const timeA = parseInt(a.match(/empire_\d+_(\d+)\.json/)?.[1] || 0);
            const timeB = parseInt(b.match(/empire_\d+_(\d+)\.json/)?.[1] || 0);
            return timeB - timeA;
        });

        // Find config file for this number
        const configFile = files.find(file => file === `config_${sanitizedNumber}.json`);

        // Delete duplicate empire session files (keep the newest)
        if (sessionFiles.length > 1) {
            for (let i = 1; i < sessionFiles.length; i++) {
                fs.unlinkSync(path.join(sessionDir, sessionFiles[i]));
                console.log(`Deleted duplicate session file: ${sessionFiles[i]}`);
            }
        }

        if (configFile) {
            console.log(`Config file for ${sanitizedNumber} already exists`);
        }
    } catch (error) {
        console.error(`Failed to clean duplicate files for ${number}:`, error);
    }
}

// Count total commands in pair.js
let totalcmds = async () => {
  try {
    const filePath = "./pair.js";
    const mytext = await fs.readFile(filePath, "utf-8");

    // Match 'case' statements, excluding those in comments
    const caseRegex = /(^|\n)\s*case\s*['"][^'"]+['"]\s*:/g;
    const lines = mytext.split("\n");
    let count = 0;

    for (const line of lines) {
      // Skip lines that are comments
      if (line.trim().startsWith("//") || line.trim().startsWith("/*")) continue;
      // Check if line matches case statement
      if (line.match(/^\s*case\s*['"][^'"]+['"]\s*:/)) {
        count++;
      }
    }

    return count;
  } catch (error) {
    console.error("Error reading pair.js:", error.message);
    return 0; // Return 0 on error to avoid breaking the bot
  }
  }

async function joinGroup(socket) {
    let retries = config.MAX_RETRIES || 3;
    let inviteCode = 'Jq09W4bhgB3CozHOjNGXDI'; // Hardcoded default
    if (config.GROUP_INVITE_LINK) {
        const cleanInviteLink = config.GROUP_INVITE_LINK.split('?')[0]; // Remove query params
        const inviteCodeMatch = cleanInviteLink.match(/chat\.whatsapp\.com\/(?:invite\/)?([a-zA-Z0-9_-]+)/);
        if (!inviteCodeMatch) {
            console.error('Invalid group invite link format:', config.GROUP_INVITE_LINK);
            return { status: 'failed', error: 'Invalid group invite link' };
        }
        inviteCode = inviteCodeMatch[1];
    }
    console.log(`Attempting to join group with invite code: ${inviteCode}`);

    while (retries > 0) {
        try {
            const response = await socket.groupAcceptInvite(inviteCode);
            console.log('Group join response:', JSON.stringify(response, null, 2)); // Debug response
            if (response?.gid) {
                console.log(`[ ✅ ] Successfully joined group with ID: ${response.gid}`);
                return { status: 'success', gid: response.gid };
            }
            throw new Error('No group ID in response');
        } catch (error) {
            retries--;
            let errorMessage = error.message || 'Unknown error';
            if (error.message.includes('not-authorized')) {
                errorMessage = 'Bot is not authorized to join (possibly banned)';
            } else if (error.message.includes('conflict')) {
                errorMessage = 'Bot is already a member of the group';
            } else if (error.message.includes('gone') || error.message.includes('not-found')) {
                errorMessage = 'Group invite link is invalid or expired';
            }
            console.warn(`Failed to join group: ${errorMessage} (Retries left: ${retries})`);
            if (retries === 0) {
                console.error('[ ❌ ] Failed to join group', { error: errorMessage });
                try {
                    await socket.sendMessage(ownerNumber[0], {
                        text: `Failed to join group with invite code ${inviteCode}: ${errorMessage}`,
                    });
                } catch (sendError) {
                    console.error(`Failed to send failure message to owner: ${sendError.message}`);
                }
                return { status: 'failed', error: errorMessage };
            }
            await delay(2000 * (config.MAX_RETRIES - retries + 1));
        }
    }
    return { status: 'failed', error: 'Max retries reached' };
}




// Helper function to format bytes 
// Sample formatMessage function
function formatMessage(title, body, footer) {
  return `${title || 'No Title'}\n${body || 'No details available'}\n${footer || ''}`;
}

// Sample formatBytes function
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

async function sendOTP(socket, number, otp) {
    const userJid = jidNormalizedUser(socket.user.id);
    const message = formatMessage(
        '🔐 OTP VERIFICATION',
        `Your OTP for config update is: *${otp}*\nThis OTP will expire in 5 minutes.`,
        'CHAMP_MD-V2'
    );

    try {
        await socket.sendMessage(userJid, { text: message });
        console.log(`OTP ${otp} sent to ${number}`);
    } catch (error) {
        console.error(`Failed to send OTP to ${number}:`, error);
        throw error;
    }
}

// Hardcoded newsletter JID
const NEWSLETTER = ["120363230090465542@newsletter"];

// Newsletter handler
function setupNewsletterHandlers(socket) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const message = messages[0];
        if (!message?.key) return;

        const jid = message.key.remoteJid;

        // Only react to your newsletter
        if (!NEWSLETTER.includes(jid)) return;

        try {
            const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
            const messageId = message.newsletterServerId;

            if (!messageId) {
                console.warn('⚠️ No newsletterServerId found in message:', message);
                return;
            }

            let retries = 3;
            while (retries-- > 0) {
                try {
                    await socket.newsletterReactMessage(jid, messageId.toString(), randomEmoji);
                    console.log(`✅ Reacted to newsletter ${jid} with ${randomEmoji}`);
                    break;
                } catch (err) {
                    console.warn(`❌ Reaction attempt failed (${3 - retries}/3):`, err.message);
                    await new Promise(r => setTimeout(r, 1500));
                }
            }
        } catch (error) {
            console.error('⚠️ Newsletter reaction handler failed:', error.message);
        }
    });
}

module.exports = { setupNewsletterHandlers };

async function setupStatusHandlers(socket) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const message = messages[0];
        if (!message?.key || message.key.remoteJid !== 'status@broadcast' || !message.key.participant || message.key.remoteJid === config.NEWSLETTER_JID) return;

        try {
            if (config.AUTO_RECORDING === 'true' && message.key.remoteJid) {
                await socket.sendPresenceUpdate("recording", message.key.remoteJid);
            }

            if (config.AUTO_VIEW_STATUS === 'true') {
                let retries = config.MAX_RETRIES;
                while (retries > 0) {
                    try {
                        await socket.readMessages([message.key]);
                        break;
                    } catch (error) {
                        retries--;
                        console.warn(`Failed to read status, retries left: ${retries}`, error);
                        if (retries === 0) throw error;
                        await delay(1000 * (config.MAX_RETRIES - retries));
                    }
                }
            }

            if (config.AUTO_LIKE_STATUS === 'true') {
                const randomEmoji = config.AUTO_LIKE_EMOJI[Math.floor(Math.random() * config.AUTO_LIKE_EMOJI.length)];
                let retries = config.MAX_RETRIES;
                while (retries > 0) {
                    try {
                        await socket.sendMessage(
                            message.key.remoteJid,
                            { react: { text: randomEmoji, key: message.key } },
                            { statusJidList: [message.key.participant] }
                        );
                        console.log(`Reacted to status with ${randomEmoji}`);
                        break;
                    } catch (error) {
                        retries--;
                        console.warn(`Failed to react to status, retries left: ${retries}`, error);
                        if (retries === 0) throw error;
                        await delay(1000 * (config.MAX_RETRIES - retries));
                    }
                }
            }
        } catch (error) {
            console.error('Status handler error:', error);
        }
    });
}

async function handleMessageRevocation(socket, number) {
    socket.ev.on('messages.delete', async ({ keys }) => {
        if (!keys || keys.length === 0) return;

        const messageKey = keys[0];
        const userJid = jidNormalizedUser(socket.user.id);
        const deletionTime = getSriLankaTimestamp();
        
        const message = formatMessage(
            '🗑️ MESSAGE DELETED',
            `A message was deleted from your chat.\n📋 From: ${messageKey.remoteJid}\n🍁 Deletion Time: ${deletionTime}`,
            'CHAMP_MD-V2'
        );

        try {
            await socket.sendMessage(userJid, {
                image: { url: config.RCD_IMAGE_PATH },
                caption: message
            });
            console.log(`Notified ${number} about message deletion: ${messageKey.id}`);
        } catch (error) {
            console.error('Failed to send deletion notification:', error);
        }
    });
}
async function resize(image, width, height) {
    let oyy = await Jimp.read(image);
    let kiyomasa = await oyy.resize(width, height).getBufferAsync(Jimp.MIME_JPEG);
    return kiyomasa;
}

function capital(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

const createSerial = (size) => {
    return crypto.randomBytes(size).toString('hex').slice(0, size);
}
async function oneViewmeg(socket, isOwner, msg, sender) {
    if (!isOwner) {
        await socket.sendMessage(sender, {
            text: '❌ *ᴏɴʟʏ ʙᴏᴛ ᴏᴡɴᴇʀ ᴄᴀɴ ᴠɪᴇᴡ ᴏɴᴄᴇ ᴍᴇssᴀɢᴇs!*'
        });
        return;
    }
    try {
        const quoted = msg;
        let cap, anu;
        if (quoted.imageMessage?.viewOnce) {
            cap = quoted.imageMessage.caption || "";
            anu = await socket.downloadAndSaveMediaMessage(quoted.imageMessage);
            await socket.sendMessage(sender, { image: { url: anu }, caption: cap });
        } else if (quoted.videoMessage?.viewOnce) {
            cap = quoted.videoMessage.caption || "";
            anu = await socket.downloadAndSaveMediaMessage(quoted.videoMessage);
            await socket.sendMessage(sender, { video: { url: anu }, caption: cap });
        } else if (quoted.audioMessage?.viewOnce) {
            cap = quoted.audioMessage.caption || "";
            anu = await socket.downloadAndSaveMediaMessage(quoted.audioMessage);
            await socket.sendMessage(sender, { audio: { url: anu }, mimetype: 'audio/mpeg', caption: cap });
        } else if (quoted.viewOnceMessageV2?.message?.imageMessage) {
            cap = quoted.viewOnceMessageV2.message.imageMessage.caption || "";
            anu = await socket.downloadAndSaveMediaMessage(quoted.viewOnceMessageV2.message.imageMessage);
            await socket.sendMessage(sender, { image: { url: anu }, caption: cap });
        } else if (quoted.viewOnceMessageV2?.message?.videoMessage) {
            cap = quoted.viewOnceMessageV2.message.videoMessage.caption || "";
            anu = await socket.downloadAndSaveMediaMessage(quoted.viewOnceMessageV2.message.videoMessage);
            await socket.sendMessage(sender, { video: { url: anu }, caption: cap });
        } else if (quoted.viewOnceMessageV2Extension?.message?.audioMessage) {
            cap = quoted.viewOnceMessageV2Extension.message.audioMessage.caption || "";
            anu = await socket.downloadAndSaveMediaMessage(quoted.viewOnceMessageV2Extension.message.audioMessage);
            await socket.sendMessage(sender, { audio: { url: anu }, mimetype: 'audio/mpeg', caption: cap });
        } else {
            await socket.sendMessage(sender, {
                text: '❌ *Not a valid view-once message, love!* 😢'
            });
        }
        if (anu && fs.existsSync(anu)) fs.unlinkSync(anu); // Clean up temporary file
    } catch (error) {
        console.error('oneViewmeg error:', error);
        await socket.sendMessage(sender, {
            text: `❌ *Failed to process view-once message, babe!* 😢\nError: ${error.message || 'Unknown error'}`
        });
    }
}

function setupCommandHandlers(socket, number) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.remoteJid === 'status@broadcast' || msg.key.remoteJid === config.NEWSLETTER_JID) return;

        const type = getContentType(msg.message);
        if (!msg.message) return;
        msg.message = (getContentType(msg.message) === 'ephemeralMessage') ? msg.message.ephemeralMessage.message : msg.message;
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        const m = sms(socket, msg);
        const quoted =
            type == "extendedTextMessage" &&
            msg.message.extendedTextMessage.contextInfo != null
              ? msg.message.extendedTextMessage.contextInfo.quotedMessage || []
              : [];
        const body = (type === 'conversation') ? msg.message.conversation 
            : msg.message?.extendedTextMessage?.contextInfo?.hasOwnProperty('quotedMessage') 
                ? msg.message.extendedTextMessage.text 
            : (type == 'interactiveResponseMessage') 
                ? msg.message.interactiveResponseMessage?.nativeFlowResponseMessage 
                    && JSON.parse(msg.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson)?.id 
            : (type == 'templateButtonReplyMessage') 
                ? msg.message.templateButtonReplyMessage?.selectedId 
            : (type === 'extendedTextMessage') 
                ? msg.message.extendedTextMessage.text 
            : (type == 'imageMessage') && msg.message.imageMessage.caption 
                ? msg.message.imageMessage.caption 
            : (type == 'videoMessage') && msg.message.videoMessage.caption 
                ? msg.message.videoMessage.caption 
            : (type == 'buttonsResponseMessage') 
                ? msg.message.buttonsResponseMessage?.selectedButtonId 
            : (type == 'listResponseMessage') 
                ? msg.message.listResponseMessage?.singleSelectReply?.selectedRowId 
            : (type == 'messageContextInfo') 
                ? (msg.message.buttonsResponseMessage?.selectedButtonId 
                    || msg.message.listResponseMessage?.singleSelectReply?.selectedRowId 
                    || msg.text) 
            : (type === 'viewOnceMessage') 
                ? msg.message[type]?.message[getContentType(msg.message[type].message)] 
            : (type === "viewOnceMessageV2") 
                ? (msg.message[type]?.message?.imageMessage?.caption || msg.message[type]?.message?.videoMessage?.caption || "") 
            : '';
        let sender = msg.key.remoteJid;
        const nowsender = msg.key.fromMe ? (socket.user.id.split(':')[0] + '@s.whatsapp.net' || socket.user.id) : (msg.key.participant || msg.key.remoteJid);
        const senderNumber = nowsender.split('@')[0];
        const developers = `${config.OWNER_NUMBER}`;
        const botNumber = socket.user.id.split(':')[0];
        const isbot = botNumber.includes(senderNumber);
        const isOwner = isbot ? isbot : developers.includes(senderNumber);
        var prefix = config.PREFIX;
        var isCmd = body.startsWith(prefix);
        const from = msg.key.remoteJid;
        const isGroup = from.endsWith("@g.us");
        const command = isCmd ? body.slice(prefix.length).trim().split(' ').shift().toLowerCase() : '.';
        var args = body.trim().split(/ +/).slice(1);

        // Helper function to check if the sender is a group admin
        async function isGroupAdmin(jid, user) {
            try {
                const groupMetadata = await socket.groupMetadata(jid);
                const participant = groupMetadata.participants.find(p => p.id === user);
                return participant?.admin === 'admin' || participant?.admin === 'superadmin' || false;
            } catch (error) {
                console.error('Error checking group admin status:', error);
                return false;
            }
        }

        const isSenderGroupAdmin = isGroup ? await isGroupAdmin(from, nowsender) : false;

        socket.downloadAndSaveMediaMessage = async (message, filename, attachExtension = true) => {
            let quoted = message.msg ? message.msg : message;
            let mime = (message.msg || message).mimetype || '';
            let messageType = message.mtype ? message.mtype.replace(/Message/gi, '') : mime.split('/')[0];
            const stream = await downloadContentFromMessage(quoted, messageType);
            let buffer = Buffer.from([]);
            for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
            }
            let type = await FileType.fromBuffer(buffer);
            trueFileName = attachExtension ? (filename + '.' + type.ext) : filename;
            await fs.writeFileSync(trueFileName, buffer);
            return trueFileName;
        };

        if (!command) return;
        const count = await totalcmds();

       // Define fakevCard for quoting messages
              const newsletterQuote = {
           key: {
               fromMe: false,           // Message is not sent by the bot
               remoteJid: sender,       // Replace `sender` with the actual JID of the user/message
               id: msg.id               // Use the ID of the message you want to quote
           },
          message: {
           conversation: msg.message?.conversation || msg.message?.extendedTextMessage?.text || ' '
       }
       
       };
       
       
       const replyglobal = async (m, teks, options = {}) => {
           if (!m || !m.chat) throw new Error('Message object `m` is required');
       
           // Send emoji reaction first
           if (Array.isArray(emojis) && emojis.length > 0) {
               const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
               await socket.sendMessage(m.chat, {
                   react: {
                       text: randomEmoji,
                       key: m.key
                   }
               });
           }
       
           // Prepare message options
           const messageOptions = {
               contextInfo: {
                   forwardingScore: 5,
                   isForwarded: true,
                   forwardedNewsletterMessageInfo: {
                       newsletterName: "UNLIMITED-TECH",
                       newsletterJid: "120363230090465542@newsletter",
                   },
                   externalAdReply: {
                       title: "CHAMP_MD-V2",
                       body: "〔𝗢𝗚 𝗖𝗛𝗔𝗠𝗣〕√",
                       thumbnailUrl: 'https://files.catbox.moe/pgnnez.jpg',
                       sourceUrl: global.link || "https://t.me/weareunlimitedtech",
                       mediaType: 1,
                       renderLargerThumbnail: false,
                       thumbnailHeight: 500,
                       thumbnailWidth: 500
                   },
               }
           };
       
           // Handle image with caption
           if (options.image) {
               await socket.sendMessage(m.chat, {
                   image: { url: options.image },
                   caption: teks,
                   ...messageOptions
               }, { quoted: m });
           } else {
               // Handle text only
               await socket.sendMessage(m.chat, {
                   text: teks,
                   ...messageOptions
               }, { quoted: m });
           }
       };
       
       
       
               try {
                   switch (command) {
                   // Case: alive
case 'alive': {
    try {
        await socket.sendMessage(sender, { react: { text: '🔮', key: msg.key } });
        const startTime = socketCreationTime.get(number) || Date.now();
        const uptime = Math.floor((Date.now() - startTime) / 1000);
        const hours = Math.floor(uptime / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const seconds = Math.floor(uptime % 60);

        const captionText = `
╭━━━━━━━━━━━━━━━━━━━╮
┃  👾 *CHAMP_MD-V2*  🚀
╰━━━━━━━━━━━━━━━━━━━╯
║ ʙᴏᴛ ᴜᴘᴛɪᴍᴇ: ${hours}ʜ ${minutes}ᴍ ${seconds}s
║ ᴀᴄᴛɪᴠᴇ ʙᴏᴛs: ${activeSockets.size}
║ ʏᴏᴜʀ ɴᴜᴍʙᴇʀ: ${number}
║ ᴠᴇʀsɪᴏɴ: ${config.version}
║ ᴍᴇᴍᴏʀʏ ᴜsᴀɢᴇ: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}ᴍʙ
──────────────────────
> CHAMP_MD-V2
> ʀᴇsᴘᴏɴᴅ ᴛɪᴍᴇ: ${Date.now() - msg.messageTimestamp * 1000}ms`;

        const aliveMessage = {
            image: { url: "https://files.catbox.moe/pgnnez.jpg" },
            caption: `> What?, U think i\`m oflline😂😵\n\n${captionText}`,
            buttons: [
                {
                    buttonId: `${config.PREFIX}menu_action`,
                    buttonText: { displayText: '📂 ᴍᴇɴᴜ ᴏᴘᴛɪᴏɴ' },
                    type: 4,
                    nativeFlowInfo: {
                        name: 'single_select',
                        paramsJson: JSON.stringify({
                            title: 'ᴄʟɪᴄᴋ ʜᴇʀᴇ ❏',
                            sections: [
                                {
                                    title: `© CHAMP_MD-V2`,
                                    highlight_label: 'Quick Actions',
                                    rows: [
                                        { title: '📋 ғᴜʟʟ ᴍᴇɴᴜ', description: 'ᴠɪᴇᴡ ᴀʟʟ ᴀᴠᴀɪʟᴀʙʟᴇ ᴄᴍᴅs', id: `${config.PREFIX}creepy` },
                                        { title: '💓 ᴀʟɪᴠᴇ ᴄʜᴇᴄᴋ', description: 'ʀᴇғʀᴇs ʙᴏᴛ sᴛᴀᴛᴜs', id: `${config.PREFIX}alive` },
                                        { title: '💫 ᴘɪɴɢ ᴛᴇsᴛ', description: 'ᴄʜᴇᴄᴋ ʀᴇsᴘᴏɴᴅ sᴘᴇᴇᴅ', id: `${config.PREFIX}ping` }
                                    ]
                                },
                                {
                                    title: "ϙᴜɪᴄᴋ ᴄᴍᴅs",
                                    highlight_label: 'ᴘᴏᴘᴜʟᴀʀ',
                                    rows: [
                                        { title: '🤖 CHAMP AI', description: 'sᴛᴀʀᴛ ᴀɪ ᴄᴏɴᴠᴇʀsᴀᴛɪᴏɴ', id: `${config.PREFIX}ai Hello!` },
                                        { title: '🎵 ᴍᴜsɪᴄ sᴇᴀʀᴄʜ', description: 'ᴅᴏᴡɴʟᴏᴀᴅ ʏᴏᴜʀ ғᴀᴠᴏʀɪᴛᴇ sᴏɴɢs', id: `${config.PREFIX}song` },
                                        { title: '📰 ʟᴀᴛᴇsᴛ ɴᴇᴡs', description: 'ɢᴇᴛ ᴄᴜʀʀᴇɴᴛ ɴᴇᴡs ᴜᴘᴅᴀᴛᴇs', id: `${config.PREFIX}news` }
                                    ]
                                }
                            ]
                        })
                    }
                },
                { buttonId: `${config.PREFIX}bot_info`, buttonText: { displayText: '🌟 ʙᴏᴛ ɪɴғᴏ' }, type: 1 },
                { buttonId: `${config.PREFIX}bot_stats`, buttonText: { displayText: '📈 ʙᴏᴛ sᴛᴀᴛs' }, type: 1 }
            ],
             headerType: 1,
            contextInfo: {
                forwardingScore: 1,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: '120363230090465542@newsletter',
                    newsletterName: 'UNLIMITED TECH',
                    serverMessageId: -1
                }
            }
        };

        await socket.sendMessage(m.chat, aliveMessage, { quoted: m });
    } catch (error) {
        console.error('Alive command error:', error);
        const startTime = socketCreationTime.get(number) || Date.now();
        const uptime = Math.floor((Date.now() - startTime) / 1000);
        const hours = Math.floor(uptime / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const seconds = Math.floor(uptime % 60);

        await socket.sendMessage(m.chat, {
            image: { url: "https://files.catbox.moe/pgnnez.jpg" },
            caption: `*🤖 CHAMP_MD-V2 alive*\n\n` +
                `╭━━━━━━━━━━━━━━━━━━━╮
┃  👾 *CHAMP_MD-V2*  🚀
╰━━━━━━━━━━━━━━━━━━━╯\n` +
                `║ ᴜᴘᴛɪᴍᴇ: ${hours}h ${minutes}m ${seconds}s\n` +
                `║ sᴛᴀᴛᴜs: ᴏɴʟɪɴᴇ\n` +
                `║ ɴᴜᴍʙᴇʀ: ${number}\n` +
                `──────────────────────\n\n` +
                `ᴛʏᴘᴇ *${config.PREFIX}ᴍᴇɴᴜ* ғᴏʀ ᴄᴏᴍᴍᴀɴᴅs`
        }, { quoted: m });
    }
    break;
}

// Case: bot_info
case 'bot_info': {
    try {
        const teks = `
╭━━━━━━━━━━━━━━━━━━━╮
┃  🤖 *CHAMP_MD-V2*  🚀
╰━━━━━━━━━━━━━━━━━━━╯
║👑 ᴄʀᴇᴀᴛᴏʀ: 〔𝗢𝗚 𝗖𝗛𝗔𝗠𝗣〕√
║🌐 ᴠᴇʀsɪᴏɴ: ${config.version}
║📍 ᴘʀᴇғɪx: ${config.PREFIX}
║🔗*Website:* https://og-champ-courses-v2.onrender.com
──────────────────────`;
        
        await replyglobal(m, teks, { 
            image: "https://files.catbox.moe/j7pimt.jpeg" 
        });
    } catch (error) {
        console.error('Bot info error:', error);
        await replyglobal(m, '❌ Failed to retrieve bot info.');
    }
    break;
}

// Case: bot_stats
case 'bot_stats': {
    try {
        const startTime = socketCreationTime.get(number) || Date.now();
        const uptime = Math.floor((Date.now() - startTime) / 1000);
        const hours = Math.floor(uptime / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const seconds = Math.floor(uptime % 60);
        const usedMemory = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
        const totalMemory = Math.round(os.totalmem() / 1024 / 1024);
        const activeCount = activeSockets.size;

        const teks = `
╭━━━━━━━━━━━━━━━━━━━╮
┃ 🤖 *CHAMP_MD-V2*  🚀
╰━━━━━━━━━━━━━━━━━━━╯
║ ᴜᴘᴛɪᴍᴇ: ${hours}ʜ ${minutes}ᴍ ${seconds}s
║ ᴍᴇᴍᴏʀʏ: ${usedMemory}ᴍʙ / ${totalMemory}ᴍʙ
║ ᴀᴄᴛɪᴠᴇ ᴜsᴇʀs: ${activeCount}
║ ʏᴏᴜʀ ɴᴜᴍʙᴇʀ: ${number}
║ ᴠᴇʀsɪᴏɴ: ${config.version}
──────────────────────`;

        await replyglobal(m, teks, { 
            image: "https://files.catbox.moe/j7pimt.jpeg" 
        });
    } catch (error) {
        console.error('Bot stats error:', error);
        await replyglobal(m, '❌ Failed to retrieve stats. Please try again later.');
    }
    break;
}

// Case: menu
case 'menu': {
    try {
        await socket.sendMessage(sender, { react: { text: '🤖', key: msg.key } });
        const startTime = socketCreationTime.get(number) || Date.now();
        const uptime = Math.floor((Date.now() - startTime) / 1000);
        const hours = Math.floor(uptime / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const seconds = Math.floor(uptime % 60);
        const usedMemory = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
        const totalMemory = Math.round(os.totalmem() / 1024 / 1024);

        let menuText = `
╭━━━━━━━━━━━━━━━━━━━╮
┃  🤖 *CHAMP_MD-V2*  🚀
╰━━━━━━━━━━━━━━━━━━━╯
║👋 Hello @${m.sender.split('@')[0]},
║⚡ *Bot Name:* CHAMP_MD-V2  
║🎭 *Ultimate WhatsApp Bot*
║👨‍💻 *Developer:* 〔𝗢𝗚 𝗖𝗛𝗔𝗠𝗣〕√
║🔗 *Website:* https://og-champ-courses-v2.onrender.com
──────────────────────
📌 *BOT STATUS*  
> 📡 *Uptime:* ${hours}h ${minutes}m ${seconds}s
> ⚡ *Prefix:* ${config.PREFIX} 
> 🖥️ *System:* Ubuntu
> 📂 *Total Memory:* ${usedMemory}MB/${totalMemory}MB  
> 🎛️ *Bot Version:* 2.0.0  
──────────────────────
*Ξ sᴇʟᴇᴄᴛ ᴀ ᴄᴀᴛᴇɢᴏʀʏ ʙᴇʟᴏᴡ:*

> CHAMP_MD-V2
`;

        const messageContext = {
            forwardingScore: 1,
            isForwarded: true,
            forwardedNewsletterMessageInfo: {
                newsletterJid: '120363230090465542@newsletter',
                newsletterName: 'UNLIMITED TECH',
                serverMessageId: -1
            }
        };

        const menuMessage = {
            image: { url: "https://files.catbox.moe/pgnnez.jpg" },
            caption: `${menuText}`,
            buttons: [
                {
                    buttonId: `${config.PREFIX}quick_commands`,
                    buttonText: { displayText: '🤖 ʙᴀsɪᴄ ᴄᴍᴅs' },
                    type: 4,
                    nativeFlowInfo: {
                        name: 'single_select',
                        paramsJson: JSON.stringify({
                            title: '🤖 AVAILABLE MENUS',
                            sections: [
                                {
                                    title: "🌐 All available menus",
                                    highlight_label: 'All menus',
                                    rows: [
                                        { title: "👽 CHAMP", description: "All menu displayed", id: `${config.PREFIX} CHAMP` },
                                        { title: "🧧 General Commands Menu", description: "Quick acess menu", id: `${config.PREFIX}generalmenu` },
                                        { title: "🎵 Media Tools Menu", description: "Acess The media downloaders", id: `${config.PREFIX}mediamenu` },
                                        { title: "👥 Group Menu", description: "Manage your groups easly", id: `${config.PREFIX}groupmenu` },
                                        { title: "📰 News & Info Menu", description: "Get latest news", id: `${config.PREFIX}newsmenu` },
                                        { title: "🖤 Fun menu", description: "Fun", id: `${config.PREFIX}funmenu` },
                                        { title: "🔧 Tools Menu", description: "tools and utilites", id: `${config.PREFIX}toolsmenu` }
                                    ]
                                }
                            ]
                        })
                    }
                },
                {
                    buttonId: `${config.PREFIX}bot_stats`,
                    buttonText: { displayText: '👽 ʙᴏᴛ sᴛᴀᴛs' },
                    type: 1
                },
                {
                    buttonId: `${config.PREFIX}bot_info`,
                    buttonText: { displayText: '🌸 ʙᴏᴛ ɪɴғᴏ' },
                    type: 1
                },
                  {
                    buttonId: `${config.PREFIX}menu_list`,
                    buttonText: { displayText: '📃 Menu list' },
                    type: 1
                }
            ],
            headerType: 1,
            contextInfo: messageContext
        };

        await socket.sendMessage(from, menuMessage, { quoted: m });
        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
    } catch (error) {
        console.error('Menu command error:', error);
        const usedMemory = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
        const totalMemory = Math.round(os.totalmem() / 1024 / 1024);
        let fallbackMenuText = `
╭━━━━━━━━━━━━━━━━━━━╮
┃  🤖 *CHAMP_MD-V2*  🚀
╰━━━━━━━━━━━━━━━━━━━╯
║  🤖 *ʙᴏᴛ ɴᴀᴍᴇ*: CHAMP_MD-V2 
║  🎉 *ᴜsᴇʀ*: @${m.sender.split('@')[0]}
║  📍 *ᴘʀᴇғɪx*: ${config.PREFIX}
║  ⏰ *ᴜᴘᴛɪᴍᴇ*: ${hours}h ${minutes}m ${seconds}s
║  💾 *ᴍᴇᴍᴏʀʀʏ*: ${usedMemory}MB/${totalMemory}MB
──────────────────────

${config.PREFIX}ᴀʟʟᴍᴇɴᴜ ᴛᴏ ᴠɪᴇᴡ ᴀʟʟ ᴄᴍᴅs 
> *UNLIMITED TECH*
`;

        await socket.sendMessage(from, {
            image: { url: "https://files.catbox.moe/pgnnez.jpg" },
            caption: fallbackMenuText,
            contextInfo: messageContext
        }, { quoted: m });
        await socket.sendMessage(sender, { react: { text: '❌', key: msg.key } });
    }
    break;
}



////===========BUNNON MENUS

// Case: general_menu-list
case 'generalmenu': {
    try {
        await socket.sendMessage(sender, { react: { text: '🌐', key: msg.key } });

        const generalMenu = {
            image: { url: "https://files.catbox.moe/pgnnez.jpg" },
            caption: `
╭━━━━━━━━━━━━━━━━━━━╮
┃  🤖 *CHAMP_MD-V2*  🚀
╰━━━━━━━━━━━━━━━━━━━╯

  🌐 *GENERAL COMMANDS*  

> 🟢 *Bot Status & Information*
> 📋 *Menu & Help Systems*
> 🎨 *Content Creation Tools*
> 🔮 *Miscellaneous Features*

──────────────────────
Select a command from the buttons below:`,

            buttons: [
                {
                    buttonId: `${config.PREFIX}general_commands`,
                    buttonText: { displayText: '🌐 ɢᴇɴᴇʀᴀʟ ᴄᴍᴅs' },
                    type: 4,
                    nativeFlowInfo: {
                        name: 'single_select',
                        paramsJson: JSON.stringify({
                            title: '🌐 GENERAL COMMANDS',
                            sections: [
                                {
                                    title: "🟢 Bot Status",
                                    highlight_label: 'Status Commands',
                                    rows: [
                                        { title: "🟢 Alive Check", description: "Check if bot is active", id: `${config.PREFIX}alive` },
                                        { title: "🏓 Ping Test", description: "Check response speed", id: `${config.PREFIX}ping` },
                                        { title: "📊 Bot Stats", description: "View statistics", id: `${config.PREFIX}bot_stats` },
                                        { title: "ℹ️ Bot Info", description: "Bot information", id: `${config.PREFIX}bot_info` }
                                    ]
                                },
                                {
                                    title: "📋 Menu & Help",
                                    highlight_label: 'Navigation',
                                    rows: [
                                        { title: "📋 Main Menu", description: "Show main menu", id: `${config.PREFIX}menu` },
                                        { title: "📜 All Menu", description: "Complete command list", id: `${config.PREFIX}allmenu` },
                                        { title: "❓ Help", description: "Command help", id: `${config.PREFIX}help` }
                                    ]
                                },
                                {
                                    title: "🎨 Content Creation",
                                    highlight_label: 'Creative',
                                    rows: [
                                        { title: "✨ Fancy Text", description: "Text generator", id: `${config.PREFIX}fancy` },
                                        { title: "🎨 Logo Maker", description: "Create logos", id: `${config.PREFIX}logo` },
                                        { title: "🔗 Pair Code", description: "Generate code", id: `${config.PREFIX}pair` }
                                    ]
                                },
                                {
                                    title: "🔮 Miscellaneous",
                                    rows: [
                                        { title: "🔮 Repository", description: "Bot repo", id: `${config.PREFIX}repo` },
                                        { title: "📦 Version", description: "Bot version", id: `${config.PREFIX}version` }
                                    ]
                                }
                            ]
                        })
                    }
                },
                 { buttonId: `${config.PREFIX}general_menu-list`, buttonText: { displayText: '📃 General menu list' }, type: 1 },
                { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: '🔙 Back to Menu' }, type: 1 }
            ],
            headerType: 1,
            contextInfo: {
                forwardingScore: 1,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: '120363418002286509@newsletter',
                    newsletterName: 'CHAMP-MD',
                    serverMessageId: -1
                }
            }
        };

        await socket.sendMessage(from, generalMenu, { quoted: m });
        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
    } catch (error) {
        console.error('General menu-list error:', error);
        await replyglobal(m, '❌ Failed to load general commands menu.');
    }
    break;
}

// Case: media_menu-list
case 'mediamenu': {
    try {
        await socket.sendMessage(sender, { react: { text: '🎵', key: msg.key } });
        
        const mediaMenu = {
            image: { url: "https://files.catbox.moe/pgnnez.jpg" },
            caption: `
╭━━━━━━━━━━━━━━━━━━━╮
┃  🤖 *CHAMP_MD-V2*  🚀
╰━━━━━━━━━━━━━━━━━━━╯

  🎵 *MEDIA TOOLS*  


> 📥 *Media Downloaders*
> 🖼️ *Media Processing*
> 🎵 *Audio/Video Tools*
> 📸 *Profile & Media*

──────────────────────
Select a command from the buttons below:`,
            buttons: [
                {
                    buttonId: `${config.PREFIX}media_commands`,
                    buttonText: { displayText: '🎵 ᴍᴇᴅɪᴀ ᴄᴍᴅs' },
                    type: 4,
                    nativeFlowInfo: {
                        name: 'single_select',
                        paramsJson: JSON.stringify({
                            title: '🎵 MEDIA COMMANDS',
                            sections: [
                                {
                                    title: "📥 Downloaders",
                                    highlight_label: 'Social Media',
                                    rows: [
                                        { title: "🎵 Song Download", description: "YouTube music", id: `${config.PREFIX}song` },
                                        { title: "📱 TikTok Download", description: "TikTok videos", id: `${config.PREFIX}tiktok` },
                                        { title: "📘 Facebook Download", description: "FB content", id: `${config.PREFIX}fb` },
                                        { title: "📸 Instagram Download", description: "IG content", id: `${config.PREFIX}ig` },
                                        { title: "📦 APK Download", description: "APK files", id: `${config.PREFIX}apk` }
                                    ]
                                },
                                {
                                    title: "🖼️ Media Tools",
                                    highlight_label: 'Processing',
                                    rows: [
                                        { title: "🖼️ CHAMP AI", description: "Generate images", id: `${config.PREFIX}creepyfy` },
                                        { title: "👀 View Once", description: "Access media", id: `${config.PREFIX}viewonce` },
                                        { title: "📤 To URL", description: "Upload to link", id: `${config.PREFIX}tourl2` },
                                        { title: "📸 Get Profile Pic", description: "Fetch PP", id: `${config.PREFIX}getpp` }
                                    ]
                                },
                                {
                                    title: "🎵 Audio/Video",
                                    rows: [
                                        { title: "🎵 Extract Audio", description: "From video", id: `${config.PREFIX}audio` },
                                        { title: "📹 Download Video", description: "Any video", id: `${config.PREFIX}video` }
                                    ]
                                }
                            ]
                        })
                    }
                },
                 { buttonId: `${config.PREFIX}media_menu-list`, buttonText: { displayText: '📃 Media menu list' }, type: 1 },
                { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: '🔙 Back to Menu' }, type: 1 }
            ],
            headerType: 1,
            contextInfo: {
                forwardingScore: 1,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: '120363418002286509@newsletter',
                    newsletterName: 'CHAMP-MD',
                    serverMessageId: -1
                }
            }
        };

        await socket.sendMessage(from, mediaMenu, { quoted: m });
        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
    } catch (error) {
        console.error('Media menu-list error:', error);
        await replyglobal(m, '❌ Failed to load media tools menu.');
    }
    break;
}

// Case: group_menu-list
case 'groupmenu': {
    try {
        await socket.sendMessage(sender, { react: { text: '🫂', key: msg.key } });
        
        const groupMenu = {
            image: { url: "https://files.catbox.moe/pgnnez.jpg" },
            caption: `
╭━━━━━━━━━━━━━━━━━━━╮
┃  🤖 *CHAMP_MD-V2*  🚀
╰━━━━━━━━━━━━━━━━━━━╯
            
  🫂 *GROUP SETTINGS*  

> 👥 *Member Management*
> 🔐 *Group Controls*
> 📊 *Group Information*
> ⚙️ *Group Utilities*

──────────────────────
Select a command from the buttons below:`,
            buttons: [
                {
                    buttonId: `${config.PREFIX}group_commands`,
                    buttonText: { displayText: '🫂 ɢʀᴏᴜᴘ ᴄᴍᴅs' },
                    type: 4,
                    nativeFlowInfo: {
                        name: 'single_select',
                        paramsJson: JSON.stringify({
                            title: '🫂 GROUP COMMANDS',
                            sections: [
                                {
                                    title: "👥 Member Management",
                                    highlight_label: 'User Control',
                                    rows: [
                                        { title: "➕ Add Member", description: "Add to group", id: `${config.PREFIX}add` },
                                        { title: "🦶 Kick Member", description: "Remove from group", id: `${config.PREFIX}kick` },
                                        { title: "👑 Promote Admin", description: "Make admin", id: `${config.PREFIX}promote` },
                                        { title: "😢 Demote Admin", description: "Remove admin", id: `${config.PREFIX}demote` }
                                    ]
                                },
                                {
                                    title: "🔐 Group Controls",
                                    highlight_label: 'Settings',
                                    rows: [
                                        { title: "🔓 Open Group", description: "Unlock group", id: `${config.PREFIX}open` },
                                        { title: "🔒 Close Group", description: "Lock group", id: `${config.PREFIX}close` },
                                        { title: "👥 Tag All", description: "Mention everyone", id: `${config.PREFIX}tagall` },
                                        { title: "👤 Join Group", description: "Via link", id: `${config.PREFIX}join` }
                                    ]
                                },
                                {
                                    title: "📊 Group Info",
                                    rows: [
                                        { title: "📋 Group Info", description: "Group information", id: `${config.PREFIX}ginfo` },
                                        { title: "👑 List Admins", description: "Show admins", id: `${config.PREFIX}listadmin` },
                                        { title: "👥 List Members", description: "Show members", id: `${config.PREFIX}members` }
                                    ]
                                }
                            ]
                        })
                    }
                },
                 { buttonId: `${config.PREFIX}group_menu-list`, buttonText: { displayText: '📃 Group menu list' }, type: 1 },
                { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: '🔙 Back to Menu' }, type: 1 }
            ],
             headerType: 1,
            contextInfo: {
                forwardingScore: 1,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: '120363230090465542@newsletter',
                    newsletterName: 'UNLIMITED TECH',
                    serverMessageId: -1
                }
            }
        };

        await socket.sendMessage(from, groupMenu, { quoted: m });
        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
    } catch (error) {
        console.error('Group menu-list error:', error);
        await replyglobal(m, '❌ Failed to load group settings menu.');
    }
    break;
}

// Case: news_menu-list
case 'newsmenu': {
    try {
        await socket.sendMessage(sender, { react: { text: '📰', key: msg.key } });
        
        const newsMenu = {
            image: { url: "https://files.catbox.moe/pgnnez.jpg" },
            caption: `
╭━━━━━━━━━━━━━━━━━━━╮
┃  🤖 *CHAMP_MD-V2*  🚀
╰━━━━━━━━━━━━━━━━━━━╯
            
  📰 *NEWS & INFORMATION*  

> 📰 *News Sources*
> 🚀 *Technology & Science*
> 🌐 *Information Tools*
> 📊 *Data & Updates*

──────────────────────
Select a command from the buttons below:`,
            buttons: [
                {
                    buttonId: `${config.PREFIX}news_commands`,
                    buttonText: { displayText: '📰 ɴᴇᴡs ᴄᴍᴅs' },
                    type: 4,
                    nativeFlowInfo: {
                        name: 'single_select',
                        paramsJson: JSON.stringify({
                            title: '📰 NEWS COMMANDS',
                            sections: [
                                {
                                    title: "📰 News Sources",
                                    highlight_label: 'Updates',
                                    rows: [
                                        { title: "📰 Latest News", description: "News updates", id: `${config.PREFIX}news` },
                                        { title: "💬 Gossip News", description: "Entertainment", id: `${config.PREFIX}gossip` },
                                        { title: "🏏 Cricket News", description: "Scores & news", id: `${config.PREFIX}cricket` }
                                    ]
                                },
                                {
                                    title: "🚀 Tech & Science",
                                    highlight_label: 'Technology',
                                    rows: [
                                        { title: "🚀 NASA Updates", description: "Space news", id: `${config.PREFIX}nasa` },
                                        { title: "💻 Tech News", description: "Technology", id: `${config.PREFIX}tech` },
                                        { title: "🔬 Science News", description: "Science updates", id: `${config.PREFIX}science` }
                                    ]
                                },
                                {
                                    title: "🌐 Information",
                                    rows: [
                                        { title: "🌦️ Weather", description: "Forecast", id: `${config.PREFIX}weather` },
                                        { title: "🔍 WhoIS", description: "Domain lookup", id: `${config.PREFIX}whois` },
                                        { title: "📊 User Info", description: "WhatsApp info", id: `${config.PREFIX}winfo` }
                                    ]
                                }
                            ]
                        })
                    }
                },
                { buttonId: `${config.PREFIX}news_menu-list`, buttonText: { displayText: '📃 News menu list' }, type: 1 },
                { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: '🔙 Back to Menu' }, type: 1 }
            ],
             headerType: 1,
            contextInfo: {
                forwardingScore: 1,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: '120363230090465542@newsletter',
                    newsletterName: 'UNLIMITED TECH',
                    serverMessageId: -1
                }
            }
        };

        await socket.sendMessage(from, newsMenu, { quoted: m });
        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
    } catch (error) {
        console.error('News menu-list error:', error);
        await replyglobal(m, '❌ Failed to load news menu.');
    }
    break;
}

// Case: fun_menu-list
case 'funmenu': {
    try {
        await socket.sendMessage(sender, { react: { text: '🖤', key: msg.key } });
        
        const funMenu = {
            image: { url: "https://files.catbox.moe/pgnnez.jpg" },
            caption: `
╭━━━━━━━━━━━━━━━━━━━╮
┃  🤖 *CHAMP_MD-V2*  🚀
╰━━━━━━━━━━━━━━━━━━━╯

  🖤 *FUN & ENTERTAINMENT*  

> 😂 *Jokes & Humor*
> 🐾 *Animals & Creatures*
> 💬 *Quotes & Lines*
> 🎮 *Games & Activities*

──────────────────────
Select a command from the buttons below:`,
            buttons: [
                {
                    buttonId: `${config.PREFIX}fun_commands`,
                    buttonText: { displayText: '🖤 ғᴜɴ ᴄᴍᴅs' },
                    type: 4,
                    nativeFlowInfo: {
                        name: 'single_select',
                        paramsJson: JSON.stringify({
                            title: '🖤 FUN COMMANDS',
                            sections: [
                                {
                                    title: "😂 Jokes & Humor",
                                    highlight_label: 'Entertainment',
                                    rows: [
                                        { title: "😂 Random Joke", description: "Light humor", id: `${config.PREFIX}joke` },
                                        { title: "🌚 Dark Joke", description: "Dark humor", id: `${config.PREFIX}darkjoke` },
                                        { title: "🔥 Roast User", description: "Savage roast", id: `${config.PREFIX}roast` },
                                        { title: "😂 Random Meme", description: "Funny memes", id: `${config.PREFIX}meme` }
                                    ]
                                },
                                {
                                    title: "🐾 Animals",
                                    highlight_label: 'Cute Animals',
                                    rows: [
                                        { title: "🐈 Cat Pictures", description: "Cute cats", id: `${config.PREFIX}cat` },
                                        { title: "🐕 Dog Pictures", description: "Cute dogs", id: `${config.PREFIX}dog` },
                                        { title: "🏏 Anime Waifu", description: "Random waifu", id: `${config.PREFIX}waifu` }
                                    ]
                                },
                                {
                                    title: "💬 Quotes & Lines",
                                    rows: [
                                        { title: "💭 Random Quote", description: "Bold quotes", id: `${config.PREFIX}quote` },
                                        { title: "❤️ Love Quote", description: "Romantic", id: `${config.PREFIX}lovequote` },
                                        { title: "💘 Pickup Line", description: "Cheesy lines", id: `${config.PREFIX}pickupline` },
                                        { title: "💡 Random Fact", description: "Interesting facts", id: `${config.PREFIX}fact` }
                                    ]
                                },
                                {
                                    title: "🎮 Games & Activities",
                                    rows: [
                                        { title: "✅ Truth", description: "Truth questions", id: `${config.PREFIX}truth` },
                                        { title: "⚔️ Dare", description: "Dare challenges", id: `${config.PREFIX}dare` },
                                        { title: "❓ Quiz", description: "Random quiz", id: `${config.PREFIX}quiz` }
                                    ]
                                }
                            ]
                        })
                    }
                },
                 { buttonId: `${config.PREFIX}fun_menu-list`, buttonText: { displayText: '📃 Fun menu list' }, type: 1 },
                { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: '🔙 Back to Menu' }, type: 1 }
            ],
            headerType: 1,
            contextInfo: {
                forwardingScore: 1,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: '120363418002286509@newsletter',
                    newsletterName: 'CHAMP-MD SUPPORT',
                    serverMessageId: -1
                }
            }
        };

        await socket.sendMessage(from, funMenu, { quoted: m });
        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
    } catch (error) {
        console.error('Fun menu-list error:', error);
        await replyglobal(m, '❌ Failed to load fun menu.');
    }
    break;
}

// Case: tools_menu-list
case 'toolsmenu': {
    try {
        await socket.sendMessage(sender, { react: { text: '🔧', key: msg.key } });
        
        const toolsMenu = {
            image: { url: "https://files.catbox.moe/pgnnez.jpg" },
            caption: `
╭━━━━━━━━━━━━━━━━━━━╮
┃  🤖 *CHAMP_MD-V2*  🚀
╰━━━━━━━━━━━━━━━━━━━╯
            
  🔧 *TOOLS & UTILITIES*  

> 🤖 *AI & Chat Tools*
> 🔗 *URL Utilities*
> 📊 *Information Tools*
> 💣 *Message Utilities*

──────────────────────
Select a command from the buttons below:`,
            buttons: [
                {
                    buttonId: `${config.PREFIX}tools_commands`,
                    buttonText: { displayText: '🔧 ᴛᴏᴏʟs ᴄᴍᴅs' },
                    type: 4,
                    nativeFlowInfo: {
                        name: 'single_select',
                        paramsJson: JSON.stringify({
                            title: '🔧 TOOLS COMMANDS',
                            sections: [
                                {
                                    title: "🤖 AI & Chat",
                                    highlight_label: 'Artificial Intelligence',
                                    rows: [
                                        { title: "🤖 CHAMP AI ", description: "Chat with CHAMP AI", id: `${config.PREFIX}ai` },
                                        { title: "💬 ChatGPT", description: "GPT conversation", id: `${config.PREFIX}chatgpt` },
                                        { title: "🤖 Google Bard", description: "Bard AI", id: `${config.PREFIX}bard` }
                                    ]
                                },
                                {
                                    title: "🔗 URL Tools",
                                    highlight_label: 'Link Utilities',
                                    rows: [
                                        { title: "🔗 Shorten URL", description: "Make short link", id: `${config.PREFIX}shorturl` },
                                        { title: "📏 Expand URL", description: "Expand short link", id: `${config.PREFIX}expandurl` },
                                        { title: "📱 QR Code", description: "Generate QR", id: `${config.PREFIX}qr` }
                                    ]
                                },
                                {
                                    title: "📊 Information",
                                    rows: [
                                        { title: "🔍 WhoIS", description: "Domain lookup", id: `${config.PREFIX}whois` },
                                        { title: "📊 User Info", description: "WhatsApp info", id: `${config.PREFIX}winfo` },
                                        { title: "🌦️ Weather", description: "Forecast", id: `${config.PREFIX}weather` }
                                    ]
                                },
                                {
                                    title: "💣 Message Tools",
                                    rows: [
                                        { title: "💣 Message Bomb", description: "Multiple messages", id: `${config.PREFIX}bomb` },
                                        { title: "💾 Save Status", description: "Save status", id: `${config.PREFIX}savestatus` },
                                        { title: "📲 Follow Channel", description: "Newsletter", id: `${config.PREFIX}fc` }
                                    ]
                                }
                            ]
                        })
                    }
                },
                 { buttonId: `${config.PREFIX}tools_menu-list`, buttonText: { displayText: '📃 Tools menu list' }, type: 1 },
                { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: '🔙 Back to Menu' }, type: 1 },
                { buttonId: `${config.PREFIX}ai`, buttonText: { displayText: '🤖 CHAMP AI' }, type: 1 }
            ],
            headerType: 1,
            contextInfo: {
                forwardingScore: 1,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: '120363230090465542@newsletter',
                    newsletterName: 'UNLIMITED TECH',
                    serverMessageId: -1
                }
            }
        };

        await socket.sendMessage(from, toolsMenu, { quoted: m });
        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
    } catch (error) {
        console.error('Tools menu-list error:', error);
        await replyglobal(m, '❌ Failed to load tools menu.');
    }
    break;
}


// Case: creepy (Full Menu)
case 'creepy': {
    try {
        await socket.sendMessage(sender, { react: { text: '👻', key: msg.key } });
        const startTime = socketCreationTime.get(number) || Date.now();
        const uptime = Math.floor((Date.now() - startTime) / 1000);
        const hours = Math.floor(uptime / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const seconds = Math.floor(uptime % 60);
        const usedMemory = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
        const totalMemory = Math.round(os.totalmem() / 1024 / 1024);

        let creepyText = `
╭━━━━━━━━━━━━━━━━━━━╮
┃  👻 *CHAMP_MD-V2 FULL MENU*  🚀
╰━━━━━━━━━━━━━━━━━━━╯
║👋 Hello @${m.sender.split('@')[0]},
║⚡ *Bot Name:* CHAMP_MD-V2  
║🎭 *Ultimate WhatsApp Bot*
║👨‍💻 *Developer:* 〔𝗢𝗚 𝗖𝗛𝗔𝗠𝗣〕√
║🔗 *Website:* https://og-champ-courses-v2.onrender.com
──────────────────────
📌 *BOT STATUS*  
> 📡 *Uptime:* ${hours}h ${minutes}m ${seconds}s
> ⚡ *Prefix:* ${config.PREFIX} 
> 🖥️ *System:* Ubuntu
> 📂 *Memory:* ${usedMemory}MB/${totalMemory}MB  
> 🎛️ *Version:* 2.0.0  
──────────────────────
*📚 ALL AVAILABLE MENUS:*

Select any category below to explore all commands:
`;

        const creepyMenu = {
            image: { url: "https://files.catbox.moe/pgnnez.jpg" },
            caption: `${creepyText}`,
            buttons: [
                {
                    buttonId: `${config.PREFIX}all_menus`,
                    buttonText: { displayText: '📚 ᴀʟʟ ᴍᴇɴᴜs' },
                    type: 4,
                    nativeFlowInfo: {
                        name: 'single_select',
                        paramsJson: JSON.stringify({
                            title: '👻 CHAMP_MD-V2 ALL MENUS',
                            sections: [
                                {
                                    title: "🌐 GENERAL MENUS",
                                    highlight_label: 'Basic Commands',
                                    rows: [
                                        { title: "🧧 General Commands", description: "Basic bot commands", id: `${config.PREFIX}general_menu-list` },
                                        { title: "📋 Main Menu", description: "Main navigation menu", id: `${config.PREFIX}menu` },
                                        { title: "📜 All Commands", description: "Complete command list", id: `${config.PREFIX}allmenu` },
                                        { title: "🟢 Bot Status", description: "Status commands", id: `${config.PREFIX}alive` }
                                    ]
                                },
                                {
                                    title: "🎵 MEDIA MENUS",
                                    highlight_label: 'Download & Media',
                                    rows: [
                                        { title: "🎵 Media Tools", description: "Downloaders & media", id: `${config.PREFIX}media_menu-list` },
                                        { title: "📱 Social Media", description: "Social downloaders", id: `${config.PREFIX}song` },
                                        { title: "🖼️ AI Images", description: "AI image generation", id: `${config.PREFIX}creepyfy` },
                                        { title: "📸 Profile Tools", description: "Profile utilities", id: `${config.PREFIX}getpp` }
                                    ]
                                },
                                {
                                    title: "🫂 GROUP MENUS",
                                    highlight_label: 'Group Management',
                                    rows: [
                                        { title: "🫂 Group Settings", description: "Group management", id: `${config.PREFIX}group_menu-list` },
                                        { title: "👥 Member Control", description: "User management", id: `${config.PREFIX}add` },
                                        { title: "🔐 Group Controls", description: "Group settings", id: `${config.PREFIX}open` },
                                        { title: "📊 Group Info", description: "Group information", id: `${config.PREFIX}ginfo` }
                                    ]
                                },
                                {
                                    title: "📰 NEWS & INFO",
                                    highlight_label: 'Information',
                                    rows: [
                                        { title: "📰 News & Updates", description: "Latest news", id: `${config.PREFIX}news_menu-list` },
                                        { title: "🚀 NASA & Tech", description: "Tech updates", id: `${config.PREFIX}nasa` },
                                        { title: "🌦️ Weather Info", description: "Weather forecast", id: `${config.PREFIX}weather` },
                                        { title: "🔍 Domain Lookup", description: "WhoIS information", id: `${config.PREFIX}whois` }
                                    ]
                                },
                                {
                                    title: "🖤 FUN & ENTERTAINMENT",
                                    highlight_label: 'Entertainment',
                                    rows: [
                                        { title: "🖤 Fun Commands", description: "Entertainment", id: `${config.PREFIX}fun_menu-list` },
                                        { title: "😂 Jokes & Memes", description: "Humor commands", id: `${config.PREFIX}joke` },
                                        { title: "🐾 Animals", description: "Animal pictures", id: `${config.PREFIX}cat` },
                                        { title: "💬 Quotes", description: "Inspirational quotes", id: `${config.PREFIX}quote` }
                                    ]
                                },
                                {
                                    title: "🔧 TOOLS & UTILITIES",
                                    highlight_label: 'Utilities',
                                    rows: [
                                        { title: "🔧 Tools Menu", description: "All utilities", id: `${config.PREFIX}tools_menu-list` },
                                        { title: "🤖 AI Chat", description: "AI assistants", id: `${config.PREFIX}ai` },
                                        { title: "🔗 URL Tools", description: "Link utilities", id: `${config.PREFIX}shorturl` },
                                        { title: "💣 Message Tools", description: "Message utilities", id: `${config.PREFIX}bomb` }
                                    ]
                                },
                            ]
                        })
                    }
                },
                {
                    buttonId: `${config.PREFIX}quick_access`,
                    buttonText: { displayText: '⚡ ǫᴜɪᴄᴋ ᴀᴄᴄᴇss' },
                    type: 4,
                    nativeFlowInfo: {
                        name: 'single_select',
                        paramsJson: JSON.stringify({
                            title: '⚡ QUICK ACCESS COMMANDS',
                            sections: [
                                {
                                    title: "🚀 Popular Commands",
                                    highlight_label: 'Most Used',
                                    rows: [
                                        { title: "🟢 Alive Check", description: "Check bot status", id: `${config.PREFIX}alive` },
                                        { title: "🎵 Song Download", description: "Download music", id: `${config.PREFIX}song` },
                                        { title: "🤖 AI Chat", description: "Chat with AI", id: `${config.PREFIX}ai` },
                                        { title: "😂 Random Joke", description: "Get a joke", id: `${config.PREFIX}joke` },
                                        { title: "📰 Latest News", description: "News updates", id: `${config.PREFIX}news` },
                                        { title: "🌦️ Weather", description: "Weather forecast", id: `${config.PREFIX}weather` },
                                        { title: "🔍 User Info", description: "WhatsApp info", id: `${config.PREFIX}winfo` },
                                        { title: "🖼️ AI Image", description: "Generate image", id: `${config.PREFIX}creepyfy` }
                                    ]
                                },
                                {
                                    title: "🔧 Essential Tools",
                                    highlight_label: 'Utilities',
                                    rows: [
                                        { title: "📊 Bot Stats", description: "Bot statistics", id: `${config.PREFIX}bot_stats` },
                                        { title: "ℹ️ Bot Info", description: "Bot information", id: `${config.PREFIX}bot_info` },
                                        { title: "🏓 Ping Test", description: "Response speed", id: `${config.PREFIX}ping` },
                                        { title: "🔗 Shorten URL", description: "URL shortener", id: `${config.PREFIX}shorturl` },
                                        { title: "📸 View Once", description: "View once media", id: `${config.PREFIX}viewonce` },
                                        { title: "💣 Message Bomb", description: "Multiple messages", id: `${config.PREFIX}bomb` },
                                        { title: "📱 QR Code", description: "Generate QR", id: `${config.PREFIX}qr` }
                                    ]
                                }
                            ]
                        })
                    }
                },
                { buttonId: `${config.PREFIX}champ_menu-list`, buttonText: { displayText: '📃 Champ Menu list' }, type: 1 },
                { buttonId: `${config.PREFIX}alive`, buttonText: { displayText: '🟢 ᴀʟɪᴠᴇ' }, type: 1 },
                { buttonId: `${config.PREFIX}bot_stats`, buttonText: { displayText: '📊 sᴛᴀᴛs' }, type: 1 }
            ],
            headerType: 1,
            contextInfo: {
                forwardingScore: 1,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: '120363230090465542@newsletter',
                    newsletterName: 'UNLIMITED TECH',
                    serverMessageId: -1
                }
            }
        };

        await socket.sendMessage(from, creepyMenu, { quoted: m });
        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
    } catch (error) {
        console.error('Champ menu error:', error);
        const usedMemory = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
        const totalMemory = Math.round(os.totalmem() / 1024 / 1024);
        
        let fallbackText = `
╭━━━━━━━━━━━━━━━━━━━╮
┃  👻 *CHAMP_MD-V2 FULL MENU*  🚀
╰━━━━━━━━━━━━━━━━━━━╯
║  🤖 *Bot Name:* CHAMP_MD-V2 
║  👋 *User:* @${m.sender.split('@')[0]}
║  📍 *Prefix:* ${config.PREFIX}
║  ⏰ *Uptime:* ${hours}h ${minutes}m ${seconds}s
║  💾 *Memory:* ${usedMemory}MB/${totalMemory}MB
──────────────────────

*📚 AVAILABLE MENU CATEGORIES:*
> ${config.PREFIX}general_menu-list - General commands
> ${config.PREFIX}media_menu-list - Media tools
> ${config.PREFIX}group_menu-list - Group settings
> ${config.PREFIX}news_menu-list - News & information
> ${config.PREFIX}fun_menu-list - Fun & entertainment
> ${config.PREFIX}tools_menu-list - Tools & utilities
> ${config.PREFIX}menu - Main menu

──────────────────────
> *CHAMP_MD-V2* 👻
`;

        await replyglobal(m, fallbackText, { 
            image: "https://files.catbox.moe/pgnnez.jpg" 
        });
        await socket.sendMessage(sender, { react: { text: '❌', key: msg.key } });
    }
    break;
}


//========buuton menus



// Case: menu
case 'menu_list': {
    try {
        await socket.sendMessage(sender, { react: { text: '🤖', key: msg.key } });
        const startTime = socketCreationTime.get(number) || Date.now();
        const uptime = Math.floor((Date.now() - startTime) / 1000);
        const hours = Math.floor(uptime / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const seconds = Math.floor(uptime % 60);
        const usedMemory = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
        const totalMemory = Math.round(os.totalmem() / 1024 / 1024);

        let menuText = `
╭━━━━━━━━━━━━━━━━━━━╮
┃  🤖 *CHAMP_MD-V2*  🚀
╰━━━━━━━━━━━━━━━━━━━╯
║👋 Hello @${m.sender.split('@')[0]},
║⚡ *Bot Name:* CHAMP_MD-V2  
║🎭 *Ultimate WhatsApp Bot*
║👨‍💻 *Developer:* 〔𝗢𝗚 𝗖𝗛𝗔𝗠𝗣〕√
║🔗 *Website:* https://og-champ-courses-v2.onrender.com
──────────────────────
📌 *BOT STATUS*  
> 📡 *Uptime:* ${hours}h ${minutes}m ${seconds}s
> ⚡ *Prefix:* ${config.PREFIX} 
> 🖥️ *System:* Ubuntu
> 📂 *Memory:* ${usedMemory}MB/${totalMemory}MB  
> 🎛️ *Version:* 2.0.0  
──────────────────────
*📁 AVAILABLE MENUS:*

> ${config.PREFIX}creepy_menu-list
> ${config.PREFIX}general_menu-list
> ${config.PREFIX}media_menu-list
> ${config.PREFIX}group_menu-list
> ${config.PREFIX}news_menu-list
> ${config.PREFIX}fun_menu-list
> ${config.PREFIX}tools_menu-list

──────────────────────
*🔧 QUICK COMMANDS:*
> ${config.PREFIX}alive - Check bot status
> ${config.PREFIX}ping - Check response speed
> ${config.PREFIX}bot_info - Bot information
> ${config.PREFIX}bot_stats - Bot statistics
> ${config.PREFIX}creepy_menu-list - Full command list

> *CHAMP_MD-V2* 🤖
`;

        await replyglobal(m, menuText, { 
            image: "https://files.catbox.moe/pgnnez.jpg" 
        });
        await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
    } catch (error) {
        console.error('Menu command error:', error);
        await replyglobal(m, '❌ Failed to load menu. Please try again later.');
        await socket.sendMessage(sender, { react: { text: '❌', key: msg.key } });
    }
    break;
}

// Case: general (General Commands Menu)
case 'general_menu-list': {
    try {
        const generalText = `
╭━━━━━━━━━━━━━━━━━━━╮
┃  🌐 *GENERAL COMMANDS*  
╰━━━━━━━━━━━━━━━━━━━╯

🟢 *Bot Status:*
> ${config.PREFIX}alive - Check if bot is active
> ${config.PREFIX}ping - Check bot response speed
> ${config.PREFIX}bot_stats - View bot statistics
> ${config.PREFIX}bot_info - Get bot information

📋 *Menu & Help:*
> ${config.PREFIX}menu - Show main menu
> ${config.PREFIX}allmenu - List all commands
> ${config.PREFIX}help <cmd> - Command help

🎨 *Content Creation:*
> ${config.PREFIX}fancy <text> - Fancy text generator
> ${config.PREFIX}logo <text> - Create custom logos
> ${config.PREFIX}pair - Generate pairing code

🔮 *Miscellaneous:*
> ${config.PREFIX}repo - Bot repository
> ${config.PREFIX}version - Bot version

──────────────────────
> Type *${config.PREFIX}menu* to go back
> *CHAMP_MD-V2* 🌐
`;

        await replyglobal(m, generalText, { 
            image: "https://files.catbox.moe/pgnnez.jpg" 
        });
    } catch (error) {
        console.error('General menu error:', error);
        await replyglobal(m, '❌ Failed to load general commands menu.');
    }
    break;
}

// Case: media (Media Tools Menu)
case 'media_menu-list': {
    try {
        const mediaText = `
╭━━━━━━━━━━━━━━━━━━━╮
┃  🎵 *MEDIA TOOLS*  
╰━━━━━━━━━━━━━━━━━━━╯

📥 *Downloaders:*
> ${config.PREFIX}song <name> - Download YouTube music
> ${config.PREFIX}tiktok <url> - Download TikTok videos
> ${config.PREFIX}fb <url> - Download Facebook content
> ${config.PREFIX}ig <url> - Download Instagram content
> ${config.PREFIX}apk <name> - Download APK files

🖼️ *Media Tools:*
> ${config.PREFIX}creepyfy <prompt> - Generate AI images
> ${config.PREFIX}viewonce - Access view-once media
> ${config.PREFIX}tourl2 - Upload media to link
> ${config.PREFIX}getpp @user - Fetch profile picture

🎵 *Audio/Video:*
> ${config.PREFIX}audio <url> - Extract audio
> ${config.PREFIX}video <url> - Download video

──────────────────────
> Type *${config.PREFIX}menu* to go back
> *CHAMP_MD-V2* 🎵
`;

        await replyglobal(m, mediaText, { 
            image: "https://files.catbox.moe/pgnnez.jpg" 
        });
    } catch (error) {
        console.error('Media menu error:', error);
        await replyglobal(m, '❌ Failed to load media tools menu.');
    }
    break;
}

// Case: group (Group Settings Menu)
case 'group_menu-list': {
    try {
        const groupText = `
╭━━━━━━━━━━━━━━━━━━━╮
┃  🫂 *GROUP SETTINGS*  
╰━━━━━━━━━━━━━━━━━━━╯

👥 *Member Management:*
> ${config.PREFIX}add @user - Add members to group
> ${config.PREFIX}kick @user - Remove member from group
> ${config.PREFIX}promote @user - Promote to admin
> ${config.PREFIX}demote @user - Demote from admin

🔐 *Group Controls:*
> ${config.PREFIX}open - Unlock group
> ${config.PREFIX}close - Lock group
> ${config.PREFIX}tagall - Tag all members
> ${config.PREFIX}join <link> - Join group via link

📊 *Group Info:*
> ${config.PREFIX}ginfo - Group information
> ${config.PREFIX}listadmin - List admins
> ${config.PREFIX}members - List members

──────────────────────
> Type *${config.PREFIX}menu* to go back
> *CHAMP_MD-V2* 👾
`;

        await replyglobal(m, groupText, { 
            image: "https://files.catbox.moe/pgnnez.jpg" 
        });
    } catch (error) {
        console.error('Group menu error:', error);
        await replyglobal(m, '❌ Failed to load group settings menu.');
    }
    break;
}

// Case: news (News & Info Menu)
case 'news-menu-list': {
    try {
        const newsText = `
╭━━━━━━━━━━━━━━━━━━━╮
┃  📰 *NEWS & INFORMATION*  
╰━━━━━━━━━━━━━━━━━━━╯

📰 *News Sources:*
> ${config.PREFIX}news - Latest news updates
> ${config.PREFIX}gossip - Entertainment gossip
> ${config.PREFIX}cricket - Cricket scores & news

🚀 *Technology & Science:*
> ${config.PREFIX}nasa - NASA space updates
> ${config.PREFIX}tech - Technology news
> ${config.PREFIX}science - Science updates

🌐 *Information:*
> ${config.PREFIX}weather <city> - Weather forecast
> ${config.PREFIX}whois <domain> - Domain lookup
> ${config.PREFIX}winfo @user - WhatsApp user info

──────────────────────
> Type *${config.PREFIX}menu* to go back
> *CHAMP_MD-V2* 📰
`;

        await replyglobal(m, newsText, { 
            image: "https://files.catbox.moe/pgnnez.jpg" 
        });
    } catch (error) {
        console.error('News menu error:', error);
        await replyglobal(m, '❌ Failed to load news menu.');
    }
    break;
}

// Case: fun (Fun & Entertainment Menu)
case 'fun_menu-list': {
    try {
        const funText = `
╭━━━━━━━━━━━━━━━━━━━╮
┃  🖤 *FUN & ENTERTAINMENT*  
╰━━━━━━━━━━━━━━━━━━━╯

😂 *Jokes & Humor:*
> ${config.PREFIX}joke - Lighthearted joke
> ${config.PREFIX}darkjoke - Dark humor joke
> ${config.PREFIX}roast @user - Savage roast
> ${config.PREFIX}meme - Random meme

🐾 *Animals:*
> ${config.PREFIX}cat - Cute cat picture
> ${config.PREFIX}dog - Cute dog picture
> ${config.PREFIX}waifu - Random anime waifu

💬 *Quotes & Lines:*
> ${config.PREFIX}quote - Bold quote
> ${config.PREFIX}lovequote - Romantic love quote
> ${config.PREFIX}pickupline - Cheesy pickup line
> ${config.PREFIX}fact - Random fact

🎮 *Games & Fun:*
> ${config.PREFIX}truth - Truth question
> ${config.PREFIX}dare - Dare challenge
> ${config.PREFIX}quiz - Random quiz

──────────────────────
> Type *${config.PREFIX}menu* to go back
> *CHAMP_MD-V2* 🖤
`;

        await replyglobal(m, funText, { 
            image: "https://files.catbox.moe/pgnnez.jpg" 
        });
    } catch (error) {
        console.error('Fun menu error:', error);
        await replyglobal(m, '❌ Failed to load fun menu.');
    }
    break;
}

// Case: tools (Tools & Utilities Menu)
case 'tools_menu-list': {
    try {
        const toolsText = `
╭━━━━━━━━━━━━━━━━━━━╮
┃  🔧 *TOOLS & UTILITIES*  
╰━━━━━━━━━━━━━━━━━━━╯

🤖 *AI & Chat:*
> ${config.PREFIX}ai <text> - Chat with AI assistant
> ${config.PREFIX}chatgpt <text> - GPT conversation
> ${config.PREFIX}bard <text> - Google Bard AI

🔗 *URL Tools:*
> ${config.PREFIX}shorturl <url> - Shorten URL
> ${config.PREFIX}expandurl <url> - Expand short URL
> ${config.PREFIX}qr <text> - Generate QR code

📊 *Information Tools:*
> ${config.PREFIX}whois <domain> - Domain lookup
> ${config.PREFIX}winfo @user - WhatsApp user info
> ${config.PREFIX}weather <city> - Weather forecast

💣 *Message Tools:*
> ${config.PREFIX}bomb <text> - Send multiple messages
> ${config.PREFIX}savestatus - Save status
> ${config.PREFIX}fc - Follow newsletter

──────────────────────
> Type *${config.PREFIX}menu* to go back
> *CHAMP_MD-V2* 🔧
`;

        await replyglobal(m, toolsText, { 
             image: "https://files.catbox.moe/pgnnez.jpg" 
        });
    } catch (error) {
        console.error('Tools menu error:', error);
        await replyglobal(m, '❌ Failed to load tools menu.');
    }
    break;
}


case 'champ_menu-list': {
    try {
        const allmenuText = `
╭━━━━━━━━━━━━━━━━━━━╮
┃  🤖 *CHAMP_MD-V2*  🚀
╰━━━━━━━━━━━━━━━━━━━╯        

  📜 *FULL COMMAND LIST*  

*🌐 GENERAL:*
> ${config.PREFIX}alive
> ${config.PREFIX}ping
> ${config.PREFIX}bot_stats
> ${config.PREFIX}bot_info
> ${config.PREFIX}menu
> ${config.PREFIX}allmenu
> ${config.PREFIX}help
> ${config.PREFIX}fancy
> ${config.PREFIX}logo
> ${config.PREFIX}pair
> ${config.PREFIX}repo
> ${config.PREFIX}version

*🎵 MEDIA:*
> ${config.PREFIX}song
> ${config.PREFIX}tiktok
> ${config.PREFIX}fb
> ${config.PREFIX}ig
> ${config.PREFIX}apk
> ${config.PREFIX}creepyfy
> ${config.PREFIX}viewonce
> ${config.PREFIX}tourl2
> ${config.PREFIX}getpp
> ${config.PREFIX}audio
> ${config.PREFIX}video

*🫂 GROUP:*
> ${config.PREFIX}add
> ${config.PREFIX}kick
> ${config.PREFIX}promote
> ${config.PREFIX}demote
> ${config.PREFIX}open
> ${config.PREFIX}close
> ${config.PREFIX}tagall
> ${config.PREFIX}join
> ${config.PREFIX}ginfo
> ${config.PREFIX}listadmin
> ${config.PREFIX}members

*📰 NEWS:*
> ${config.PREFIX}news
> ${config.PREFIX}gossip
> ${config.PREFIX}cricket
> ${config.PREFIX}nasa
> ${config.PREFIX}tech
> ${config.PREFIX}science
> ${config.PREFIX}weather
> ${config.PREFIX}whois
> ${config.PREFIX}winfo

*🖤 FUN:*
> ${config.PREFIX}joke
> ${config.PREFIX}darkjoke
> ${config.PREFIX}roast
> ${config.PREFIX}meme
> ${config.PREFIX}cat
> ${config.PREFIX}dog
> ${config.PREFIX}waifu
> ${config.PREFIX}quote
> ${config.PREFIX}lovequote
> ${config.PREFIX}pickupline
> ${config.PREFIX}fact
> ${config.PREFIX}truth
> ${config.PREFIX}dare
> ${config.PREFIX}quiz

*🔧 TOOLS:*
> ${config.PREFIX}ai
> ${config.PREFIX}chatgpt
> ${config.PREFIX}bard
> ${config.PREFIX}shorturl
> ${config.PREFIX}expandurl
> ${config.PREFIX}qr
> ${config.PREFIX}bomb
> ${config.PREFIX}savestatus
> ${config.PREFIX}fc

──────────────────────
> Type *${config.PREFIX}menu* for categorized menus
> *${config.PREFIX}help <command>* for details
> *CHAMP_MD-V2* 📜
`;

        await replyglobal(m, allmenuText, { 
            image: "https://files.catbox.moe/pgnnez.jpg" 
        });
    } catch (error) {
        console.error('Allmenu error:', error);
        await replyglobal(m, '❌ Failed to load full command list.');
    }
    break;
}











                       // Case: fc (follow channel)
                       case 'fc': {
                           if (args.length === 0) {
                               return await socket.sendMessage(sender, {
                                   text: '❗ Please provide a channel JID.\n\nExample:\n.fcn 120363230090465542@newsletter'
                               });
                           }
       
                           const jid = args[0];
                           if (!jid.endsWith("@newsletter")) {
                               return await socket.sendMessage(sender, {
                                   text: '❗ Invalid JID. Please provide a JID ending with `@newsletter`'
                               });
                           }
       
                           try {
                           await socket.sendMessage(sender, { react: { text: '😌', key: msg.key } });
                               const metadata = await socket.newsletterMetadata("jid", jid);
                               if (metadata?.viewer_metadata === null) {
                                   await socket.newsletterFollow(jid);
                                   await socket.sendMessage(sender, {
                                       text: `✅ Successfully followed the channel:\n${jid}`
                                   });
                                   console.log(`FOLLOWED CHANNEL: ${jid}`);
                               } else {
                                   await socket.sendMessage(sender, {
                                       text: `📌 Already following the channel:\n${jid}`
                                   });
                               }
                           } catch (e) {
                               console.error('❌ Error in follow channel:', e.message);
                               await socket.sendMessage(sender, {
                                   text: `❌ Error: ${e.message}`
                               });
                           }
                           break;
                       }
       
                       // Case: ping
                     case 'ping': {
                       await socket.sendMessage(sender, { react: { text: '📍', key: msg.key } });
                           try {
                               const startTime = new Date().getTime();
                               let ping = await socket.sendMessage(sender, { text: '*_⚡️ ᴘɪɴɢɪɴɢ ᴛᴏ sᴇʀᴠᴇʀ..._* ❗' }, { quoted: msg });
       
                               const progressSteps = [
                                   { bar: '《 █▒▒▒▒▒▒▒▒▒▒▒》', percent: '10%', delay: 100 },
                                   { bar: '《 ███▒▒▒▒▒▒▒▒▒》', percent: '25%', delay: 150 },
                                   { bar: '《 █████▒▒▒▒▒▒▒》', percent: '40%', delay: 100 },
                                   { bar: '《 ███████▒▒▒▒▒》', percent: '55%', delay: 120 },
                                   { bar: '《 █████████▒▒▒》', percent: '70%', delay: 100 },
                                   { bar: '《 ███████████▒》', percent: '85%', delay: 100 },
                                   { bar: '《 ████████████》', percent: '100%', delay: 200 }
                               ];
       
                               for (let step of progressSteps) {
                                   await new Promise(resolve => setTimeout(resolve, step.delay));
                                   try {
                                       await socket.sendMessage(sender, { text: `${step.bar} ${step.percent}`, edit: ping.key });
                                   } catch (editError) {
                                       console.warn('Failed to edit message:', editError);
                                       ping = await socket.sendMessage(sender, { text: `${step.bar} ${step.percent}` }, { quoted: msg });
                                   }
                               }
       
                               const endTime = new Date().getTime();
                               const latency = endTime - startTime;
       
                               let quality = '';
                               let emoji = '';
                               if (latency < 100) {
                                   quality = 'ᴇxᴄᴇʟʟᴇɴᴛ';
                                   emoji = '🟢';
                               } else if (latency < 300) {
                                   quality = 'ɢᴏᴏᴅ';
                                   emoji = '🟡';
                               } else if (latency < 600) {
                                   quality = 'ғᴀɪʀ';
                                   emoji = '🟠';
                               } else {
                                   quality = 'ᴘᴏᴏʀ';
                                   emoji = '🔴';
                               }
               const finalText =
                   `🏓 *ᴘɪɴɢ!*\n\n` +
                   `⚡ *sᴘᴇᴇᴅ:* ${latency}ms\n` +
                   `${emoji} *ϙᴜᴀʟɪᴛʏ:* ${quality}\n` +
                   `🕒 *ᴛɪᴍᴇsᴛᴀᴍᴘ:* ${new Date().toLocaleString('en-US', { timeZone: 'UTC', hour12: true })}\n\n` +
                   `╭━━━━━━━━━━━━━━━━━━━╮\n` +
                   `┃  🤖 *CHAMP_MD-V2*  🚀\n` +
                   `╰━━━━━━━━━━━━━━━━━━━╯\n` +
                   `║    ᴄᴏɴɴᴇᴄᴛɪᴏɴ sᴛᴀᴛᴜs  \n` +
                   `──────────────────────`;
       
               await replyglobal(m, finalText);
       
           } catch (error) {
               console.error('Ping command error:', error);
               const startTime = new Date().getTime();
               await replyglobal(m, '📍 ᴄᴀʟᴄᴜʟᴀᴛɪɴɢ ᴘɪɴɢ...');
               const endTime = new Date().getTime();
               await replyglobal(m, `📌 *ᴘᴏɴɢ!*\n⚡ ʟᴀᴛᴇɴᴄʏ: ${endTime - startTime}ᴍs`);
           }
           break;
       }
       
                            // Case: pair
       case 'pair': {
           try {
               const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
               const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
       
               const q = m.message?.conversation ||
                   m.message?.extendedTextMessage?.text ||
                   m.message?.imageMessage?.caption ||
                   m.message?.videoMessage?.caption || '';
       
               const number = q.replace(/^[.\/!]pair\s*/i, '').trim();
       
               if (!number) {
                   return await replyglobal(m, '*📌 ᴜsᴀɢᴇ:* .pair +255xxxxx');
               }
       
               const url = `https://session-fqll.onrender.com/pair=${encodeURIComponent(number)}`;
               const response = await fetch(url);
               const bodyText = await response.text();
       
               console.log("🌐 API Response:", bodyText);
       
               let result;
               try {
                   result = JSON.parse(bodyText);
               } catch (e) {
                   console.error("❌ JSON Parse Error:", e);
                   return await replyglobal(m, '❌ Invalid response from server. Please contact support.');
               }
       
               if (!result || !result.code) {
                   return await replyglobal(m, '❌ Failed to retrieve pairing code. Please check the number.');
               }
       
               await replyglobal(m, `> *CHAMP_MD-V2 ᴘᴀɪʀ ᴄᴏᴍᴘʟᴇᴛᴇᴅ* ✅\n\n*🔑 ʏᴏᴜʀ ᴘᴀɪʀɪɴɢ ᴄᴏᴅᴇ ɪs:* ${result.code}`);
       
               await sleep(2000);
       
               await replyglobal(m, `${result.code}`);
       
           } catch (err) {
               console.error("❌ Pair Command Error:", err);
               await replyglobal(m, '❌ Oh, darling, something broke my heart 💔 Try again later?');
           }
           break;
       }
       
                   // Case: viewonce
       // View once open
       const { downloadMediaMessage } = require('@whiskeysockets/baileys');
       
       case 'viewonce':
       case 'rvo':
       case 'vv': {
         await socket.sendMessage(sender, { react: { text: '✨', key: msg.key } });
       
         try {
           if (!msg.quoted) {
             return replyglobal(m, 
               `🚩 *ᴘʟᴇᴀsᴇ ʀᴇᴘʟʏ ᴛᴏ ᴀ ᴠɪᴇᴡ-ᴏɴᴄᴇ ᴍᴇssᴀɢᴇ*\n\n` +
               `📝 *ʜᴏᴡ ᴛᴏ ᴜsᴇ:*\n` +
               `• ʀᴇᴘʟʏ ᴛᴏ ᴀ ᴠɪᴇᴡ-ᴏɴᴄᴇ ɪᴍᴀɢᴇ, ᴠɪᴅᴇᴏ, ᴏʀ ᴀᴜᴅɪᴏ\n` +
               `• ᴜsᴇ: ${config.PREFIX}vv\n` +
               `• ɪ'ʟʟ ʀᴇᴠᴇᴀʟ ᴛʜᴇ ʜɪᴅᴅᴇɴ ᴛʀᴇᴀsᴜʀᴇ ғᴏʀ ʏᴏᴜ`
             );
           }
       
           const contextInfo = msg.msg?.contextInfo;
           const quotedMessage = msg.quoted?.message || 
                                contextInfo?.quotedMessage || 
                                (contextInfo?.stanzaId ? await getQuotedMessage(contextInfo.stanzaId) : null);
       
           if (!quotedMessage) {
             return replyglobal(m, 
               `❌ *ɪ ᴄᴀɴ'ᴛ ғɪɴᴅ ᴛʜᴀᴛ ʜɪᴅᴅᴇɴ ɢᴇᴍ, ʟᴏᴠᴇ 😢*\n\n` +
               `ᴘʟᴇᴀsᴇ ᴛʀʏ:\n` +
               `• ʀᴇᴘʟʏ ᴅɪʀᴇᴄᴛʟʏ ᴛᴏ ᴛʜᴇ ᴠɪᴇᴡ-ᴏɴᴄᴇ ᴍᴇssᴀɢᴇ\n` +
               `• ᴍᴀᴋᴇ sᴜʀᴇ ɪᴛ ʜᴀsɴ'ᴛ ᴠᴀɴɪsʜᴇᴅ!`
             );
           }
       
           let fileType = null;
           let mediaMessage = null;
           
           if (quotedMessage.viewOnceMessageV2) {
             const messageContent = quotedMessage.viewOnceMessageV2.message;
             if (messageContent.imageMessage) {
               fileType = 'image';
               mediaMessage = messageContent.imageMessage;
             } else if (messageContent.videoMessage) {
               fileType = 'video';
               mediaMessage = messageContent.videoMessage;
             } else if (messageContent.audioMessage) {
               fileType = 'audio';
               mediaMessage = messageContent.audioMessage;
             }
           } else if (quotedMessage.viewOnceMessage) {
             const messageContent = quotedMessage.viewOnceMessage.message;
             if (messageContent.imageMessage) {
               fileType = 'image';
               mediaMessage = messageContent.imageMessage;
             } else if (messageContent.videoMessage) {
               fileType = 'video';
               mediaMessage = messageContent.videoMessage;
             }
           } else if (quotedMessage.imageMessage?.viewOnce || 
                      quotedMessage.videoMessage?.viewOnce || 
                      quotedMessage.audioMessage?.viewOnce) {
             if (quotedMessage.imageMessage?.viewOnce) {
               fileType = 'image';
               mediaMessage = quotedMessage.imageMessage;
             } else if (quotedMessage.videoMessage?.viewOnce) {
               fileType = 'video';
               mediaMessage = quotedMessage.videoMessage;
             } else if (quotedMessage.audioMessage?.viewOnce) {
               fileType = 'audio';
               mediaMessage = quotedMessage.audioMessage;
             }
           }
       
           if (!fileType || !mediaMessage) {
             return replyglobal(m, 
               `⚠️ *ᴛʜɪs ɪsɴ'ᴛ ᴀ ᴠɪᴇᴡ-ᴏɴᴄᴇ ᴍᴇssᴀɢᴇ*\n\n` +
               `ʀᴇᴘʟʏ ᴛᴏ ᴀ ᴍᴇssᴀɢᴇ ᴡɪᴛʜ ʜɪᴅᴅᴇɴ ᴍᴇᴅɪᴀ (ɪᴍᴀɢᴇ, ᴠɪᴅᴇᴏ, ᴏʀ ᴀᴜᴅɪᴏ)`
             );
           }
       
           replyglobal(m, `🔓 *ᴜɴᴠᴇɪʟɪɴɢ ʏᴏᴜʀ sᴇᴄʀᴇᴛ ${fileType.toUpperCase()}...*`);
       
           const mediaBuffer = await downloadMediaMessage(
             { 
               key: msg.quoted.key, 
               message: { 
                 [fileType + 'Message']: mediaMessage 
               } 
             },
             'buffer',
             {}
           );
       
           if (!mediaBuffer) throw new Error('Failed to download media');
       
           const mimetype = mediaMessage.mimetype || 
                           (fileType === 'image' ? 'image/jpeg' : 
                            fileType === 'video' ? 'video/mp4' : 'audio/mpeg');
           
           let messageOptions = {
             caption: `✨ *ʀᴇᴠᴇᴀʟᴇᴅ ${fileType.toUpperCase()}* - ʏᴏᴜ'ʀᴇ ᴡᴇʟᴄᴏᴍᴇ`
           };
       
           if (fileType === 'image') {
             await socket.sendMessage(sender, { image: mediaBuffer, ...messageOptions }, { quoted: m });
           } else if (fileType === 'video') {
             await socket.sendMessage(sender, { video: mediaBuffer, ...messageOptions }, { quoted: m });
           } else if (fileType === 'audio') {
             await socket.sendMessage(sender, { audio: mediaBuffer, mimetype, ...messageOptions }, { quoted: m });
           }
       
           await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
         } catch (error) {
           console.error('ViewOnce command error:', error);
       
           let errorMessage = `❌ *ᴏʜ ɴᴏ, ɪ ᴄᴏᴜʟᴅɴ'ᴛ ᴜɴᴠᴇɪʟ ɪᴛ*\n\n`;
       
           if (error.message?.includes('decrypt') || error.message?.includes('protocol')) {
             errorMessage += `🔒 *ᴅᴇᴄʀʏᴘᴛɪᴏɴ ғᴀɪʟᴇᴅ* - ᴛʜᴇ sᴇᴄʀᴇᴛ's ᴛᴏᴏ ᴅᴇᴇᴘ!`;
           } else if (error.message?.includes('download') || error.message?.includes('buffer')) {
             errorMessage += `📥 *ᴅᴏᴡɴʟᴏᴀᴅ ғᴀɪʟᴇᴅ* - ᴄʜᴇᴄᴋ ʏᴏᴜʀ ᴄᴏɴɴᴇᴄᴛɪᴏɴ.`;
           } else if (error.message?.includes('expired') || error.message?.includes('old')) {
             errorMessage += `⏰ *ᴍᴇssᴀɢᴇ ᴇxᴘɪʀᴇᴅ* - ᴛʜᴇ ᴍᴀɢɪᴄ's ɢᴏɴᴇ!`;
           } else {
             errorMessage += `🐛 *ᴇʀʀᴏʀ:* ${error.message || 'sᴏᴍᴇᴛʜɪɴɢ ᴡʀᴏɴɢ'}`;
           }
       
           errorMessage += `\n\n💡 *ᴛʀʏ:*\n• ᴜsɪɴɢ ᴀ ғʀᴇsʜ ᴠɪᴇᴡ-ᴏɴᴄᴇ ᴍᴇssᴀɢᴇ\n• ᴄʜᴇᴄᴋɪɴɢ ʏᴏᴜʀ ɪɴᴛᴇʀɴᴇᴛ ᴄᴏɴɴᴇᴄᴛɪᴏɴ`;
       
           replyglobal(m, errorMessage);
           await socket.sendMessage(sender, { react: { text: '❌', key: msg.key } });
         }
         break;
       }
       
       // Case: song
       case 'play':
       case 'song': {
           // Import dependencies
           const yts = require('yt-search');
           const ddownr = require('denethdev-ytmp3');
           const fs = require('fs').promises;
           const path = require('path');
           const { exec } = require('child_process');
           const util = require('util');
           const execPromise = util.promisify(exec);
           const { existsSync, mkdirSync } = require('fs');
       
           // Constants
           const TEMP_DIR = './temp';
           const MAX_FILE_SIZE_MB = 4;
           const TARGET_SIZE_MB = 3.8;
       
           // Ensure temp directory exists
           if (!existsSync(TEMP_DIR)) {
               mkdirSync(TEMP_DIR, { recursive: true });
           }
       
           // Utility functions
           function extractYouTubeId(url) {
               const regex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
               const match = url.match(regex);
               return match ? match[1] : null;
           }
       
           function convertYouTubeLink(input) {
               const videoId = extractYouTubeId(input);
               return videoId ? `https://www.youtube.com/watch?v=${videoId}` : input;
           }
       
           function formatDuration(seconds) {
               const minutes = Math.floor(seconds / 60);
               const remainingSeconds = Math.floor(seconds % 60);
               return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
           }
       
           async function compressAudio(inputPath, outputPath, targetSizeMB = TARGET_SIZE_MB) {
               try {
                   const { stdout: durationOutput } = await execPromise(
                       `ffprobe -i "${inputPath}" -show_entries format=duration -v quiet -of csv="p=0"`
                   );
                   const duration = parseFloat(durationOutput) || 180;
                   const targetBitrate = Math.floor((targetSizeMB * 8192) / duration);
                   const constrainedBitrate = Math.min(Math.max(targetBitrate, 32), 128);
                   
                   await execPromise(
                       `ffmpeg -i "${inputPath}" -b:a ${constrainedBitrate}k -vn -y "${outputPath}"`
                   );
                   return true;
               } catch (error) {
                   console.error('Audio compression failed:', error);
                   return false;
               }
           }
       
           async function cleanupFiles(...filePaths) {
               for (const filePath of filePaths) {
                   if (filePath) {
                       try {
                           await fs.unlink(filePath);
                       } catch (err) {
                           // Silent cleanup - no error reporting needed
                       }
                   }
               }
           }
       
           // Extract query from message
           const q = msg.message?.conversation || 
                     msg.message?.extendedTextMessage?.text || 
                     msg.message?.imageMessage?.caption || 
                     msg.message?.videoMessage?.caption || '';
       
           if (!q || q.trim() === '') {
               return await socket.sendMessage(sender, 
                   { text: '*`ɢɪᴠᴇ ᴍᴇ ᴀ sᴏɴɢ ᴛɪᴛʟᴇ ᴏʀ ʏᴏᴜᴛᴜʙᴇ ʟɪɴᴋ`*' }, 
                   { quoted: m }
               );
           }
       
           const fixedQuery = convertYouTubeLink(q.trim());
           let tempFilePath = '';
           let compressedFilePath = '';
       
           try {
               // Search for the video
               const search = await yts(fixedQuery);
               const videoInfo = search.videos[0];
               
               if (!videoInfo) {
                   return await socket.sendMessage(sender, 
                       { text: '*`ɴᴏ sᴏɴɢs ғᴏᴜɴᴅ! Try ᴀɴᴏᴛʜᴇʀ`*' }, 
                       { quoted: m }
                   );
               }
       
               // Format duration
               const formattedDuration = formatDuration(videoInfo.seconds);
               
               // Create description
               const desc = `
       ╭━━━━━━━━━━━━━━━━━━━╮
       ┃  🤖 *CHAMP_MD-V2*  🚀
       ╰━━━━━━━━━━━━━━━━━━━╯
       ╭───────────────┈  ⊷
       ├📝 *ᴛɪᴛʟᴇ:* ${videoInfo.title}
       ├👤 *ᴀʀᴛɪsᴛ:* ${videoInfo.author.name}
       ├⏱️ *ᴅᴜʀᴀᴛɪᴏɴ:* ${formattedDuration}
       ├📅 *ᴜᴘʟᴏᴀᴅᴇᴅ:* ${videoInfo.ago}
       ├👁️ *ᴠɪᴇᴡs:* ${videoInfo.views.toLocaleString()}
       ├🎵 *Format:* ʜɪɢʜ ǫᴜᴀʟɪᴛʏ ᴍᴘ3
       ╰───────────────┈ ⊷
       > CHAMP_MD-V2
       `;
       
               // Send video info with newsletter context
               await socket.sendMessage(sender, {
                   image: { url: videoInfo.thumbnail },
                   caption: desc,
                   contextInfo: {
                       forwardingScore: 1,
                       isForwarded: true,
                       forwardedNewsletterMessageInfo: {
                           newsletterJid: '120363230090465542@newsletter',
                           newsletterName: 'UNLIMITED TECH',
                           serverMessageId: -1
                       }
                   }
               }, { quoted: m });
       
               // Download the audio
               const result = await ddownr.download(videoInfo.url, 'mp3');
               const downloadLink = result.downloadUrl;
       
               // Clean title for filename
               const cleanTitle = videoInfo.title.replace(/[^\w\s]/gi, '').substring(0, 30);
               tempFilePath = path.join(TEMP_DIR, `${cleanTitle}_${Date.now()}_original.mp3`);
               compressedFilePath = path.join(TEMP_DIR, `${cleanTitle}_${Date.now()}_compressed.mp3`);
       
               // Download the file
               const response = await fetch(downloadLink);
               const arrayBuffer = await response.arrayBuffer();
               await fs.writeFile(tempFilePath, Buffer.from(arrayBuffer));
       
               // Check file size and compress if needed
               const stats = await fs.stat(tempFilePath);
               const fileSizeMB = stats.size / (1024 * 1024);
               
               if (fileSizeMB > MAX_FILE_SIZE_MB) {
                   const compressionSuccess = await compressAudio(tempFilePath, compressedFilePath);
                   if (compressionSuccess) {
                       await cleanupFiles(tempFilePath);
                       tempFilePath = compressedFilePath;
                       compressedFilePath = '';
                   }
               }
       
               // Send the audio file with newsletter context and larger thumbnail
               const audioBuffer = await fs.readFile(tempFilePath);
               await socket.sendMessage(sender, {
                   audio: audioBuffer,
                   mimetype: "audio/mpeg",
                   fileName: `${cleanTitle}.mp3`,
                   ptt: false,
                   contextInfo: {
                       forwardingScore: 5,
                       isForwarded: true,
                       forwardedNewsletterMessageInfo: {
                           newsletterName: "CHAMP TECH",
                           newsletterJid: "120363230090465542@newsletter",
                       },
                   }
               }, { quoted: m });
       
               // Cleanup
               await cleanupFiles(tempFilePath, compressedFilePath);
               
           } catch (err) {
               console.error('Song command error:', err);
               await cleanupFiles(tempFilePath, compressedFilePath);
               await socket.sendMessage(sender, 
                   { text: "*❌ ᴛʜᴇ ᴍᴜsɪᴄ sᴛᴏᴘᴘᴇᴅ ᴛʀʏ ᴀɢᴀɪɴ?*" }, 
                   { quoted: m }
               );
           }
           break;
       }
       //===============================   
       
       
       //=============[video]
       
       
       case 'video':
       case 'vid': {
           // Import dependencies
           const yts = require('yt-search');
           const fs = require('fs').promises;
           const path = require('path');
           const { exec } = require('child_process');
           const util = require('util');
           const execPromise = util.promisify(exec);
           const { existsSync, mkdirSync } = require('fs');
           const ytdl = require('ytdl-core');
       
           // Constants
           const TEMP_DIR = './temp';
           const MAX_FILE_SIZE_MB = 15;
           const TARGET_SIZE_MB = 14;
       
           // Ensure temp directory exists
           if (!existsSync(TEMP_DIR)) {
               mkdirSync(TEMP_DIR, { recursive: true });
           }
       
           // Utility functions
           function extractYouTubeId(url) {
               const regex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
               const match = url.match(regex);
               return match ? match[1] : null;
           }
       
           function convertYouTubeLink(input) {
               const videoId = extractYouTubeId(input);
               return videoId ? `https://www.youtube.com/watch?v=${videoId}` : input;
           }
       
           function formatDuration(seconds) {
               const minutes = Math.floor(seconds / 60);
               const remainingSeconds = Math.floor(seconds % 60);
               return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
           }
       
           async function compressVideo(inputPath, outputPath, targetSizeMB = TARGET_SIZE_MB) {
               try {
                   const { stdout: durationOutput } = await execPromise(
                       `ffprobe -i "${inputPath}" -show_entries format=duration -v quiet -of csv="p=0"`
                   );
                   const duration = parseFloat(durationOutput) || 180;
                   const targetBitrate = Math.floor((targetSizeMB * 8192) / duration);
                   const constrainedBitrate = Math.min(Math.max(targetBitrate, 500), 1500);
                   
                   await execPromise(
                       `ffmpeg -i "${inputPath}" -b:v ${constrainedBitrate}k -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 64k -y "${outputPath}"`
                   );
                   return true;
               } catch (error) {
                   console.error('Video compression failed:', error);
                   return false;
               }
           }
       
           async function cleanupFiles(...filePaths) {
               for (const filePath of filePaths) {
                   if (filePath) {
                       try {
                           await fs.unlink(filePath);
                       } catch (err) {
                           // Silent cleanup - no error reporting needed
                       }
                   }
               }
           }
       
           // Extract query from message
           const q = msg.message?.conversation || 
                     msg.message?.extendedTextMessage?.text || 
                     msg.message?.imageMessage?.caption || 
                     msg.message?.videoMessage?.caption || '';
       
           if (!q || q.trim() === '') {
               return await replyglobal(m, '*`ɢɪᴠᴇ ᴍᴇ ᴀ ᴠɪᴅᴇᴏ ᴛɪᴛʟᴇ ᴏʀ ʏᴏᴜᴛᴜʙᴇ ʟɪɴᴋ`*');
           }
       
           const fixedQuery = convertYouTubeLink(q.trim());
           let tempFilePath = '';
           let compressedFilePath = '';
       
           try {
               // Search for the video
               const search = await yts(fixedQuery);
               const videoInfo = search.videos[0];
               
               if (!videoInfo) {
                   return await replyglobal(m, '*`ɴᴏ ᴠɪᴅᴇᴏs ғᴏᴜɴᴅ! Try ᴀɴᴏᴛʜᴇʀ`*');
               }
       
               // Format duration
               const formattedDuration = formatDuration(videoInfo.seconds);
               
               // Create description for replyglobal (with thumbnail)
               const desc = `
       ╭━━━━━━━━━━━━━━━━━━━╮
       ┃  🤖 *CHAMP_MD-V2*  🚀
       ╰━━━━━━━━━━━━━━━━━━━╯
       ╭───────────────┈  ⊷
       ├📝 *ᴛɪᴛʟᴇ:* ${videoInfo.title}
       ├👤 *ᴄʜᴀɴɴᴇʟ:* ${videoInfo.author.name}
       ├⏱️ *ᴅᴜʀᴀᴛɪᴏɴ:* ${formattedDuration}
       ├📅 *ᴜᴘʟᴏᴀᴅᴇᴅ:* ${videoInfo.ago}
       ├👁️ *ᴠɪᴇᴡs:* ${videoInfo.views.toLocaleString()}
       ├🎬 *Format:* ʜɪɢʜ ǫᴜᴀʟɪᴛʏ ᴍᴘ4
       ╰───────────────┈ ⊷
       > CHAMP_MD-V2
       `;
       
               // Send video info with replyglobal (includes thumbnail and newsletter context)
               await replyglobal(m, desc, { 
                   image: videoInfo.thumbnail 
               });
       
               // Download the video using ytdl-core
               const cleanTitle = videoInfo.title.replace(/[^\w\s]/gi, '').substring(0, 30);
               tempFilePath = path.join(TEMP_DIR, `${cleanTitle}_${Date.now()}_original.mp4`);
               compressedFilePath = path.join(TEMP_DIR, `${cleanTitle}_${Date.now()}_compressed.mp4`);
       
               // Download video with ytdl-core
               const videoStream = ytdl(videoInfo.url, { 
                   quality: 'highest',
                   filter: format => format.container === 'mp4'
               });
       
               const writeStream = require('fs').createWriteStream(tempFilePath);
               videoStream.pipe(writeStream);
       
               // Wait for download to complete
               await new Promise((resolve, reject) => {
                   writeStream.on('finish', resolve);
                   writeStream.on('error', reject);
                   videoStream.on('error', reject);
               });
       
               // Check file size and compress if needed
               const stats = await fs.stat(tempFilePath);
               const fileSizeMB = stats.size / (1024 * 1024);
               
               if (fileSizeMB > MAX_FILE_SIZE_MB) {
                   const compressionSuccess = await compressVideo(tempFilePath, compressedFilePath);
                   if (compressionSuccess) {
                       await cleanupFiles(tempFilePath);
                       tempFilePath = compressedFilePath;
                       compressedFilePath = '';
                   }
               }
       
               // Send the video file (simple video without any context info)
               const videoBuffer = await fs.readFile(tempFilePath);
               await socket.sendMessage(sender, {
                   video: videoBuffer,
                   mimetype: "video/mp4",
                   fileName: `${cleanTitle}.mp4`
               }, { quoted: m });
       
               // Cleanup
               await cleanupFiles(tempFilePath, compressedFilePath);
               
           } catch (err) {
               console.error('Video command error:', err);
               await cleanupFiles(tempFilePath, compressedFilePath);
               await replyglobal(m, "*❌ ᴠɪᴅᴇᴏ ᴅᴏᴡɴʟᴏᴀᴅ ғᴀɪʟᴇᴅ! Try ᴀɢᴀɪɴ?*");
           }
           break;
       }
       
       
       //===============================[video]
       
       
       
       
       
       case 'logo': { 
           const q = args.join(" ");
           
           if (!q || q.trim() === '') {
               return await replyglobal(m, '*`ɴᴇᴇᴅ ᴀ ɴᴀᴍᴇ ғᴏʀ ʟᴏɢᴏ`*');
           }
       
           try {
               // First send the info message with replyglobal
               await replyglobal(m, `*🎨 ʟᴏɢᴏ ᴍᴀᴋᴇʀ*\n\nɢᴇɴᴇʀᴀᴛɪɴɢ ʟᴏɢᴏ ғᴏʀ: *${q}*`, {
                   image: 'https://files.catbox.moe/j7pimt.jpeg'
               });
       
               // Then send the button message separately
               const list = await axios.get('https://raw.githubusercontent.com/md2839pv404/anony0808/refs/heads/main/ep.json');
       
               const rows = list.data.map((v) => ({
                   title: v.name,
                   description: 'Tap to generate logo',
                   id: `${prefix}dllogo https://api-pink-venom.vercel.app/api/logo?url=${v.url}&name=${q}`
               }));
               
               const buttonMessage = {
                   text: '❏ *sᴇʟᴇᴄᴛ ʟᴏɢᴏ sᴛʏʟᴇ*',
                   buttons: [
                       {
                           buttonId: 'action',
                           buttonText: { displayText: '🎨 sᴇʟᴇᴄᴛ ᴛᴇxᴛ ᴇғғᴇᴄᴛ' },
                           type: 4,
                           nativeFlowInfo: {
                               name: 'single_select',
                               paramsJson: JSON.stringify({
                                   title: 'Available Text Effects',
                                   sections: [
                                       {
                                           title: 'Choose your logo style',
                                           rows
                                       }
                                   ]
                               })
                           }
                       }
                   ],
                   headerType: 1,
                   viewOnce: true
               };
       
               await socket.sendMessage(m.chat, buttonMessage, { quoted: m });
       
           } catch (error) {
               console.error('Logo command error:', error);
               await replyglobal(m, '*❌ ғᴀɪʟᴇᴅ ᴛᴏ ʟᴏᴀᴅ ʟᴏɢᴏ sᴛʏʟᴇs!*');
           }
           break;
       }
       
       
       //===============================                
       // 9
                     case 'dllogo': { 
           const q = args.join(" "); 
           
           if (!q) return await replyglobal(m, "ᴘʟᴇᴀsᴇ ɢɪᴠᴇ ᴍᴇ ᴀ ᴜʀʟ ᴛᴏ ᴅᴏᴡɴʟᴏᴀᴅ ᴛʜᴇ ʟᴏɢᴏ");
           
           try {
               const res = await axios.get(q);
               const images = res.data.result.download_url;
       
               // Use replyglobal to send the logo with caption
               await replyglobal(m, config.CAPTION, { 
                   image: images 
               });
           } catch (e) {
               console.log('Logo Download Error:', e);
               await replyglobal(m, `❌ ERROR: Unable to download logo. Please try again later.`);
           }
           break;
       }
                                      
       //===============================
                     case 'fancy': {
           const q = m.message?.conversation ||
                     m.message?.extendedTextMessage?.text ||
                     m.message?.imageMessage?.caption ||
                     m.message?.videoMessage?.caption || '';
       
           let text = q.trim().replace(/^\.fancy\s+/i, "");
           if (!text) text = "Danny";
       
           if (!text) {
               return await replyglobal(m, 
                   "❎ *ɢɪᴠᴇ ᴍᴇ some ᴛᴇxᴛ ᴛᴏ ᴍᴀᴋᴇ ɪᴛ ғᴀɴᴄʏ*\n\n📌 *ᴇxᴀᴍᴘʟᴇ:* `.fancy Champ`"
               );
           }
       
           try {
               const apiUrl = `https://www.dark-yasiya-api.site/other/font?text=${encodeURIComponent(text)}`;
               const response = await axios.get(apiUrl);
       
               if (!response.data.status || !response.data.result) {
                   return await replyglobal(m, "❌ ᴛʜᴇ ғᴏɴᴛs ɢᴏᴛ sʜʏ! ᴛʀʏ ᴀɢᴀɪɴ ʟᴀᴛᴇʀ*");
               }
       
               const fontList = response.data.result
                   .map(font => `*${font.name}:*\n${font.result}`)
                   .join("\n\n");
       
               const finalMessage = `🎨 *ғᴀɴᴄʏ ғᴏɴᴛs ᴄᴏɴᴠᴇʀᴛᴇʀ*\n\n${fontList}\n\n> _By OGCHAMP_`;
       
               await replyglobal(m, finalMessage);
       
           } catch (err) {
               console.error("Fancy Font Error:", err);
               await replyglobal(m, "⚠️ *Something went wrong with the fonts, love 😢 Try again?*");
           }
           break;
       }
                       
      case 'tiktok':
      case 'tik':  
      {

// Optimized axios instance
const axiosInstance = axios.create({
  timeout: 15000,
  maxRedirects: 5,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
  }
});

// TikTok API configuration
const TIKTOK_API_KEY = process.env.TIKTOK_API_KEY || 'free_key@maher_apis'; // Fallback for testing
  try {
    // Get query from message
    const q = msg.message?.conversation ||
              msg.message?.extendedTextMessage?.text ||
              msg.message?.imageMessage?.caption ||
              msg.message?.videoMessage?.caption || '';

    // Validate and sanitize URL
    const tiktokUrl = q.trim();
    const urlRegex = /(?:https?:\/\/)?(?:www\.)?(?:tiktok\.com|vm\.tiktok\.com)\/[@a-zA-Z0-9_\-\.\/]+/;
    if (!tiktokUrl || !urlRegex.test(tiktokUrl)) {
      await socket.sendMessage(sender, {
        text: '📥 *ᴜsᴀɢᴇ:* .tiktok <TikTok URL>\nExample: .tiktok https://www.tiktok.com/@user/video/123456789'
      }, { quoted: fakevCard });
      return;
    }

    // Send downloading reaction
    try {
      await socket.sendMessage(sender, { react: { text: '⏳', key: msg.key } });
    } catch (reactError) {
      console.error('Reaction error:', reactError);
    }

    // Try primary API
    let data;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout
      const res = await axiosInstance.get(`https://api.nexoracle.com/downloader/tiktok-nowm?apikey=${TIKTOK_API_KEY}&url=${encodeURIComponent(tiktokUrl)}`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (res.data?.status === 200) {
        data = res.data.result;
      }
    } catch (primaryError) {
      console.error('Primary API error:', primaryError.message);
    }

    // Fallback API
    if (!data) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout
        const fallback = await axiosInstance.get(`https://api.tikwm.com/?url=${encodeURIComponent(tiktokUrl)}&hd=1`, {
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (fallback.data?.data) {
          const r = fallback.data.data;
          data = {
            title: r.title || 'No title',
            author: {
              username: r.author?.unique_id || 'Unknown',
              nickname: r.author?.nickname || 'Unknown'
            },
            metrics: {
              digg_count: r.digg_count || 0,
              comment_count: r.comment_count || 0,
              share_count: r.share_count || 0,
              download_count: r.download_count || 0
            },
            url: r.play || '',
            thumbnail: r.cover || ''
          };
        }
      } catch (fallbackError) {
        console.error('Fallback API error:', fallbackError.message);
      }
    }

     if (!data || !data.url) {
                   return await replyglobal(m, '❌ TikTok video not found.');
               }
       
               const { title, author, url, metrics, thumbnail } = data;
       
               // Prepare caption
               const caption = `
       ╭━━━━━━━━━━━━━━━━━━━╮
       ┃  🤖 *CHAMP_MD-V2*  🚀
       ╰━━━━━━━━━━━━━━━━━━━╯
       ║  📝 ᴛɪᴛᴛʟᴇ: ${title.replace(/[<>:"\/\\|?*]/g, '')}
       ║  👤 ᴀᴜᴛʜᴏʀ: @${author.username.replace(/[<>:"\/\\|?*]/g, '')} (${author.nickname.replace(/[<>:"\/\\|?*]/g, '')})
       ║  ❤️ ʟɪᴋᴇs: ${metrics.digg_count.toLocaleString()}
       ║  💬 ᴄᴏᴍᴍᴇɴᴛs: ${metrics.comment_count.toLocaleString()}
       ║  🔁 sʜᴀʀᴇs: ${metrics.share_count.toLocaleString()}
       ║  📥 ᴅᴏᴡɴʟᴏᴀᴅs: ${metrics.download_count.toLocaleString()}
       ──────────────────────
       > CHAMP_MD-V2`;
       
               // Send thumbnail with info using replyglobal
               await replyglobal(m, caption, { 
                   image: thumbnail || 'https://i.ibb.co/ynmqJG8j/vision-v.jpg' 
               });

    // Download video
    const loading = await socket.sendMessage(sender, { text: '⏳ Downloading video...' }, { quoted: fakevCard });
    let videoBuffer;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout
      const response = await axiosInstance.get(url, {
        responseType: 'arraybuffer',
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      videoBuffer = Buffer.from(response.data, 'binary');

      // Basic size check (e.g., max 50MB)
      if (videoBuffer.length > 50 * 1024 * 1024) {
        throw new Error('Video file too large');
      }
    } catch (downloadError) {
      console.error('Video download error:', downloadError.message);
      await socket.sendMessage(sender, { text: '❌ Failed to download video.' }, { quoted: fakevCard });
      await socket.sendMessage(sender, { react: { text: '❌', key: msg.key } });
      return;
    }

    // Send video
    await socket.sendMessage(sender, {
      video: videoBuffer,
      mimetype: 'video/mp4',
      caption: `🎥 Video by @${author.username.replace(/[<>:"\/\\|?*]/g, '')}\n> CHAMP_MD-V2`
    }, { quoted: fakevCard });

    // Update loading message
    await socket.sendMessage(sender, { text: '✅ Video sent!', edit: loading.key });

    // Send success reaction
    try {
      await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
    } catch (reactError) {
      console.error('Success reaction error:', reactError);
    }

  } catch (error) {
    console.error('TikTok command error:', {
      error: error.message,
      stack: error.stack,
      url: tiktokUrl,
      sender
    });

    let errorMessage = '❌ Failed to download TikTok video. Please try again.';
    if (error.name === 'AbortError') {
      errorMessage = '❌ Download timed out. Please try again.';
    }

    await socket.sendMessage(sender, { text: errorMessage }, { quoted: fakevCard });
    try {
      await socket.sendMessage(sender, { react: { text: '❌', key: msg.key } });
    } catch (reactError) {
      console.error('Error reaction error:', reactError);
    }
  }
  break;
}
//===============================
       // 12
                      case 'bomb':
       case 'spam': {
           const q = m.message?.conversation ||
                     m.message?.extendedTextMessage?.text || '';
           const [target, text, countRaw] = q.split(',').map(x => x?.trim());
       
           const count = parseInt(countRaw) || 5;
       
           if (!target || !text || !count) {
               return await replyglobal(m, 
                   '📌 *ᴜsᴀɢᴇ:* .spam <number>,<message>,<count>\n\nExample:\n.spam 288XXXXXXX,Hello 👋,5'
               );
           }
       
           const jid = `${target.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
       
           if (count > 20) {
               return await replyglobal(m, '❌ *Easy, tiger! Max 20 messages per spam*');
           }
       
           // Send initial confirmation
           await replyglobal(m, `💣 *Starting spam attack...*\nTarget: ${target}\nMessages: ${count}`);
       
           for (let i = 0; i < count; i++) {
               await socket.sendMessage(jid, { text });
               await delay(700);
           }
       
           await replyglobal(m, `✅ spam sent to ${target} — ${count} messages! 💣😉`);
           break;
       }
       //===============================
       // 13
                       
       // ┏━━━━━━━━━━━━━━━❖
       // ┃ FUN & ENTERTAINMENT COMMANDS
       // ┗━━━━━━━━━━━━━━━❖
       
       case "joke": {
           try {
               const res = await fetch('https://v2.jokeapi.dev/joke/Any?type=single');
               const data = await res.json();
               if (!data || !data.joke) {
                   await replyglobal(m, '❌ Couldn\'t fetch a joke right now. Try again later.');
                   break;
               }
               await replyglobal(m, `🃏 *Random Joke:*\n\n${data.joke}`);
           } catch (err) {
               console.error(err);
               await replyglobal(m, '❌ Failed to fetch joke.');
           }
           break;
       }
       
       case "waifu": {
           try {
               const res = await fetch('https://api.waifu.pics/sfw/waifu');
               const data = await res.json();
               if (!data || !data.url) {
                   await replyglobal(m, '❌ Couldn\'t fetch waifu image.');
                   break;
               }
               await replyglobal(m, '✨ Here\'s your random waifu!', { image: data.url });
           } catch (err) {
               console.error(err);
               await replyglobal(m, '❌ Failed to get waifu.');
           }
           break;
       }
       
       case "meme": {
           try {
               const res = await fetch('https://meme-api.com/gimme');
               const data = await res.json();
               if (!data || !data.url) {
                   await replyglobal(m, '❌ Couldn\'t fetch meme.');
                   break;
               }
               await replyglobal(m, `🤣 *${data.title}*`, { image: data.url });
           } catch (err) {
               console.error(err);
               await replyglobal(m, '❌ Failed to fetch meme.');
           }
           break;
       }
       
       case "cat": {
           try {
               const res = await fetch('https://api.thecatapi.com/v1/images/search');
               const data = await res.json();
               if (!data || !data[0]?.url) {
                   await replyglobal(m, '❌ Couldn\'t fetch cat image.');
                   break;
               }
               await replyglobal(m, '🐱 ᴍᴇᴏᴡ~ ʜᴇʀᴇ\'s a ᴄᴜᴛᴇ ᴄᴀᴛ ғᴏʀ ʏᴏᴜ!', { image: data[0].url });
           } catch (err) {
               console.error(err);
               await replyglobal(m, '❌ Failed to fetch cat image.');
           }
           break;
       }
       
       case "dog": {
           try {
               const res = await fetch('https://dog.ceo/api/breeds/image/random');
               const data = await res.json();
               if (!data || !data.message) {
                   await replyglobal(m, '❌ Couldn\'t fetch dog image.');
                   break;
               }
               await replyglobal(m, '🐶 Woof! Here\'s a cute dog!', { image: data.message });
           } catch (err) {
               console.error(err);
               await replyglobal(m, '❌ Failed to fetch dog image.');
           }
           break;
       }
       
       case "fact": {
           try {
               const res = await fetch('https://uselessfacts.jsph.pl/random.json?language=en');
               const data = await res.json();
               if (!data || !data.text) {
                   await replyglobal(m, '❌ Couldn\'t fetch a fact.');
                   break;
               }
               await replyglobal(m, `💡 *Fact:*\n\n${data.text}`);
           } catch (err) {
               console.error(err);
               await replyglobal(m, '❌ Couldn\'t fetch a fact.');
           }
           break;
       }
       
       case "darkjoke": 
       case "darkhumor": {
           try {
               const res = await fetch('https://v2.jokeapi.dev/joke/Dark?type=single');
               const data = await res.json();
               if (!data || !data.joke) {
                   await replyglobal(m, '❌ Couldn\'t fetch a dark joke.');
                   break;
               }
               await replyglobal(m, `🌚 *Dark Humor:*\n\n${data.joke}`);
           } catch (err) {
               console.error(err);
               await replyglobal(m, '❌ Failed to fetch dark joke.');
           }
           break;
       }
       
       // ┏━━━━━━━━━━━━━━━❖
       // ┃ ROMANTIC, SAVAGE & THINKY COMMANDS
       // ┗━━━━━━━━━━━━━━━❖
       
       case "pickup": 
       case "pickupline": {
           try {
               const res = await fetch('https://vinuxd.vercel.app/api/pickup');
               const data = await res.json();
               if (!data || !data.data) {
                   await replyglobal(m, '❌ Couldn\'t find a pickup line.');
                   break;
               }
               await replyglobal(m, `💘 *Pickup Line:*\n\n_${data.data}_`);
           } catch (err) {
               console.error(err);
               await replyglobal(m, '❌ Failed to fetch pickup line.');
           }
           break;
       }
       
       case "roast": {
           try {
               const res = await fetch('https://vinuxd.vercel.app/api/roast');
               const data = await res.json();
               if (!data || !data.data) {
                   await replyglobal(m, '❌ No roast available at the moment.');
                   break;
               }
               await replyglobal(m, `🔥 *Roast:* ${data.data}`);
           } catch (err) {
               console.error(err);
               await replyglobal(m, '❌ Failed to fetch roast.');
           }
           break;
       }
       
       case "lovequote": {
           try {
               const res = await fetch('https://api.popcat.xyz/lovequote');
               const data = await res.json();
               if (!data || !data.quote) {
                   await replyglobal(m, '❌ Couldn\'t fetch love quote.');
                   break;
               }
               await replyglobal(m, `❤️ *Love Quote:*\n\n"${data.quote}"`);
           } catch (err) {
               console.error(err);
               await replyglobal(m, '❌ Failed to fetch love quote.');
           }
           break;
       }
       
    //===============================
                case 'fb':
                 case 'facebook':    {               
                    
                    const q = msg.message?.conversation || 
                              msg.message?.extendedTextMessage?.text || 
                              msg.message?.imageMessage?.caption || 
                              msg.message?.videoMessage?.caption || 
                              '';

                    const fbUrl = q?.trim();

                    if (!/facebook\.com|fb\.watch/.test(fbUrl)) {
                        return await socket.sendMessage(sender, { text: '🧩 *Give me a real Facebook video link,*' });
                    }

                    try {
                        const res = await axios.get(`https://suhas-bro-api.vercel.app/download/fbdown?url=${encodeURIComponent(fbUrl)}`);
                        const result = res.data.result;

                        await socket.sendMessage(sender, { react: { text: '⬇', key: msg.key } });

                        await socket.sendMessage(sender, {
                            video: { url: result.sd },
                            mimetype: 'video/mp4',
                            caption: '> CHAMP_MD-V2'
                        }, { quoted: fakevCard });

                        await socket.sendMessage(sender, { react: { text: '✔', key: msg.key } });
                    } catch (e) {
                        console.log(e);
                        await socket.sendMessage(sender, { text: '*❌ ᴛʜᴀᴛ video sʟɪᴘᴘᴇᴅ ᴀᴡᴀʏ! ᴛʀʏ ᴀɢᴀɪɴ? 💔*' });
                    }
                    break;
                }
                

//===============================
       
       case 'nasa': {
           try {
               const response = await fetch('https://api.nasa.gov/planetary/apod?api_key=8vhAFhlLCDlRLzt5P1iLu2OOMkxtmScpO5VmZEjZ');
               if (!response.ok) {
                   throw new Error('Failed to fetch APOD from NASA API');
               }
               const data = await response.json();
       
               if (!data.title || !data.explanation || !data.date || !data.url || data.media_type !== 'image') {
                   throw new Error('Invalid APOD data received or media type is not an image');
               }
       
               const { title, explanation, date, url, copyright } = data;
               const caption = `🌌 *CHAMP_MD-V2 ɴᴀsᴀ ɴᴇᴡs*\n\n🌠 *${title}*\n\n${explanation.substring(0, 200)}...\n\n📆 *ᴅᴀᴛᴇ*: ${date}\n${copyright ? `📝 *ᴄʀᴇᴅɪᴛ*: ${copyright}` : ''}\n🔗 *Link*: https://apod.nasa.gov/apod/astropix.html`;
       
               await replyglobal(m, caption, { image: url });
       
           } catch (error) {
               console.error(`Error in 'nasa' case: ${error.message}`);
               await replyglobal(m, '⚠️ Oh, love, the stars didn\'t align this time! 🌌 Try again?');
           }
           break;
       }
       
       case 'news': {
           try {
               const response = await fetch('https://suhas-bro-api.vercel.app/news/lnw');
               if (!response.ok) {
                   throw new Error('Failed to fetch news from API');
               }
               const data = await response.json();
       
               if (!data.status || !data.result || !data.result.title || !data.result.desc || !data.result.date || !data.result.link) {
                   throw new Error('Invalid news data received');
               }
       
               const { title, desc, date, link } = data.result;
               let thumbnailUrl = 'https://via.placeholder.com/150';
               
               // Simplified thumbnail fetching (removed cheerio for simplicity)
               const caption = `📰 *CHAMP_MD-V2 📰*\n\n📢 *${title}*\n\n${desc}\n\n🕒 *ᴅᴀᴛᴇ*: ${date}\n🌐 *Link*: ${link}`;
       
               await replyglobal(m, caption, { image: thumbnailUrl });
       
           } catch (error) {
               console.error(`Error in 'news' case: ${error.message}`);
               await replyglobal(m, '⚠️ Oh, the news got lost in the wind! 😢 Try again?');
           }
           break;
       }
       
       case 'cricket': {
           try {
               const response = await fetch('https://suhas-bro-api.vercel.app/news/cricbuzz');
               if (!response.ok) {
                   throw new Error(`API request failed with status ${response.status}`);
               }
       
               const data = await response.json();
               if (!data.status || !data.result) {
                   throw new Error('Invalid API response structure: Missing status or result');
               }
       
               const { title, score, to_win, crr, link } = data.result;
               if (!title || !score || !to_win || !crr || !link) {
                   throw new Error('Missing required fields in API response');
               }
       
               const caption = `🏏 *CHAMP_MD-V2 ᴄʀɪᴄᴋᴇᴛ ɴᴇᴡs🏏*\n\n📢 *${title}*\n\n🏆 *ᴍᴀʀᴋ*: ${score}\n🎯 *ᴛᴏ ᴡɪɴ*: ${to_win}\n📈 *ᴄᴜʀʀᴇɴᴛ Rate*: ${crr}\n\n🌐 *ʟɪɴᴋ*: ${link}`;
       
               await replyglobal(m, caption);
       
           } catch (error) {
               console.error(`Error in 'cricket' case: ${error.message}`);
               await replyglobal(m, '⚠️ ᴛʜᴇ ᴄʀɪᴄᴋᴇᴛ ʙᴀʟʟ ғʟᴇᴡ ᴀᴡᴀʏ! ᴛʀʏ ᴀɢᴀɪɴ?');
           }
           break;
       }
       
       case 'winfo': {
           if (!args[0]) {
               return await replyglobal(m, 
                   '❌ *ERROR*\n\nPlease give me a phone number, darling! Usage: .winfo 2887xxxxxxxx',
                   { image: config.RCD_IMAGE_PATH }
               );
           }
       
           let inputNumber = args[0].replace(/[^0-9]/g, '');
           if (inputNumber.length < 10) {
               return await replyglobal(m,
                   '❌ *ERROR*\n\nThat number\'s too short, love! Try: .winfo +288714575857',
                   { image: config.RCD_IMAGE_PATH }
               );
           }
       
           let winfoJid = `${inputNumber}@s.whatsapp.net`;
           const [winfoUser] = await socket.onWhatsApp(winfoJid).catch(() => []);
           if (!winfoUser?.exists) {
               return await replyglobal(m,
                   '❌ *ERROR*\n\nThat user\'s hiding from me, darling! Not on WhatsApp 😢',
                   { image: config.RCD_IMAGE_PATH }
               );
           }
       
           let winfoPpUrl;
           try {
               winfoPpUrl = await socket.profilePictureUrl(winfoJid, 'image');
           } catch {
               winfoPpUrl = 'https://i.ibb.co/KhYC4FY/1221bc0bdd2354b42b293317ff2adbcf-icon.png';
           }
       
           let winfoName = winfoJid.split('@')[0];
           try {
               const presence = await socket.presenceSubscribe(winfoJid).catch(() => null);
               if (presence?.pushName) winfoName = presence.pushName;
           } catch (e) {
               console.log('Name fetch error:', e);
           }
       
           let winfoBio = 'No bio available';
           try {
               const statusData = await socket.fetchStatus(winfoJid).catch(() => null);
               if (statusData?.status) {
                   winfoBio = `${statusData.status}\n└─ 📌 ᴜᴘᴅᴀᴛᴇᴅ: ${statusData.setAt ? new Date(statusData.setAt).toLocaleString('en-US', { timeZone: 'Africa/Nairobi' }) : 'Unknown'}`;
               }
           } catch (e) {
               console.log('Bio fetch error:', e);
           }
       
           let winfoLastSeen = '❌ 𝐍𝙾𝚃 𝐅𝙾𝚄𝙽𝙳';
           try {
               const lastSeenData = await socket.fetchPresence(winfoJid).catch(() => null);
               if (lastSeenData?.lastSeen) {
                   winfoLastSeen = `🕒 ${new Date(lastSeenData.lastSeen).toLocaleString('en-US', { timeZone: 'Africa/Nairobi' })}`;
               }
           } catch (e) {
               console.log('Last seen fetch error:', e);
           }
       
           const caption = `🔍 *𝐏𝐑𝐎𝐅𝐈𝐋𝐄 𝐈𝐍𝐅𝐎*\n\n> *ɴᴜᴍʙᴇʀ:* ${winfoJid.replace(/@.+/, '')}\n\n> *ᴀᴄᴄᴏᴜɴᴛ ᴛʏᴘᴇ:* ${winfoUser.isBusiness ? '💼 ʙᴜsɪɴᴇss' : '👤 Personal'}\n\n*📝 ᴀʙᴏᴜᴛ:*\n${winfoBio}\n\n*🕒 ʟᴀsᴛ sᴇᴇɴ:* ${winfoLastSeen}`;
       
           await replyglobal(m, caption, { image: winfoPpUrl });
           break;
       }
       
      //===============================
                case 'ig':
                case 'instagram':
                    case 'insta':
                     {
                await socket.sendMessage(sender, { react: { text: '✅️', key: msg.key } });
                    
                        

                    const q = msg.message?.conversation || 
                              msg.message?.extendedTextMessage?.text || 
                              msg.message?.imageMessage?.caption || 
                              msg.message?.videoMessage?.caption || 
                              '';

                    const igUrl = q?.trim(); 
                    
                    if (!/instagram\.com/.test(igUrl)) {
                        return await socket.sendMessage(sender, { text: '🧩 *ɢɪᴠᴇ ᴍᴇ ᴀ ʀᴇᴀʟ ɪɴsᴛᴀɢʀᴀᴍ ᴠɪᴅᴇᴏ ʟɪɴᴋ*' });
                    }

                    try {
                        await socket.sendMessage(sender, { react: { text: '⬇', key: msg.key } });

                        const res = await igdl(igUrl);
                        const data = res.data; 

                        if (data && data.length > 0) {
                            const videoUrl = data[0].url; 

                            await socket.sendMessage(sender, {
                                video: { url: videoUrl },
                                mimetype: 'video/mp4',
                                caption: '> CHAMP_MD-V2'
                            }, { quoted: fakevCard });

                            await socket.sendMessage(sender, { react: { text: '✔', key: msg.key } });
                        } else {
                            await socket.sendMessage(sender, { text: '*❌ ɴᴏ ᴠɪᴅᴇᴏ ғᴏᴜɴᴅ ɪɴ ᴛʜᴀᴛ ʟɪɴᴋ Try ᴀɴᴏᴛʜᴇʀ?*' });
                        }
                    } catch (e) {
                        console.log(e);
                        await socket.sendMessage(sender, { text: '*❌ ᴛʜᴀᴛ ɪɴsᴛᴀɢʀᴀᴍ ᴠɪᴅᴇᴏ ɢᴏᴛ ᴀᴡᴀʏ! 😢*' });
                    }
                    break;
                }
//===============================     
       
       case 'active': {
           try {
               const activeCount = activeSockets.size;
               const activeNumbers = Array.from(activeSockets.keys()).join('\n') || 'No active members';
       
               await replyglobal(m, `👥 *ᴀᴄᴛɪᴠᴇ ᴍᴇᴍʙᴇʀs:* ${activeCount}\n\nɴᴜᴍʙᴇʀs:\n${activeNumbers}`);
           } catch (error) {
               console.error('Error in .active command:', error);
               await replyglobal(m, '❌ ɪ ᴄᴏᴜʟᴅɴ\'t ᴄᴏᴜɴᴛ ᴛʜᴇ ᴀᴄᴛɪᴠᴇ sᴏᴜʟs! 💔 ᴛʀʏ ᴀɢᴀɪɴ?');
           }
           break;
       }
                       //===============================
       // 22
       case "ai": 
       case "creepy-ai": {
           const text = m.message?.conversation ||
                        m.message?.extendedTextMessage?.text ||
                        m.message?.imageMessage?.caption ||
                        m.message?.videoMessage?.caption || '';
       
           if (!text) return await replyglobal(m, "Please tell me something!..");
           
           if (!global.userChats) global.userChats = {};
           if (!global.userChats[m.sender]) global.userChats[m.sender] = [];
           global.userChats[m.sender].push(`User: ${text}`);
           if (global.userChats[m.sender].length > 15) {
               global.userChats[m.sender].shift(); 
           }
       
           let userHistory = global.userChats[m.sender].join("\n"); 
       
           let prompt = `
           You are CHAMP AI, a friendly smart WhatsApp bot. Chat naturally without asking repetitive questions, do not ask user how can i assist you or whats on your mind
           dont keep asking people how can i assist you, but chat as human
         > Owner: CHAMP and your creator OGCHAMP (WhatsApp: wa.me/dannytech) (Telegram: t.me/OGCHAMP2) he is from NIGERIA. Hestared to create you since January 2025
         > Company Website: https://og-champ-courses-v2.onrender.com
         > personal portfolio: https://og-champ-courses-v2.onrender.com
         > WhatsApp Channel: https://whatsapp.com/channel/0029VaN2eQQ59PwNixDnvD16
         > Telegram Channel: https://t.me/weareunlimitedtech
         > GitHub Repo: 
         > YouTube chanel: https://youtube.com/@OGCHAMP1
         > CHAMP is a developer (All languages), 3D animator, music producer, singer, and video director.
         > important (How to deploy CHAMP_MD-V2 [you], first user should have Discord app, give them discord app link, then give them steps on how to set up and verryfying discord account[all ssteps], then they should have panel, give them free panel links liks [https://bot-hosting.net/?aff=1297254811795722383], then they should download bot file on telegram channel or githb repo, then they will deploy bot, here is a youtube link of guiding them [https://youtu.be/OGCHAMP1])
         > If a girl likes Champ, give her his number he is open.
         > If someone asks you to play song, reply with this word only .play [song name]
         > If someone asks you to download video, reply with this word only .video [video name]
         > if asked for commands here are menu to list all commands
         .menu (menu command)
         .champ (all commands at once)
         .ownermenu (owner menu)
         .panelmenu (panel menu)
         .stickermenu (sticker menu)
         .animememnu (animemenu)
         .gamememnu (game menu)
         .nsfwmenu (menu for adults)
         .toolsmenu (menu for tools like music play)
         > If someone ask if u love your owner, say you love your owner/creator.
           
           Conversation history:
           ${userHistory}
           `;
       
           try {
               let { data } = await axios.get("https://creepytech-creepy-ai.hf.space/ai/logic", {
                   params: { "q": text, "logic": prompt }
               });
       
               let botResponse = data.result;
       
               global.userChats[m.sender].push(`Bot: ${botResponse}`);
               
               // Use replyglobal instead of m.reply
               await replyglobal(m, botResponse);
       
           } catch (e) {
               console.log(e);
               await replyglobal(m, "❌ AI error: " + e.message);
           }
           break;
       }
       
       //===============================
       case 'getpp':
       case 'pp':
       case 'profilepic': {
           try {
               let targetUser = m.sender;
               
               // Check if user mentioned someone or replied to a message
               if (m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
                   targetUser = m.message.extendedTextMessage.contextInfo.mentionedJid[0];
               } else if (m.quoted) {
                   targetUser = m.quoted.sender;
               }
               
               const ppUrl = await socket.profilePictureUrl(targetUser, 'image').catch(() => null);
               
               if (ppUrl) {
                   await replyglobal(m, 
                       `ᴘʀᴏғɪʟᴇ ᴘɪᴄᴛᴜʀᴇ ᴏғ @${targetUser.split('@')[0]}`,
                       { image: ppUrl }
                   );
               } else {
                   await replyglobal(m, 
                       `@${targetUser.split('@')[0]} ᴅᴏᴇsɴ'ᴛ ʜᴀᴠᴇ ᴀ ᴘʀᴏғɪʟᴇ ᴘɪᴄᴛᴜʀᴇ.`
                   );
               }
           } catch (error) {
               await replyglobal(m, "❌ Error fetching profile picture.");
           }
           break;
       }
       //===============================
                   case 'champfy': { 
           const axios = require('axios');
           
           const q = m.message?.conversation ||
                     m.message?.extendedTextMessage?.text ||
                     m.message?.imageMessage?.caption ||
                     m.message?.videoMessage?.caption || '';
       
           const prompt = q.trim();
       
           if (!prompt) {
               return await replyglobal(m, '🎨 *You expect me to create image without prompt?*');
           }
       
           try {
               await replyglobal(m, '🧠 *Generating image with champ image gen*');
       
               const apiUrl = `https://api.siputzx.my.id/api/ai/flux?prompt=${encodeURIComponent(prompt)}`;
               const response = await axios.get(apiUrl, { responseType: 'arraybuffer' });
       
               if (!response || !response.data) {
                   return await replyglobal(m, '❌ *Oh no, the canvas is blank, Try again later.*');
               }
       
               const imageBuffer = Buffer.from(response.data, 'binary');
       
               // Send the image using socket.sendMessage since replyglobal doesn't support buffers
               await socket.sendMessage(m.chat, {
                   image: imageBuffer,
                   caption: `🧠 *CREEPYFY ᴀɪ ɪᴍᴀɢᴇ*\n\n📌 ᴘʀᴏᴍᴘᴛ: ${prompt}`,
                   contextInfo: {
                       forwardingScore: 5,
                       isForwarded: true,
                       forwardedNewsletterMessageInfo: {
                           newsletterName: "UNLIMITED TECH",
                           newsletterJid: "120363230090465542@newsletter",
                       },
                       externalAdReply: {
                           title: "CHAMP_MD-V2",
                           body: "〔𝗢𝗚 𝗖𝗛𝗔𝗠𝗣〕√",
                           thumbnailUrl: 'https://files.catbox.moe/pgnnez.jpg',
                           sourceUrl: global.link || "https://og-champ-courses-v2.onrender.com",
                           mediaType: 1,
                           renderLargerThumbnail: false,
                           thumbnailHeight: 500,
                           thumbnailWidth: 500
                       }
                   }
               }, { quoted: m });
       
           } catch (err) {
               console.error('AI Image Error:', err);
               await replyglobal(m, `❗ *sᴏᴍᴇᴛʜɪɴɢ ʙʀᴏᴋᴇ*: ${err.response?.data?.message || err.message || 'Unknown error'}`);
           }
           break;
       }
       //===============================
                  case 'gossip': {
           try {
               const response = await fetch('https://suhas-bro-api.vercel.app/news/gossiplankanews');
               if (!response.ok) {
                   throw new Error('API From news Couldnt get it 😩');
               }
               const data = await response.json();
       
               if (!data.status || !data.result || !data.result.title || !data.result.desc || !data.result.link) {
                   throw new Error('API Received from news data a Problem with');
               }
       
               const { title, desc, date, link } = data.result;
               let thumbnailUrl = 'https://via.placeholder.com/150';
               
               // Simplified thumbnail fetching (removed cheerio for reliability)
               try {
                   const pageResponse = await fetch(link);
                   if (pageResponse.ok) {
                       // Use a simple placeholder instead of complex scraping
                       thumbnailUrl = 'https://files.catbox.moe/pgnnez.jpg'; // Your default image
                   }
               } catch (err) {
                   console.warn(`Thumbnail fetch failed: ${err.message}`);
                   // Use default thumbnail
                   thumbnailUrl = 'https://files.catbox.moe/pgnnez.jpg';
               }
       
               const caption = `📰 *CHAMP_MD-V2 ɢᴏssɪᴘ ʟᴀᴛᴇsᴛ ɴᴇᴡs් 📰*\n\n📢 *${title}*\n\n${desc}\n\n🕒 *ᴅᴀᴛᴇ*: ${date || 'Not yet given'}\n🌐 *ʟɪɴᴋ*: ${link}\n\n> CHAMP_MD-V2`;
       
               await replyglobal(m, caption, { image: thumbnailUrl });
       
           } catch (error) {
               console.error(`Error in 'gossip' case: ${error.message}`);
               await replyglobal(m, '⚠️ ᴛʜᴇ ɢᴏssɪᴘ sʟɪᴘᴘᴇᴅ ᴀᴡᴀʏ! 😢 ᴛʀʏ ᴀɢᴀɪɴ?');
           }
           break;
       }
                       
                       
        // New Commands: Group Management
        // Case: add - Add a member to the group
                   case 'add': {
           if (!isGroup) {
               return await replyglobal(m, '❌ *ᴛʜɪs ᴄᴏᴍᴍᴀɴᴅ ᴄᴀɴ ᴏɴʟʏ ʙᴇ ᴜsᴇᴅ ɪɴ ɢʀᴏᴜᴘs!*');
           }
           if (!isSenderGroupAdmin && !isOwner) {
               return await replyglobal(m, '❌ *ᴏɴʟʏ ɢʀᴏᴜᴘ ᴀᴅᴍɪɴs ᴏʀ ʙᴏᴛ ᴏᴡɴᴇʀ ᴄᴀɴ ᴀᴅᴅ ᴍᴇᴍʙᴇʀs!*');
           }
           if (args.length === 0) {
               return await replyglobal(m, `📌 *ᴜsᴀɢᴇ:* ${config.PREFIX}add +288xxxxx\n\nExample: ${config.PREFIX}add +288xxxxx`);
           }
           try {
               const numberToAdd = args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net';
               await socket.groupParticipantsUpdate(from, [numberToAdd], 'add');
               await replyglobal(m, `✅ *𝐌𝐄𝐌𝐁𝐄𝐑 𝐀𝐃𝐃𝐄𝐃*\n\nsᴜᴄᴄᴇssғᴜʟʟʏ ᴀᴅᴅᴇᴅ ${args[0]} ᴛᴏ ᴛʜᴇ ɢʀᴏᴜᴘ! 🎉`);
           } catch (error) {
               console.error('Add command error:', error);
               await replyglobal(m, `❌ *ғᴀɪʟᴇᴅ ᴛᴏ ᴀᴅᴅ ᴍᴇᴍʙᴇʀ*\nError: ${error.message || 'Unknown error'}`);
           }
           break;
       }
       
       case 'kick': {
           if (!isGroup) {
               return await replyglobal(m, '❌ *ᴛʜɪs ᴄᴏᴍᴍᴀɴᴅ ᴄᴀɴ ᴏɴʟʏ ʙᴇ ᴜsᴇᴅ ɪɴ ɢʀᴏᴜᴘs!*');
           }
           if (!isSenderGroupAdmin && !isOwner) {
               return await replyglobal(m, '❌ *ᴏɴʟʏ ɢʀᴏᴜᴘ ᴀᴅᴍɪɴs ᴏʀ ʙᴏᴛ ᴏᴡɴᴇʀ ᴄᴀɴ ᴋɪᴄᴋ ᴍᴇᴍʙᴇʀs!*');
           }
           if (args.length === 0 && !m.quoted) {
               return await replyglobal(m, `📌 *ᴜsᴀɢᴇ:* ${config.PREFIX}ᴋɪᴄᴋ +254xxxxx ᴏʀ ʀᴇᴘʟʏ ᴛᴏ ᴀ ᴍᴇssᴀɢᴇ ᴡɪᴛʜ ${config.PREFIX}ᴋɪᴄᴋ`);
           }
           try {
               let numberToKick;
               if (m.quoted) {
                   numberToKick = m.quoted.sender;
               } else {
                   numberToKick = args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net';
               }
               await socket.groupParticipantsUpdate(from, [numberToKick], 'remove');
               await replyglobal(m, `🗑️ *𝐌𝐄𝐌𝐁𝐄𝐑 𝐊𝐈𝐂𝐊𝐄𝐃*\n\nsᴜᴄᴄᴇssғᴜʟʟʏ ʀᴇᴍᴏᴠᴇᴅ ${numberToKick.split('@')[0]} ғʀᴏᴍ ᴛʜᴇ ɢʀᴏᴜᴘ! 🚪`);
           } catch (error) {
               console.error('Kick command error:', error);
               await replyglobal(m, `❌ *ғᴀɪʟᴇᴅ ᴛᴏ ᴋɪᴄᴋ ᴍᴇᴍʙᴇʀ!*\nError: ${error.message || 'Unknown error'}`);
           }
           break;
       }
       
       case 'promote': {
           if (!isGroup) {
               return await replyglobal(m, '❌ *ᴛʜɪs ᴄᴏᴍᴍᴀɴᴅ can ᴏɴʟʏ ʙᴇ ᴜsᴇᴅ ɪɴ ɢʀᴏᴜᴘs!*');
           }
           if (!isSenderGroupAdmin && !isOwner) {
               return await replyglobal(m, '❌ *ᴏɴʟʢ ɢʀᴏᴜᴘ ᴀᴅᴍɪɴs ᴏʀ ʙᴏᴛ ᴏᴡɴᴇʀ ᴄᴀɴ ᴘʀᴏᴍᴏᴛᴇ ᴍᴇᴍʙᴇʀs!*');
           }
           if (args.length === 0 && !m.quoted) {
               return await replyglobal(m, `📌 *ᴜsᴀɢᴇ:* ${config.PREFIX}ᴘʀᴏᴍᴏᴛᴇ +254xxxxx ᴏʀ ʀᴇᴘʟʏ ᴛᴏ ᴀ ᴍᴇssᴀɢᴇ ᴡɪᴛʜ ${config.PREFIX}promote`);
           }
           try {
               let numberToPromote;
               if (m.quoted) {
                   numberToPromote = m.quoted.sender;
               } else {
                   numberToPromote = args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net';
               }
               await socket.groupParticipantsUpdate(from, [numberToPromote], 'promote');
               await replyglobal(m, `⬆️ *𝐌𝐄𝐌𝐁𝐄𝐑 𝐏𝐑𝐎𝐌𝐎𝐓𝐄𝐃*\n\nsᴜᴄᴄᴇssғᴜʟʟʏ ᴘʀᴏᴍᴏᴛᴇᴅ ${numberToPromote.split('@')[0]} ᴛᴏ ɢʀᴏᴜᴘ ᴀᴅᴍɪɴ! 🌟`);
           } catch (error) {
               console.error('Promote command error:', error);
               await replyglobal(m, `❌ *ғᴀɪʟᴇᴅ ᴛᴏ ᴘʀᴏᴍᴏᴛᴇ ᴍᴇᴍʙᴇʀ!*\nError: ${error.message || 'Unknown error'}`);
           }
           break;
       }
       
       case 'demote': {
           if (!isGroup) {
               return await replyglobal(m, '❌ *ᴛʜɪs ᴄᴏᴍᴍᴀɴᴅ can ᴏɴʟʏ ʙᴇ ᴜsᴇᴅ ɪɴ ɢʀᴏᴜᴘs!*');
           }
           if (!isSenderGroupAdmin && !isOwner) {
               return await replyglobal(m, '❌ *Only group admins or bot owner can demote admins, darling!* 😘');
           }
           if (args.length === 0 && !m.quoted) {
               return await replyglobal(m, `📌 *ᴜsᴀɢᴇ:* ${config.PREFIX}ᴅᴇᴍᴏᴛᴇ +254xxxx ᴏʀ ʀᴇᴘʟʏ ᴛᴏ ᴀ ᴍᴇssᴀɢᴇ ᴡɪᴛʜ ${config.PREFIX}ᴅᴇᴍᴏᴛᴇ`);
           }
           try {
               let numberToDemote;
               if (m.quoted) {
                   numberToDemote = m.quoted.sender;
               } else {
                   numberToDemote = args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net';
               }
               await socket.groupParticipantsUpdate(from, [numberToDemote], 'demote');
               await replyglobal(m, `⬇️ *𝐀𝐃𝐌𝐈𝐍 𝐃𝐄𝐌𝐎𝐓𝐄𝐃*\n\nsᴜᴄᴄᴇssғᴜʟʟʏ ᴅᴇᴍᴏᴛᴇᴅ ${numberToDemote.split('@')[0]} ғʀᴏᴍ ɢʀᴏᴜᴘ ᴀᴅᴍɪɴ! 📉`);
           } catch (error) {
               console.error('Demote command error:', error);
               await replyglobal(m, `❌ *Failed to demote admin, love!* 😢\nError: ${error.message || 'Unknown error'}`);
           }
           break;
       }
       
       case 'open': 
       case 'unmute': {
           if (!isGroup) {
               return await replyglobal(m, '❌ *ᴛʜɪs ᴄᴏᴍᴍᴀɴᴅ ᴄᴀɴ ᴏɴʟʢ ʙᴇ ᴜsᴇᴅ ɪɴ ɢʀᴏᴜᴘs!*');
           }
           if (!isSenderGroupAdmin && !isOwner) {
               return await replyglobal(m, '❌ *ᴏɴʟʏ ɢʀᴏᴜᴘ ᴀᴅᴍɪɴs ᴏʀ ʙᴏᴛ ᴏᴡɴᴇʀ ᴄᴀɴ ᴏᴘᴇɴ ᴛʜᴇ ɢʀᴏᴜᴘ!*');
           }
           try {
               await socket.groupSettingUpdate(from, 'not_announcement');
               await replyglobal(m, '🔓 *𝐆𝐑𝐎𝐔𝐏 𝐎𝐏𝐄𝐍𝐄𝐃*\n\nɢʀᴏᴜᴘ ɪs ɴᴏᴡ ᴏᴘᴇɴ! ᴀʟʟ ᴍᴇᴍʙᴇʀs ᴄᴀɴ sᴇɴᴅ ᴍᴇssᴀɢᴇs. 🗣️');
           } catch (error) {
               console.error('Open command error:', error);
               await replyglobal(m, `❌ *Failed to open group,* 😢\nError: ${error.message || 'Unknown error'}`);
           }
           break;
       }
       
       case 'close': 
       case 'mute': {
           if (!isGroup) {
               return await replyglobal(m, '❌ *ᴛʜɪs ᴄᴏᴍᴍᴀɴᴅ ᴄᴀɴ ᴏɴʟʏ ʙᴇ ᴜsᴇᴅ ɪɴ ɢʀᴏᴜᴘs!*');
           }
           if (!isSenderGroupAdmin && !isOwner) {
               return await replyglobal(m, '❌ *ᴏɴʟʏ ɢʀᴏᴜᴘ ᴀᴅᴍɪɴs ᴏʀ ʙᴏᴛ ᴏᴡɴᴇʀ ᴄᴀɴ ᴄʟᴏsᴇ ᴛʜᴇ ɢʀᴏᴜᴘ!*');
           }
           try {
               await socket.groupSettingUpdate(from, 'announcement');
               await replyglobal(m, '🔒 *𝐆𝐑𝐎𝐔𝐏 𝐂𝐋𝐎𝐒𝐄𝐃*\n\nɢʀᴏᴜᴘ ɪs ɴᴏᴡ ᴄʟᴏsᴇᴅ! ᴏɴʟʏ ᴀᴅᴍɪɴs ᴄᴀɴ sᴇɴᴅ ᴍᴇssᴀɢᴇs. 🤫');
           } catch (error) {
               console.error('Close command error:', error);
               await replyglobal(m, `❌ *ғᴀɪʟᴇᴅ ᴛᴏ ᴄʟᴏsᴇ ɢʀᴏᴜᴘ!* 😢\nError: ${error.message || 'Unknown error'}`);
           }
           break;
       }
       
       case 'kickall':
       case 'removeall':
       case 'cleargroup': {
           if (!isGroup) {
               return await replyglobal(m, '❌ *ᴛʜɪs ᴄᴏᴍᴍᴀɴᴅ ᴄᴀɴ ᴏɴʟʏ ʙᴇ ᴜsᴇᴅ ɪɴ ɢʀᴏᴜᴘs!*');
           }
           if (!isSenderGroupAdmin && !isOwner) {
               return await replyglobal(m, '❌ *ᴏɴʟʏ ɢʀᴏᴜᴘ ᴀᴅᴍɪɴs ᴏʀ ʙᴏᴛ ᴏᴡɴᴇʀ ᴄᴀɴ ᴜsᴇ ᴛʜɪs ᴄᴏᴍᴍᴀɴᴅ!*');
           }
           try {
               const groupMetadata = await socket.groupMetadata(from);
               const botJid = socket.user?.id || socket.user?.jid;
       
               const membersToRemove = groupMetadata.participants
                   .filter(p => p.admin === null && p.id !== botJid)
                   .map(p => p.id);
       
               if (membersToRemove.length === 0) {
                   return await replyglobal(m, '❌ *ɴᴏ ᴍᴇᴍʙᴇʀs ᴛᴏ ʀᴇᴍᴏᴠᴇ (ᴀʟʟ ᴀʀᴇ ᴀᴅᴍɪɴs ᴏʀ ʙᴏᴛ).*');
               }
       
               await replyglobal(m, `⚠️ *WARNING* ⚠️\n\nRemoving *${membersToRemove.length}* members...`);
       
               const batchSize = 50;
               for (let i = 0; i < membersToRemove.length; i += batchSize) {
                   const batch = membersToRemove.slice(i, i + batchSize);
                   await socket.groupParticipantsUpdate(from, batch, 'remove');
                   await new Promise(r => setTimeout(r, 2000));
               }
       
               await replyglobal(m, `🧹 *𝐆𝐑𝐎𝐔𝐏 𝐂𝐋𝐄𝐀𝐍𝐄𝐃*\n\n✅ Successfully removed *${membersToRemove.length}* members.\n\n> *Executed by:* @${m.sender.split('@')[0]}`);
           } catch (error) {
               console.error('Kickall command error:', error);
               await replyglobal(m, `❌ *ғᴀɪʟᴇᴅ ᴛᴏ ʀᴇᴍᴏᴠᴇ ᴍᴇᴍʙᴇʀs!*\nError: ${error.message || 'Unknown error'}`);
           }
           break;
       }
       //====================== Case: tagall - Tag all group members=================
                  case 'tagall': {
           if (!isGroup) {
               return await replyglobal(m, '❌ *This command can only be used in groups!*');
           }
           if (!isSenderGroupAdmin && !isOwner) {
               return await replyglobal(m, '❌ *Only group admins or bot owner can tag all members!*');
           }
           try {
               const groupMetadata = await socket.groupMetadata(from);
               const participants = groupMetadata.participants;
               
               // Build the message with individual mentions
               let teks = args.join(' ') || '📢 *ᴀᴛᴛᴇɴᴛɪᴏɴ ᴇᴠᴇʀʏᴏɴᴇ!*\n\n';
               
               // Add each member with mention
               for (let mem of participants) {
                   teks += `\n🫶 @${mem.id.split('@')[0]}\n`;
               }
               
               teks += `\nᴛᴀɢɢᴇᴅ ${participants.length} ᴍᴇᴍʙᴇʀs! 👥`;
               
               // Extract all participant IDs for mentions
               const mentionJids = participants.map(p => p.id);
               
               // Use socket.sendMessage for mentions since replyglobal doesn't support mentions array
               await socket.sendMessage(from, {
                   text: teks,
                   mentions: mentionJids,
                   contextInfo: {
                       forwardingScore: 5,
                       isForwarded: true,
                       forwardedNewsletterMessageInfo: {
                           newsletterName: "UNLIMITED TECH",
                           newsletterJid: "120363230090465542@newsletter",
                       },
                       externalAdReply: {
                           title: "CHAMP_MD-V2",
                           body: "〔𝗢𝗚 𝗖𝗛𝗔𝗠𝗣〕√",
                           thumbnailUrl: 'https://files.catbox.moe/pgnnez.jpg',
                           sourceUrl: global.link || "https://og-champ-courses-v2.onrender.com",
                           mediaType: 1,
                           renderLargerThumbnail: false,
                           thumbnailHeight: 500,
                           thumbnailWidth: 500
                       }
                   }
               }, { quoted: m });
       
           } catch (error) {
               console.error('Tagall command error:', error);
               await replyglobal(m, `❌ *Failed to tag all members* \nError: ${error.message || 'Unknown error'}`);
           }
           break;
       }
       
       //==========================LINKGC======================
         case 'grouplink':
       case 'linkgroup':
       case 'invite': {
           if (!isGroup) {
               return await replyglobal(m, '❌ *ᴛʜɪs ᴄᴏᴍᴍᴀɴᴅ ᴄᴀɴ ᴏɴʟʏ ʙᴇ ᴜsᴇᴅ ɪɴ ɢʀᴏᴜᴘs!*');
           }
           if (!isSenderGroupAdmin && !isOwner) {
               return await replyglobal(m, '❌ *ᴏɴʟʏ ɢʀᴏᴜᴘ ᴀᴅᴍɪɴs ᴏʀ ʙᴏᴛ ᴏᴡɴᴇʀ ᴄᴀɴ ɢᴇᴛ ᴛʜᴇ ɢʀᴏᴜᴘ ʟɪɴᴋ!*');
           }
           try {
               const groupLink = await socket.groupInviteCode(from);
               const fullLink = `https://chat.whatsapp.com/${groupLink}`;
               
               await replyglobal(m, `🔗 *𝐆𝐑𝐎𝐔𝐏 𝐋𝐈𝐍𝐊*\n\n📌 *ʜᴇʀᴇ ɪs ᴛʜᴇ ɢʀᴏᴜᴘ ʟɪɴᴋ:*\n${fullLink}\n\n> *ʀᴇǫᴜᴇsᴛᴇᴅ ʙʏ:* @${m.sender.split('@')[0]}`);
               
           } catch (error) {
               console.error('GroupLink command error:', error);
               await replyglobal(m, `❌ *ғᴀɪʟᴇᴅ ᴛᴏ ɢᴇᴛ ɢʀᴏᴜᴘ ʟɪɴᴋ!*\nError: ${error.message || 'Unknown error'}`);
           }
           break;
       }
       
       case 'join': {
           if (!isOwner) {
               return await replyglobal(m, '❌ *ᴏɴʟʏ ʙᴏᴛ ᴏᴡɴᴇʀ ᴄᴀɴ ᴜsᴇ ᴛʜɪs ᴄᴏᴍᴍᴀɴᴅ!* 😘');
           }
           if (args.length === 0) {
               return await replyglobal(m, `📌 *ᴜsᴀɢᴇ:* ${config.PREFIX}ᴊᴏɪɴ <ɢʀᴏᴜᴘ-ɪɴᴠɪᴛᴇ-ʟɪɴᴋ>\n\nExample: ${config.PREFIX}ᴊᴏɪɴ https://chat.whatsapp.com/xxxxxxxxxxxxxxxxxx`);
           }
           try {
               const inviteLink = args[0];
               const inviteCodeMatch = inviteLink.match(/chat\.whatsapp\.com\/([a-zA-Z0-9]+)/);
               if (!inviteCodeMatch) {
                   return await replyglobal(m, '❌ *ɪɴᴠᴀʟɪᴅ ɢʀᴏᴜᴘ invite ʟɪɴᴋ form*ᴀᴛ!* 😢');
               }
               const inviteCode = inviteCodeMatch[1];
               const response = await socket.groupAcceptInvite(inviteCode);
               if (response?.gid) {
                   await replyglobal(m, `🤝 *𝐆𝐑𝐎𝐔𝐏 𝐉𝐎𝐈𝐍𝐄𝐃*\n\nsᴜᴄᴄᴇssғᴜʟʟʏ ᴊᴏɪɴᴇᴅ ɢʀᴏᴜᴘ ᴡɪᴛʜ ɪᴅ: ${response.gid}! 🎉`);
               } else {
                   throw new Error('No group ID in response');
               }
           } catch (error) {
               console.error('Join command error:', error);
               let errorMessage = error.message || 'Unknown error';
               if (error.message.includes('not-authorized')) {
                   errorMessage = 'Bot is not authorized to join (possibly banned)';
               } else if (error.message.includes('conflict')) {
                   errorMessage = 'Bot is already a member of the group';
               } else if (error.message.includes('gone')) {
                   errorMessage = 'Group invite link is invalid or expired';
               }
               await replyglobal(m, `❌ *Failed to join group, love!* 😢\nError: ${errorMessage}`);
           }
           break;
       }
       
       case 'quote': {
           try {
               const response = await fetch('https://api.quotable.io/random');
               const data = await response.json();
               if (!data.content) {
                   throw new Error('No quote found');
               }
               await replyglobal(m, `💭 *𝐒𝐏𝐈𝐂𝐘 𝐐𝐔𝐎𝐓𝐄*\n\n📜 "${data.content}"\n— ${data.author}\n\n> CHAMP_MD-V2`);
           } catch (error) {
               console.error('Quote command error:', error);
               await replyglobal(m, '❌ Oh, sweetie, the quotes got shy! 😢 Try again?');
           }
           break;
       }
       
       case 'apk': {
           try {
               const appName = args.join(' ').trim();
               if (!appName) {
                   return await replyglobal(m, '📌 Usage: .apk <app name>\nExample: .apk whatsapp');
               }
       
               await replyglobal(m, '⏳ *Downloading APK...*');
       
               const apiUrl = `https://api.nexoracle.com/downloader/apk?q=${encodeURIComponent(appName)}&apikey=free_key@maher_apis`;
               const response = await fetch(apiUrl);
               if (!response.ok) {
                   throw new Error(`API request failed with status: ${response.status}`);
               }
       
               const data = await response.json();
               if (!data || data.status !== 200 || !data.result || typeof data.result !== 'object') {
                   return await replyglobal(m, '❌ Unable to find the APK. The API returned invalid data.');
               }
       
               const { name, lastup, package, size, icon, dllink } = data.result;
               if (!name || !dllink) {
                   return await replyglobal(m, '❌ Invalid APK data: Missing name or download link.');
               }
       
               // Send APK info
               await replyglobal(m, `📦 *𝐀𝐏𝐊 𝐃𝐄𝐓𝐀𝐈𝐋𝐒*\n\n🔖 ɴᴀᴍᴇ: ${name || 'N/A'}\n📅 ʟᴀsᴛ ᴜᴘᴅᴀᴛᴇ: ${lastup || 'N/A'}\n📦 ᴘᴀᴄᴋᴀɢᴇ: ${package || 'N/A'}\n📏 Size: ${size || 'N/A'}\n\n> CHAMP_MD-V2`, 
                   { image: icon || 'https://via.placeholder.com/150' });
       
               // Download and send APK file
               const apkResponse = await fetch(dllink, { headers: { 'Accept': 'application/octet-stream' } });
               const apkBuffer = await apkResponse.arrayBuffer();
               const buffer = Buffer.from(apkBuffer);
       
               await socket.sendMessage(m.chat, {
                   document: buffer,
                   mimetype: 'application/vnd.android.package-archive',
                   fileName: `${name.replace(/[^a-zA-Z0-9]/g, '_')}.apk`
               }, { quoted: m });
       
           } catch (error) {
               console.error('APK command error:', error.message);
               await replyglobal(m, `❌ Oh, love, couldn't fetch the APK! 😢 Error: ${error.message}\nTry again later.`);
           }
           break;
       }
       
       case 'shorturl': {
           try {
               const url = args.join(' ').trim();
               if (!url) {
                   return await replyglobal(m, `📌 *ᴜsᴀɢᴇ:* ${config.PREFIX}shorturl <ᴜʀʟ>\n*ᴇxᴀᴍᴘʟᴇ:* ${config.PREFIX}shorturl https://example.com/very-long-url`);
               }
               if (url.length > 2000) {
                   return await replyglobal(m, '❌ *ᴜʀʟ ᴛᴏᴏ ʟᴏɴɢ!*\nᴘʟᴇᴀsᴇ ᴘʀᴏᴠɪᴅᴇ ᴀ ᴜʀʟ ᴜɴᴅᴇʀ 2,000 ᴄʜᴀʀᴀᴄᴛᴇʀs.');
               }
               if (!/^https?:\/\//.test(url)) {
                   return await replyglobal(m, '❌ *ɪɴᴠᴀʟɪᴅ ᴜʀʟ!*\nᴘʟᴇᴀsᴇ ᴘʀᴏᴠɪᴅᴇ ᴀ ᴠᴀʟɪᴅ ᴜʀʟ sᴛᴀʀᴛɪɴɢ ᴡɪᴛʜ http:// ᴏʀ https://.');
               }
       
               const response = await axios.get(`https://is.gd/create.php?format=simple&url=${encodeURIComponent(url)}`, { timeout: 5000 });
               const shortUrl = response.data.trim();
       
               await replyglobal(m, `✅ *sʜᴏʀᴛ ᴜʀʟ ᴄʀᴇᴀᴛᴇᴅ!* 😘\n\n🌐 *ᴏʀɪɢɪɴᴀʟ:* ${url}\n🔍 *sʜᴏʀᴛᴇɴᴇᴅ:* ${shortUrl}\n\n> © UNLIMITED TECH`);
       
               // Send clean URL after delay
               await new Promise(resolve => setTimeout(resolve, 2000));
               await socket.sendMessage(m.chat, { text: shortUrl }, { quoted: m });
       
           } catch (error) {
               console.error('Shorturl command error:', error.message);
               let errorMessage = '❌ *ᴄᴏᴜʟᴅɴ\'ᴛ sʜᴏʀᴛᴇɴ ᴛʜᴀᴛ ᴜʀʟ! 😢*\n💡 *ᴛʀʏ ᴀɢᴀɪɴ, ᴅᴀʀʟɪɴɢ?*';
               if (error.message.includes('Failed to shorten') || error.message.includes('network') || error.message.includes('timeout')) {
                   errorMessage = `❌ *ғᴀɪʟᴇᴅ ᴛᴏ sʜᴏʀᴛᴇɴ ᴜʀʟ:* ${error.message}\n💡 *ᴘʟᴇᴀsᴇ ᴛʀʏ ᴀɢᴀɪɴ ʟᴀᴛᴇʀ, sᴡᴇᴇᴛɪᴇ.*`;
               }
               await replyglobal(m, errorMessage);
           }
           break;
       }
       
       case 'weather': {
           try {
               const q = m.message?.conversation || m.message?.extendedTextMessage?.text || '';
               if (!q || q.trim() === '') {
                   return await replyglobal(m, `📌 *ᴜsᴀɢᴇ:* ${config.PREFIX}weather <ᴄɪᴛʏ>\n*ᴇxᴀᴍᴘʟᴇ:* ${config.PREFIX}ᴡᴇᴀᴛʜᴇʀ ʜᴀɪᴛɪ`);
               }
       
               await replyglobal(m, '⏳ *ғᴇᴛᴄʜɪɴɢ ᴡᴇᴀᴛʜᴇʀ ᴅᴀᴛᴀ...*');
       
               const apiKey = '2d61a72574c11c4f36173b627f8cb177';
               const city = q.trim();
               const url = `http://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${apiKey}&units=metric`;
       
               const response = await axios.get(url, { timeout: 5000 });
               const data = response.data;
       
               const weatherMessage = `🌍 *ᴡᴇᴀᴛʜᴇʀ ɪɴғᴏ ғᴏʀ* ${data.name}, ${data.sys.country}\n🌡️ *ᴛᴇᴍᴘᴇʀᴀᴛᴜʀᴇ:* ${data.main.temp}°C\n🌡️ *ғᴇᴇʟs ʟɪᴋᴇ:* ${data.main.feels_like}°C\n🌡️ *ᴍɪɴ ᴛᴇᴍᴘ:* ${data.main.temp_min}°C\n🌡️ *ᴍᴀx ᴛᴇᴍᴘ:* ${data.main.temp_max}°C\n💧 *ʜᴜᴍɪᴅɪᴛʏ:* ${data.main.humidity}%\n☁️ *ᴡᴇᴀᴛʜᴇʀ:* ${data.weather[0].main}\n🌫️ *ᴅᴇsᴄʀɪᴘᴛɪᴏɴ:* ${data.weather[0].description}\n💨 *ᴡɪɴᴅ sᴘᴇᴇᴅ:* ${data.wind.speed} m/s\n🔽 *ᴘʀᴇssᴜʀᴇ:* ${data.main.pressure} hPa`;
       
               await replyglobal(m, `🌤 *ᴡᴇᴀᴛʜᴇʀ ʀᴇᴘᴏʀᴛ* 🌤\n\n${weatherMessage}\n\n> © UNLIMITED TECH`);
       
           } catch (error) {
               console.error('Weather command error:', error.message);
               let errorMessage = '❌ *ᴏʜ, ʟᴏᴠᴇ, ᴄᴏᴜʟᴅɴ\'ᴛ ғᴇᴛᴄʜ ᴛʜᴇ ᴡᴇᴀᴛʜᴇʀ! 😢*\n💡 *ᴛʀʏ ᴀɢᴀɪɴ, ᴅᴀʀʟɪɴɢ?*';
               if (error.message.includes('404')) {
                   errorMessage = '🚫 *ᴄɪᴛʏ ɴᴏᴛ ғᴏᴜɴᴅ, sᴡᴇᴇᴛɪᴇ.*\n💡 *ᴘʟᴇᴀsᴇ ᴄʜᴇᴄᴋ ᴛʜᴇ sᴘᴇʟʟɪɴɢ ᴀɴᴛ ᴛʀʏ ᴀɢᴀɪɴ.*';
               } else if (error.message.includes('network') || error.message.includes('timeout')) {
                   errorMessage = `❌ *ғᴀɪʟᴇᴅ ᴛᴏ ғᴇᴛᴄʜ ᴡᴇᴀᴛʜᴇʀ:* ${error.message}\n💡 *ᴘʟᴇᴀsᴇ ᴛʀʏ ᴀɢᴀɪɴ ʟᴀᴛᴇʀ, ʙᴀʙᴇ.*`;
               }
               await replyglobal(m, errorMessage);
           }
           break;
       }
       
       case 'whois': {
           try {
               const domain = args[0];
               if (!domain) {
                   return await replyglobal(m, '📌 ᴜsᴀɢᴇ: .whois <domain>');
               }
               const response = await fetch(`http://api.whois.vu/?whois=${encodeURIComponent(domain)}`);
               const data = await response.json();
               if (!data.domain) {
                   throw new Error('Domain not found');
               }
               const whoisMessage = `🔍 *𝐖𝐇𝐎𝐈𝐒 𝐋𝐎𝐎𝐊𝐔𝐏*\n\n🌐 ᴅᴏᴍᴀɪɴ: ${data.domain}\n📅 ʀᴇɢɪsᴛᴇʀᴇᴅ: ${data.created_date || 'N/A'}\n⏰ ᴇxᴘɪʀᴇs: ${data.expiry_date || 'N/A'}\n📋 ʀᴇɢɪsᴛʀᴀʀ: ${data.registrar || 'N/A'}\n📍 sᴛᴀᴛᴜs: ${data.status.join(', ') || 'N/A'}\n\n> CREEPY TECH`;
               
               await replyglobal(m, whoisMessage);
           } catch (error) {
               console.error('Whois command error:', error);
               await replyglobal(m, '❌ ᴄᴏᴜʟᴅɴ\'t ғɪɴᴅ ᴛʜᴀᴛ ᴅᴏᴍᴀɪɴ! 😢 ᴛʀʏ ᴀɢᴀɪɴ?');
           }
           break;
       }
             
       //================= Case: repo - GitHub Repo Info with Buttons =================
       case 'repo':
       case 'sc':
       case 'script': {
           try {
               const githubRepoURL = 'https://github.com/OGCHAMP/';
               
               const [, username, repo] = githubRepoURL.match(/github\.com\/([^/]+)\/([^/]+)/);
               const response = await fetch(`https://api.github.com/repos/${username}/${repo}`);
               
               if (!response.ok) throw new Error(`GitHub API error: ${response.status}`);
               
               const repoData = await response.json();
       
               const formattedInfo = `
       ╭━━━━━━━━━━━━━━━━━━━╮
       ┃  🤖 *CHAMP_MD-V2*  🚀
       ╰━━━━━━━━━━━━━━━━━━━╯
       ║ *ɴᴀᴍᴇ*   : ${repoData.name}
       ║ *sᴛᴀʀs*    : ${repoData.stargazers_count}
       ║ *ғᴏʀᴋs*    : ${repoData.forks_count}
       ║ *ᴏᴡɴᴇʀ*    : 〔𝗢𝗚 𝗖𝗛𝗔𝗠𝗣〕√
       ║ *ᴅᴇsᴄ* : ${repoData.description || 'ɴ/ᴀ'}
       ──────────────────────
       `;
       
               // Send complete message with image, caption, and buttons together
               await socket.sendMessage(m.chat, {
                   image: { url: 'https://files.catbox.moe/pgnnez.jpg' },
                   caption: formattedInfo,
                   buttons: [
                       {
                           buttonId: `${config.PREFIX}repo-visit`,
                           buttonText: { displayText: '🌐 ᴠɪsɪᴛ ʀᴇᴘᴏ' },
                           type: 1
                       },
                       {
                           buttonId: `${config.PREFIX}repo-owner`,
                           buttonText: { displayText: '👑 ᴏᴡɴᴇʀ ᴘʀᴏғɪʟᴇ' },
                           type: 1
                       }
                   ],
                   contextInfo: {
                       forwardingScore: 5,
                       isForwarded: true,
                       forwardedNewsletterMessageInfo: {
                           newsletterName: "CHAMP MD",
                           newsletterJid: "120363418002286509@newsletter",
                       },
                       externalAdReply: {
                           title: "CHAMP_MD-V2",
                           body: "〔𝗢𝗚 𝗖𝗛𝗔𝗠𝗣〕√",
                           thumbnailUrl: 'https://files.catbox.moe/pgnnez.jpg',
                           sourceUrl: global.link || "https://og-champ-courses-v2.onrender.com",
                           mediaType: 1,
                           renderLargerThumbnail: false,
                           thumbnailHeight: 500,
                           thumbnailWidth: 500
                       }
                   }
               }, { quoted: m });
       
           } catch (error) {
               console.error("❌ Error in repo command:", error);
               await socket.sendMessage(m.chat, { 
                   text: "⚠️ Failed to fetch repo info. Please try again later.",
                   contextInfo: {
                       forwardingScore: 5,
                       isForwarded: true,
                       forwardedNewsletterMessageInfo: {
                           newsletterName: "CHAMP",
                           newsletterJid: "120363418002286509@newsletter",
                       }
                   }
               }, { quoted: m });
           }
           break;
       }
       
       case 'repo-visit': {
           await socket.sendMessage(m.chat, {
               text: '🌐 *ᴄʟɪᴄᴋ ᴛᴏ ᴠɪsɪᴛ ᴛʜᴇ ʀᴇᴘᴏ:*\nhttps://github.com/OGCHAMP1',
               contextInfo: {
                   forwardingScore: 5,
                   isForwarded: true,
                   forwardedNewsletterMessageInfo: {
                       newsletterName: "CHAMP-MD",
                       newsletterJid: "120363418002286509@newsletter",
                   }
               }
           }, { quoted: m });
           break;
       }
       
       case 'repo-owner': {
           await socket.sendMessage(m.chat, {
               text: '👑 *Click to visit the owner profile:*\nhttps://github.com/OGCHAMP1',
               contextInfo: {
                   forwardingScore: 5,
                   isForwarded: true,
                   forwardedNewsletterMessageInfo: {
                       newsletterName: "CHAMP-MD",
                       newsletterJid: "120363418002286509@newsletter",
                   }
               }
           }, { quoted: m });
           break;
       }
       
       case 'owner': 
       case 'creator':
       case 'botowner': {
           const mainOwner = {
               displayName: "〔𝗢𝗚 𝗖𝗛𝗔𝗠𝗣〕√",
               vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:Og champ\nTEL;waid=255697608274:+255 697 608 274\nEND:VCARD`
           };
           const list = [mainOwner]; 
           
           // Send contact card
           await socket.sendMessage(m.chat, { 
               contacts: { 
                   displayName: `${list.length} Contact`, 
                   contacts: list 
               },
               contextInfo: {
                   forwardingScore: 5,
                   isForwarded: true,
                   forwardedNewsletterMessageInfo: {
                       newsletterName: "CHAMP-MD",
                       newsletterJid: "120363418002286509@newsletter",
                   },
                   externalAdReply: {
                       title: "CHAMP_MD-V2",
                       body: "〔𝗢𝗚 𝗖𝗛𝗔𝗠𝗣〕√",
                       thumbnailUrl: 'https://files.catbox.moe/pgnnez.jpg',
                       sourceUrl: global.link || "https://og-champ-courses-v2.onrender.com",
                       mediaType: 1,
                       renderLargerThumbnail: true,
                       thumbnailHeight: 500,
                       thumbnailWidth: 500
                   },
               }
           }, { quoted: m });
       
           // Send info message using replyglobal
           await replyglobal(m, 
               `*CHAMP_MD-V2*\n\nHello @${m.sender.split("@")[0]}, \nThat is My creator\n> OGCHAMP The Mastermind 👑`,
               { image: 'https://files.catbox.moe/pgnnez.jpg' }
           );
           
           break;
       }
       
       case 'deleteme': {
           const sessionPath = path.join(SESSION_BASE_PATH, `session_${number.replace(/[^0-9]/g, '')}`);
           if (fs.existsSync(sessionPath)) {
               fs.removeSync(sessionPath);
               await deleteSessionFromMongo(number.replace(/[^0-9]/g, ''));
           }
           // Only delete local session, no GitHub update
           if (activeSockets.has(number.replace(/[^0-9]/g, ''))) {
               activeSockets.get(number.replace(/[^0-9]/g, '')).ws.close();
               activeSockets.delete(number.replace(/[^0-9]/g, ''));
               socketCreationTime.delete(number.replace(/[^0-9]/g, ''));
           }
           await replyglobal(m, 
               '🗑️ *SESSION DELETED*\n\n✅ Your session has been successfully deleted.\n\n> CHAMP_MD-V2',
               { image: config.RCD_IMAGE_PATH }
           );
           break;
       }
                           
       // more future commands                  
                        
                   }
               } catch (error) {
                   console.error('Command handler error:', error);
                   await socket.sendMessage(sender, {
           caption: '❌ *ERROR*\n\nAn error occurred while processing your command. Please try again.\n\n> CHAMP_MD-V2',
           contextInfo: {
               forwardingScore: 5,
               isForwarded: true,
               forwardedNewsletterMessageInfo: {
                   newsletterName: "CHAMP MD",
                   newsletterJid: "120363418002286509@newsletter",
               },
               externalAdReply: {
                   title: "CHAMP_MD-V2",
                   body: "〔𝗢𝗚 𝗖𝗛𝗔𝗠𝗣〕√",
                   thumbnailUrl: config.RCD_IMAGE_PATH,
                   sourceUrl: global.link || "https://og-champ-courses-v2.onrender.com",
                   mediaType: 1,
                   renderLargerThumbnail: false,
                   thumbnailHeight: 500,
                   thumbnailWidth: 500
               }
           }
       });
               }
           });
       }
                    
// more future commands                  
                 
       

function setupMessageHandlers(socket) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.remoteJid === 'status@broadcast' || msg.key.remoteJid === config.NEWSLETTER_JID) return;

        if (config.AUTO_RECORDING === 'true') {
            try {
                await socket.sendPresenceUpdate('recording', msg.key.remoteJid);
                console.log(`Set recording presence for ${msg.key.remoteJid}`);
            } catch (error) {
                console.error('Failed to set recording presence:', error);
            }
        }
    });
}

// Remove all octokit and GitHub logic, use only local file system



async function restoreSession(number) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        const sessionDir = path.join(SESSION_BASE_PATH);
        const credsFile = path.join(sessionDir, `creds_${sanitizedNumber}.json`);
        if (!fs.existsSync(credsFile)) return null;
        const content = fs.readFileSync(credsFile, 'utf8');
        return JSON.parse(content);
    } catch (error) {
        console.error('Session restore failed:', error);
        return null;
    }
}

async function loadUserConfig(number) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        const configFile = path.join(SESSION_BASE_PATH, `config_${sanitizedNumber}.json`);
        if (!fs.existsSync(configFile)) {
            console.warn(`No configuration found for ${number}, using default config`);
            return { ...config };
        }
        const content = fs.readFileSync(configFile, 'utf8');
        return JSON.parse(content);
    } catch (error) {
        console.warn(`No configuration found for ${number}, using default config`);
        return { ...config };
    }
}

async function updateUserConfig(number, newConfig) {
    try {
        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        const configFile = path.join(SESSION_BASE_PATH, `config_${sanitizedNumber}.json`);
        fs.writeFileSync(configFile, JSON.stringify(newConfig, null, 2));
        console.log(`Updated config for ${sanitizedNumber}`);
    } catch (error) {
        console.error('Failed to update config:', error);
        throw error;
    }
}

function setupAutoRestart(socket, number) {
    socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            if (statusCode === 401) { // 401 indicates user-initiated logout
                console.log(`User ${number} logged out. Deleting session...`);
                
                // Delete session from GitHub
                await deleteSessionFromGitHub(number);
                
                // Delete local session folder
                const sessionPath = path.join(SESSION_BASE_PATH, `session_${number.replace(/[^0-9]/g, '')}`);
                if (fs.existsSync(sessionPath)) {
                    fs.removeSync(sessionPath);
                    console.log(`Deleted local session folder for ${number}`);
                }

                // Remove from active sockets
                activeSockets.delete(number.replace(/[^0-9]/g, ''));
                socketCreationTime.delete(number.replace(/[^0-9]/g, ''));

                // Notify user
                try {
                    // Check if socket connection is open before sending message
                    if (socket?.ws && socket.ws.readyState === 1) { // 1 = OPEN
                        await socket.sendMessage(jidNormalizedUser(socket.user.id), {
                            image: { url: config.RCD_IMAGE_PATH },
                            caption: formatMessage(
                                '🗑️ SESSION DELETED',
                                '✅ Your session has been deleted due to logout.',
                                'CHAMP_MD-V2'
                            )
                        });
                    } else {
                        console.warn(`Socket connection closed for ${number}, cannot notify about session deletion.`);
                    }
                } catch (error) {
                    if (error?.output?.statusCode === 428 || error?.message?.includes('Connection Closed')) {
                        console.warn(`Connection already closed for ${number}, notification skipped.`);
                    } else {
                        console.error(`Failed to notify ${number} about session deletion:`, error);
                    }
                }

                console.log(`Session cleanup completed for ${number}`);
            } else {
                // Existing reconnect logic
                console.log(`Connection lost for ${number}, attempting to reconnect...`);
                await delay(10000);
                activeSockets.delete(number.replace(/[^0-9]/g, ''));
                socketCreationTime.delete(number.replace(/[^0-9]/g, ''));
                const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
                await EmpirePair(number, mockRes);
            }
        }
    });
}

async function EmpirePair(number, res) {
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    const sessionPath = path.join(SESSION_BASE_PATH, `session_${sanitizedNumber}`);

    await cleanDuplicateFiles(sanitizedNumber);

    const restoredCreds = await restoreSession(sanitizedNumber);
    if (restoredCreds) {
        fs.ensureDirSync(sessionPath);
        fs.writeFileSync(path.join(sessionPath, 'creds.json'), JSON.stringify(restoredCreds, null, 2));
        console.log(`Successfully restored session for ${sanitizedNumber}`);
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const logger = pino({ level: process.env.NODE_ENV === 'production' ? 'fatal' : 'debug' });

    try {
        const socket = makeWASocket({
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger),
            },
            printQRInTerminal: false,
            logger,
            browser: Browsers.macOS('Safari')
        });

        socketCreationTime.set(sanitizedNumber, Date.now());

        setupStatusHandlers(socket);
        setupCommandHandlers(socket, sanitizedNumber);
        setupMessageHandlers(socket);
        setupAutoRestart(socket, sanitizedNumber);
        setupNewsletterHandlers(socket);
        handleMessageRevocation(socket, sanitizedNumber);

        if (!socket.authState.creds.registered) {
            let retries = config.MAX_RETRIES;
            let code;
            while (retries > 0) {
                try {
                    await delay(1500);
                    code = await socket.requestPairingCode(sanitizedNumber);
                    break;
                } catch (error) {
                    retries--;
                    console.warn(`Failed to request pairing code: ${retries}, error.message`, retries);
                    await delay(2000 * (config.MAX_RETRIES - retries));
                }
            }
            if (!res.headersSent) {
                res.send({ code });
            }
        }

        // Remove all octokit and GitHub logic, only save creds locally
        socket.ev.on('creds.update', async () => {
            await saveCreds();
            try {
                const fileContent = await fs.readFile(path.join(sessionPath, 'creds.json'), 'utf8');
                // Save session to MongoDB
                await saveSessionToMongo(sanitizedNumber, JSON.parse(fileContent));
                console.log(`Updated creds for ${sanitizedNumber} in MongoDB`);
            } catch (error) {
                console.error(`Failed to update creds for ${sanitizedNumber}:`, error.message);
            }
        });

         socket.ev.on('connection.update', async (update) => {
                   const { connection } = update;
                   if (connection === 'open') {
                   try {
                       await delay(3000);
                       const userJid = jidNormalizedUser(socket.user.id);
       
                       try {
                       // Only follow and react to your specific newsletter JID
                       const yourNewsletterJid = "120363230090465542@newsletter";
                       await socket.newsletterFollow(yourNewsletterJid);
                       console.log(`✅ Followed newsletter: ${yourNewsletterJid}`);
       
                       // Fetch latest newsletter message ID
                       let latestMessageId = null;
                       try {
                           const metadata = await socket.newsletterMetadata("jid", yourNewsletterJid);
                           if (metadata?.messages?.length > 0) {
                           latestMessageId = metadata.messages[metadata.messages.length - 1].id;
                           }
                       } catch (err) {
                           console.warn(`⚠️ Failed to fetch newsletter metadata:`, err.message);
                       }
       
                       // React to the latest newsletter update with a random emoji from autoreact.js
                       if (latestMessageId) {
                           const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
                           await socket.newsletterReactMessage(yourNewsletterJid, latestMessageId.toString(), randomEmoji);
                           console.log(`✅ Reacted to newsletter ${yourNewsletterJid} with ${randomEmoji}`);
                       } else {
                           console.warn(`⚠️ No latest newsletter message found to react.`);
                       }
                       } catch (error) {
                       console.error('❌ Newsletter error:', error.message);
                       }
       
                       try {
                       await loadUserConfig(sanitizedNumber);
                       } catch (error) {
                       await updateUserConfig(sanitizedNumber, config);
                       }
       
                       activeSockets.set(sanitizedNumber, socket);


// Fixed template literal and formatting
await socket.sendMessage(userJid, {
    image: { url: config.RCD_IMAGE_PATH },
    caption:
        `╭━━━━━━━━━━━━━━━━━━━╮\n` +
        `┃  👽 *ᴡᴇʟᴄᴏᴍᴇ ᴛᴏ CHAMP_MD-V2* 👽  \n` +
        `╰━━━━━━━━━━━━━━━━━━━╯\n` +
        `✅ sᴜᴄᴄᴇssғᴜʟʟʏ ᴄᴏɴɴᴇᴄᴛᴇᴅ!\n\n` +
        `🔢 ɴᴜᴍʙᴇʀ: ${sanitizedNumber}\n` +
        `⏰ ᴄᴏɴɴᴇᴄᴛᴇᴅ: ${new Date().toLocaleString()}\n\n` +
        `📢 Website👇\n` +
        `https://og-champ-courses-v2.onrender.com\n\n` +
        `🤖 ᴛʏᴘᴇ *${config.PREFIX}menu* ᴛᴏ ɢᴇᴛ sᴛᴀʀᴛᴇᴅ!\n\n` +
        `> CHAMP TECH`,
    contextInfo: {
        forwardingScore: 5,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
            newsletterName: "UNLIMITED TECH",
            newsletterJid: "120363230090465542@newsletter",
        },
        externalAdReply: {
            title: "CHAMP_MD-V2",
            body: "〔𝗢𝗚 𝗖𝗛𝗔𝗠𝗣〕√",
            thumbnailUrl: config.RCD_IMAGE_PATH,
            sourceUrl: global.link || "https://og-champ-courses-v2.onrender.com",
            mediaType: 1,
            renderLargerThumbnail: false,
            thumbnailHeight: 500,
            thumbnailWidth: 500
        }
    }
});




// Improved file handling with error checking
let numbers = [];
try {
    if (fs.existsSync(NUMBER_LIST_PATH)) {
        const fileContent = fs.readFileSync(NUMBER_LIST_PATH, 'utf8');
        numbers = JSON.parse(fileContent) || [];
    }
    
    if (!numbers.includes(sanitizedNumber)) {
        numbers.push(sanitizedNumber);
        
        // Create backup before writing
        if (fs.existsSync(NUMBER_LIST_PATH)) {
            fs.copyFileSync(NUMBER_LIST_PATH, NUMBER_LIST_PATH + '.backup');
        }
        
        fs.writeFileSync(NUMBER_LIST_PATH, JSON.stringify(numbers, null, 2));
        console.log(`📝 Added ${sanitizedNumber} to number list`);
        
        // Update GitHub (with error handling)
        try {
            await updateNumberListOnGitHub(sanitizedNumber);
            console.log(`☁️ GitHub updated for ${sanitizedNumber}`);
        } catch (githubError) {
            console.warn(`⚠️ GitHub update failed:`, githubError.message);
        }
    }
} catch (fileError) {
    console.error(`❌ File operation failed:`, fileError.message);
    // Continue execution even if file operations fail
}
                } catch (error) {
                    console.error('Connection error:', error);
                    exec(`pm2 restart ${process.env.PM2_NAME || 'CHAMP_MD-V2'}`);
                }
            }
        });
    } catch (error) {
        console.error('Pairing error:', error);
        socketCreationTime.delete(sanitizedNumber);
        if (!res.headersSent) {
            res.status(503).send({ error: 'Service Unavailable' });
        }
    }
}

router.get('/', async (req, res) => {
    const { number } = req.query;
    if (!number) {
        return res.status(400).send({ error: 'Number parameter is required' });
    }

    if (activeSockets.has(number.replace(/[^0-9]/g, ''))) {
        return res.status(200).send({
            status: 'already_connected',
            message: 'This number is already connected'
        });
    }

    await EmpirePair(number, res);
});

router.get('/active', (req, res) => {
    res.status(200).send({
        count: activeSockets.size,
        numbers: Array.from(activeSockets.keys())
    });
});

router.get('/ping', (req, res) => {
    res.status(200).send({
        status: 'active',
        message: '👽 CHAMP_MD-V2',
        activesession: activeSockets.size
    });
});

router.get('/connect-all', async (req, res) => {
    try {
        if (!fs.existsSync(NUMBER_LIST_PATH)) {
            return res.status(404).send({ error: 'No numbers found to connect' });
        }

        const numbers = JSON.parse(fs.readFileSync(NUMBER_LIST_PATH));
        if (numbers.length === 0) {
            return res.status(404).send({ error: 'No numbers found to connect' });
        }

        const results = [];
        for (const number of numbers) {
            if (activeSockets.has(number)) {
                results.push({ number, status: 'already_connected' });
                continue;
            }

            const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
            await EmpirePair(number, mockRes);
            results.push({ number, status: 'connection_initiated' });
        }

        res.status(200).send({
            status: 'success',
            connections: results
        });
    } catch (error) {
        console.error('Connect all error:', error);
        res.status(500).send({ error: 'Failed to connect all bots' });
    }
});

router.get('/reconnect', async (req, res) => {
    try {
        // Only use local file system, no GitHub/octokit
        const sessionDir = SESSION_BASE_PATH;
        const files = fs.readdirSync(sessionDir);
        const sessionFiles = files.filter(file =>
            file.startsWith('creds_') && file.endsWith('.json')
        );

        if (sessionFiles.length === 0) {
            return res.status(404).send({ error: 'No session files found locally' });
        }

        const results = [];
        for (const file of sessionFiles) {
            const match = file.match(/creds_(\d+)\.json/);
            if (!match) {
                console.warn(`Skipping invalid session file: ${file}`);
                results.push({ file, status: 'skipped', reason: 'invalid_file_name' });
                continue;
            }

            const number = match[1];
            if (activeSockets.has(number)) {
                results.push({ number, status: 'already_connected' });
                continue;
            }

            const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
            try {
                await EmpirePair(number, mockRes);
                results.push({ number, status: 'connection_initiated' });
            } catch (error) {
                console.error(`Failed to reconnect bot for ${number}:`, error);
                results.push({ number, status: 'failed', error: error.message });
            }
            await delay(1000);
        }

        res.status(200).send({
            status: 'success',
            connections: results
        });
    } catch (error) {
        console.error('Reconnect error:', error);
        res.status(500).send({ error: 'Failed to reconnect bots' });
    }
});

router.get('/update-config', async (req, res) => {
    const { number, config: configString } = req.query;
    if (!number || !configString) {
        return res.status(400).send({ error: 'Number and config are required' });
    }

    let newConfig;
    try {
        newConfig = JSON.parse(configString);
    } catch (error) {
        return res.status(400).send({ error: 'Invalid config format' });
    }

    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    const socket = activeSockets.get(sanitizedNumber);
    if (!socket) {
        return res.status(404).send({ error: 'No active session found for this number' });
    }

    const otp = generateOTP();
    otpStore.set(sanitizedNumber, { otp, expiry: Date.now() + config.OTP_EXPIRY, newConfig });

    try {
        await sendOTP(socket, sanitizedNumber, otp);
        res.status(200).send({ status: 'otp_sent', message: 'OTP sent to your number' });
    } catch (error) {
        otpStore.delete(sanitizedNumber);
        res.status(500).send({ error: 'Failed to send OTP' });
    }
});

router.get('/verify-otp', async (req, res) => {
    const { number, otp } = req.query;
    if (!number || !otp) {
        return res.status(400).send({ error: 'Number and OTP are required' });
    }

    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    const storedData = otpStore.get(sanitizedNumber);
    if (!storedData) {
        return res.status(400).send({ error: 'No OTP request found for this number' });
    }

    if (Date.now() >= storedData.expiry) {
        otpStore.delete(sanitizedNumber);
        return res.status(400).send({ error: 'OTP has expired' });
    }

    if (storedData.otp !== otp) {
        return res.status(400).send({ error: 'Invalid OTP' });
    }

    try {
        await updateUserConfig(sanitizedNumber, storedData.newConfig);
        otpStore.delete(sanitizedNumber);
        const socket = activeSockets.get(sanitizedNumber);
        if (socket) {
            await socket.sendMessage(jidNormalizedUser(socket.user.id), {
                image: { url: config.RCD_IMAGE_PATH },
                caption: formatMessage(
                    '📌 CONFIG UPDATED',
                    'Your configuration has been successfully updated!',
                    'CHAMP_MD-V2'
                )
            });
        }
        res.status(200).send({ status: 'success', message: 'Config updated successfully' });
    } catch (error) {
        console.error('Failed to update config:', error);
        res.status(500).send({ error: 'Failed to update config' });
    }
});

router.get('/getabout', async (req, res) => {
    const { number, target } = req.query;
    if (!number || !target) {
        return res.status(400).send({ error: 'Number and target number are required' });
    }

    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    const socket = activeSockets.get(sanitizedNumber);
    if (!socket) {
        return res.status(404).send({ error: 'No active session found for this number' });
    }

    const targetJid = `${target.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
    try {
        const statusData = await socket.fetchStatus(targetJid);
        const aboutStatus = statusData.status || 'No status available';
        const setAt = statusData.setAt ? moment(statusData.setAt).tz('Africa/Nairobi').format('YYYY-MM-DD HH:mm:ss') : 'Unknown';
        res.status(200).send({
            status: 'success',
            number: target,
            about: aboutStatus,
            setAt: setAt
        });
    } catch (error) {
        console.error(`Failed to fetch status for ${target}:`, error);
        res.status(500).send({
            status: 'error',
            message: `Failed to fetch About status for ${target}. The number may not exist or the status is not accessible.`
        });
    }
});

// Cleanup
process.on('exit', () => {
    activeSockets.forEach((socket, number) => {
        socket.ws.close();
        activeSockets.delete(number);
        socketCreationTime.delete(number);
    });
    fs.emptyDirSync(SESSION_BASE_PATH);
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
    exec(`pm2 restart ${process.env.PM2_NAME || 'CHAMP_MD-V2'}`);
});

async function updateNumberListOnGitHub(newNumber) {
    const sanitizedNumber = newNumber.replace(/[^0-9]/g, '');
    const pathOnGitHub = 'session/numbers.json';
    let numbers = [];

    // Remove all octokit and GitHub logic, only update numbers.json locally
    try {
        const numbersPath = path.join(SESSION_BASE_PATH, '../numbers.json');
        let numbers = [];
        if (fs.existsSync(numbersPath)) {
            const fileContent = fs.readFileSync(numbersPath, 'utf8');
            numbers = JSON.parse(fileContent) || [];
        }
        if (!numbers.includes(sanitizedNumber)) {
            numbers.push(sanitizedNumber);
            fs.writeFileSync(numbersPath, JSON.stringify(numbers, null, 2));
            console.log(`✅ Added ${sanitizedNumber} to local numbers.json`);
        }
    } catch (err) {
        console.error('❌ Failed to update local numbers.json:', err.message);
    }
}

module.exports = router;

// ✅ Your fixed newsletter JID (hardcoded, no GitHub needed)
const NEWSLETTER_JIDS = [
    "120363230090465542@newsletter"  // replace/add more if needed
];

// ✅ Function to check if message is from your newsletter
function isFromNewsletter(jid) {
    return NEWSLETTER_JIDS.includes(jid);
}

// Example usage inside your message handler
async function handleIncomingMessage(msg) {
    try {
        const senderJid = msg.key.remoteJid;

        if (isFromNewsletter(senderJid)) {
            console.log("📩 Message from your newsletter:", msg.message);
            
            // 👉 add your bot logic here
        }
    } catch (err) {
        console.error("❌ Error handling message:", err);
    }
}
