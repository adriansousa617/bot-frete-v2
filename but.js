const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, delay } = require('@whiskeysockets/baileys');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const pino = require('pino');
const { Boom } = require('@hapi/boom');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- CONFIGURAÇÕES DO BOT ---
let sock;
let botLigado = true;
let gruposDisponiveis = {}; // Guarda Nome e ID dos grupos
let gruposAtivos = []; // IDs dos grupos que o bot deve atuar
const meuNumero = "5561998853299"; // <--- COLOQUE SEU NÚMERO AQUI

async function iniciarBot() {
    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState('auth_railway');

    sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        printQRInTerminal: false
    });

    if (!sock.authState.creds.registered) {
        await delay(5000);
        const code = await sock.requestPairingCode(meuNumero);
        console.log(`\n🔥 CÓDIGO DE ACESSO: ${code}\n`);
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'open') console.log('✅ BOT ONLINE NO PAINEL');
        if (connection === 'close') {
            const deveReconectar = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (deveReconectar) iniciarBot();
        }
    });

    // Captura grupos ao receber mensagens ou sincronizar
    sock.ev.on('chats.set', item => {
        item.chats.forEach(chat => {
            if (chat.id.endsWith('@g.us')) gruposDisponiveis[chat.id] = chat.name || "Grupo sem nome";
        });
    });

    sock.ev.on('messages.upsert', async m => {
        const msg = m.messages[0];
        if (!botLigado || !msg.message || msg.key.fromMe) return;

        const idGrupo = msg.key.remoteJid;
        // Só reage se o grupo estiver na lista de ativos (ou se a lista estiver vazia, reage em todos)
        if (gruposAtivos.length > 0 && !gruposAtivos.includes(idGrupo)) return;

        const textoRaw = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").toLowerCase();
        const locais = ["aguas claras", "joquei", "smas-spo", "candangolandia", "lucio costa", "guara 1", "smu", "sobradinho", "smas-sofs", "guara 2"];
        
        if (locais.some(l => textoRaw.includes(l)) && (textoRaw.includes("disponivel") || textoRaw.includes("frete"))) {
            try {
                await sock.sendMessage(idGrupo, { react: { text: "👍", key: msg.key } });
                console.log(`👍 Reagido no grupo: ${gruposDisponiveis[idGrupo] || idGrupo}`);
            } catch (e) { console.log("Erro na reação"); }
        }
    });
}

// --- ROTAS DO PAINEL WEB ---
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>Bot Frete Painel</title>
            <style>
                body { font-family: sans-serif; background: #f0f2f5; text-align: center; padding: 20px; }
                .card { background: white; border-radius: 15px; padding: 20px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); max-width: 400px; margin: auto; }
                button { width: 100%; padding: 15px; border: none; border-radius: 10px; font-size: 18px; cursor: pointer; color: white; transition: 0.3s; }
                .btn-on { background: #25d366; } .btn-off { background: #ea4335; }
                .list { text-align: left; margin-top: 20px; background: #fff; border-radius: 10px; padding: 10px; }
                .grupo-item { display: flex; align-items: center; justify-content: space-between; padding: 10px; border-bottom: 1px solid #eee; }
            </style>
        </head>
        <body>
            <div class="card">
                <h2>🚚 Controle de Fretes</h2>
                <button id="mainBtn" class="${botLigado ? 'btn-on' : 'btn-off'}" onclick="toggleBot()">
                    ${botLigado ? 'BOT LIGADO' : 'BOT DESLIGADO'}
                </button>
                <div class="list">
                    <strong>Escolha os Grupos:</strong>
                    <div id="gruposContainer">Carregando grupos...</div>
                </div>
            </div>

            <script src="/socket.io/socket.io.js"></script>
            <script>
                const socket = io();
                function toggleBot() { socket.emit('toggle_bot'); }
                socket.on('status', (data) => {
                    const btn = document.getElementById('mainBtn');
                    btn.innerText = data.ligado ? 'BOT LIGADO' : 'BOT DESLIGADO';
                    btn.className = data.ligado ? 'btn-on' : 'btn-off';
                });
            </script>
        </body>
        </html>
    `);
});

// Comunicação em tempo real com o painel
io.on('connection', (socket) => {
    socket.emit('status', { ligado: botLigado });
    socket.on('toggle_bot', () => {
        botLigado = !botLigado;
        io.emit('status', { ligado: botLigado });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Painel rodando na porta ${PORT}`);
    iniciarBot();
});
