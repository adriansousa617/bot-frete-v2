const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const pino = require('pino');
const { Boom } = require('@hapi/boom');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

let sock;
let botLigado = true;
let curtirTudo = false; 
let gruposAlvo = []; 
let listaDeGrupos = {}; 

async function iniciarBot() {
    // AQUI ESTÁ O SEGREDO: Ele vai ler a pasta principal ('.') onde seu login já está
    const { state, saveCreds } = await useMultiFileAuthState('.');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        // Mantendo o navegador igual ao que usamos antes para ele te reconhecer
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        printQRInTerminal: false
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'open') {
            console.log('✅ CONEXÃO ANTIGA RECUPERADA! BOT ATIVO.');
        }
        if (connection === 'close') {
            const motivo = (lastDisconnect.error instanceof Boom)?.output?.statusCode;
            if (motivo !== DisconnectReason.loggedOut) iniciarBot();
        }
    });

    sock.ev.on('messages.upsert', async m => {
        const msg = m.messages[0];
        if (!botLigado || !msg.message || msg.key.fromMe) return;

        const jid = msg.key.remoteJid;
        if (jid.endsWith('@g.us') && !listaDeGrupos[jid]) {
            try {
                const metadata = await sock.groupMetadata(jid);
                listaDeGrupos[jid] = metadata.subject;
                io.emit('atualizar_grupos', listaDeGrupos);
            } catch (e) {}
        }

        if (gruposAlvo.length > 0 && !gruposAlvo.includes(jid)) return;

        const texto = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").toLowerCase();
        const locais = ["aguas claras", "joquei", "smas-spo", "candangolandia", "lucio costa", "guara 1", "smu", "sobradinho", "smas-sofs", "guara 2"];
        const ehFrete = locais.some(l => texto.includes(l)) && (texto.includes("disponivel") || texto.includes("frete"));

        if (curtirTudo || ehFrete) {
            try {
                await sock.sendMessage(jid, { react: { text: "👍", key: msg.key } });
            } catch (e) {}
        }
    });
}

// O PAINEL CONTINUA IGUAL PARA VOCÊ CONTROLAR NO CELULAR
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>Painel Fretes</title>
            <style>
                body { font-family: sans-serif; background: #121212; color: white; text-align: center; padding: 20px; }
                .card { background: #1e1e1e; border-radius: 15px; padding: 20px; max-width: 400px; margin: auto; }
                button { width: 100%; padding: 15px; margin: 10px 0; border-radius: 10px; border: none; font-weight: bold; cursor: pointer; }
                .on { background: #25d366; color: black; } .off { background: #ea4335; color: white; }
                .box { background: #2a2a2a; padding: 10px; border-radius: 10px; text-align: left; margin-top: 15px; font-size: 14px; }
                .item { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #333; }
            </style>
        </head>
        <body>
            <div class="card">
                <h2>🚚 FreteBot Controle</h2>
                <button id="btnBot" onclick="socket.emit('toggle_bot')">CARREGANDO...</button>
                <button id="btnTudo" onclick="socket.emit('toggle_tudo')">CARREGANDO...</button>
                <div class="box">
                    <strong>Grupos:</strong>
                    <div id="lista">Aguardando mensagens...</div>
                </div>
            </div>
            <script src="/socket.io/socket.io.js"></script>
            <script>
                const socket = io();
                socket.on('status', (data) => {
                    const b = document.getElementById('btnBot');
                    b.innerText = data.botLigado ? 'BOT: LIGADO' : 'BOT: DESLIGADO';
                    b.className = data.botLigado ? 'on' : 'off';
                    const t = document.getElementById('btnTudo');
                    t.innerText = data.curtirTudo ? 'CURTIR TUDO: ON' : 'CURTIR TUDO: OFF';
                    t.className = data.curtirTudo ? 'on' : 'off';
                });
                socket.on('atualizar_grupos', (grupos) => {
                    const cont = document.getElementById('lista');
                    cont.innerHTML = '';
                    for (let id in grupos) {
                        cont.innerHTML += \`<div class="item">\${grupos[id]} <input type="checkbox" onchange="socket.emit('toggle_grupo', '\${id}')"></div>\`;
                    }
                });
            </script>
        </body>
        </html>
    `);
});

io.on('connection', (socket) => {
    socket.emit('status', { botLigado, curtirTudo });
    socket.emit('atualizar_grupos', listaDeGrupos);
    socket.on('toggle_bot', () => { botLigado = !botLigado; io.emit('status', { botLigado, curtirTudo }); });
    socket.on('toggle_tudo', () => { curtirTudo = !curtirTudo; io.emit('status', { botLigado, curtirTudo }); });
    socket.on('toggle_grupo', (id) => {
        if (gruposAlvo.includes(id)) gruposAlvo = gruposAlvo.filter(g => g !== id);
        else gruposAlvo.push(id);
    });
});

server.listen(process.env.PORT || 3000, () => iniciarBot());
