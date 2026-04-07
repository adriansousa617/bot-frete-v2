const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const pino = require('pino');
const { Boom } = require('@hapi/boom');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- ESTADO DO SEU APP ---
let sock;
let botLigado = true; // O seu botão de ON/OFF
let gruposDisponiveis = {};

async function iniciarBot() {
    const { version } = await fetchLatestBaileysVersion();
    
    // USANDO O '.' PARA PEGAR A CONEXÃO QUE JÁ ESTÁ NO SEU GITHUB
    const { state, saveCreds } = await useMultiFileAuthState('.');

    sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        printQRInTerminal: false
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'open') console.log('✅ BOT CONECTADO E PAINEL PRONTO!');
        if (connection === 'close') {
            const motivo = (lastDisconnect.error instanceof Boom)?.output?.statusCode;
            if (motivo !== DisconnectReason.loggedOut) iniciarBot();
        }
    });

    sock.ev.on('messages.upsert', async m => {
        const msg = m.messages[0];
        
        // REGRA DE OURO: SE O BOTÃO ESTIVER "OFF", ELE NÃO FAZ NADA
        if (!botLigado || !msg.message || msg.key.fromMe) return;

        const textoRaw = (
            msg.message.conversation || 
            msg.message.extendedTextMessage?.text || 
            msg.message.imageMessage?.caption || ""
        ).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

        const locais = ["aguas claras", "joquei", "smas-spo", "candangolandia", "lucio costa", "guara 1", "smu", "sobradinho", "smas-sofs", "guara 2"];
        const temLocal = locais.some(l => textoRaw.includes(l));
        const temPalavraChave = textoRaw.includes("disponivel") || textoRaw.includes("frete");

        if (temLocal && temPalavraChave) {
            try {
                await sock.sendMessage(msg.key.remoteJid, { react: { text: "👍", key: msg.key } });
                console.log(`👍 Reagido ao frete: ${textoRaw.substring(0, 20)}`);
            } catch (e) { console.log("Erro na reação"); }
        }
    });
}

// --- INTERFACE DO SEU APP NO CELULAR ---
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>Painel de Controle Fretes</title>
            <style>
                body { font-family: sans-serif; background: #121212; color: white; text-align: center; padding: 40px 20px; }
                .card { background: #1e1e1e; border-radius: 20px; padding: 30px; box-shadow: 0 10px 20px rgba(0,0,0,0.5); max-width: 400px; margin: auto; }
                .status-dot { height: 12px; width: 12px; background-color: #25d366; border-radius: 50%; display: inline-block; margin-right: 8px; }
                button { width: 100%; padding: 20px; border: none; border-radius: 15px; font-size: 22px; font-weight: bold; cursor: pointer; transition: 0.3s; margin-top: 20px; }
                .btn-on { background: #25d366; color: black; box-shadow: 0 0 20px rgba(37, 211, 102, 0.4); }
                .btn-off { background: #ea4335; color: white; }
                h1 { margin-bottom: 10px; font-size: 28px; }
                p { color: #aaa; margin-bottom: 30px; }
            </style>
        </head>
        <body>
            <div class="card">
                <h1>🚚 FreteBot</h1>
                <p><span class="status-dot"></span> Sistema Online</p>
                <button id="mainBtn" class="${botLigado ? 'btn-on' : 'btn-off'}" onclick="toggleBot()">
                    ${botLigado ? 'BOT: LIGADO' : 'BOT: DESLIGADO'}
                </button>
            </div>

            <script src="/socket.io/socket.io.js"></script>
            <script>
                const socket = io();
                function toggleBot() { socket.emit('toggle_bot'); }
                socket.on('status', (data) => {
                    const btn = document.getElementById('mainBtn');
                    btn.innerText = data.ligado ? 'BOT: LIGADO' : 'BOT: DESLIGADO';
                    btn.className = data.ligado ? 'btn-on' : 'btn-off';
                });
            </script>
        </body>
        </html>
    `);
});

// Comunicação em tempo real
io.on('connection', (socket) => {
    socket.emit('status', { ligado: botLigado });
    socket.on('toggle_bot', () => {
        botLigado = !botLigado;
        io.emit('status', { ligado: botLigado });
        console.log(`Bot alterado para: ${botLigado ? 'LIGADO' : 'DESLIGADO'}`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`App rodando! Acesse pelo link do Railway`);
    iniciarBot();
});
