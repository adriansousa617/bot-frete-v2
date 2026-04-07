const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, delay } = require('@whiskeysockets/baileys');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const pino = require('pino');
const { Boom } = require('@hapi/boom');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- ESTADO DO APP ---
let sock;
let botLigado = true;
let curtirTudo = false; // Nova função
let gruposAlvo = []; // Lista de IDs de grupos selecionados
let listaDeGrupos = {}; // Nome e ID de todos os grupos
const meuNumero = "55619XXXX-XXXX"; // <--- SEU NÚMERO AQUI

async function iniciarBot() {
    const { state, saveCreds } = await useMultiFileAuthState('.');
    const { version } = await fetchLatestBaileysVersion();

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
        console.log(`\n🔥 NOVO CÓDIGO DE ACESSO: ${code}\n`);
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'open') console.log('✅ BOT ATIVO!');
        if (connection === 'close') {
            const motivo = (lastDisconnect.error instanceof Boom)?.output?.statusCode;
            if (motivo !== DisconnectReason.loggedOut) iniciarBot();
        }
    });

    // Monitora mensagens e identifica grupos
    sock.ev.on('messages.upsert', async m => {
        const msg = m.messages[0];
        if (!botLigado || !msg.message || msg.key.fromMe) return;

        const jid = msg.key.remoteJid;
        const isGroup = jid.endsWith('@g.us');
        
        // Atualiza lista de grupos dinamicamente
        if (isGroup && !listaDeGrupos[jid]) {
            const metadata = await sock.groupMetadata(jid);
            listaDeGrupos[jid] = metadata.subject;
            io.emit('atualizar_grupos', listaDeGrupos);
        }

        // Se o grupo não estiver selecionado (e a lista não estiver vazia), ignora
        if (isGroup && gruposAlvo.length > 0 && !gruposAlvo.includes(jid)) return;

        // --- LÓGICA DE REAÇÃO ---
        const texto = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").toLowerCase();
        const locais = ["aguas claras", "joquei", "smas-spo", "candangolandia", "lucio costa", "guara 1", "smu", "sobradinho", "smas-sofs", "guara 2"];
        const ehFrete = locais.some(l => texto.includes(l)) && (texto.includes("disponivel") || texto.includes("frete"));

        if (curtirTudo || ehFrete) {
            try {
                await sock.sendMessage(jid, { react: { text: "👍", key: msg.key } });
            } catch (e) { console.log("Erro ao curtir"); }
        }
    });
}

// --- PAINEL WEB ---
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>FreteBot Pro</title>
            <style>
                body { font-family: sans-serif; background: #121212; color: white; padding: 20px; }
                .card { background: #1e1e1e; border-radius: 15px; padding: 20px; max-width: 450px; margin: auto; }
                button { width: 100%; padding: 15px; border-radius: 10px; border: none; font-weight: bold; cursor: pointer; margin: 10px 0; }
                .on { background: #25d366; color: black; } .off { background: #ea4335; color: white; }
                .box { background: #2a2a2a; padding: 15px; border-radius: 10px; text-align: left; margin-top: 15px; }
                .item { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #333; }
                input[type="checkbox"] { transform: scale(1.5); }
            </style>
        </head>
        <body>
            <div class="card">
                <h2>🚚 FreteBot Pro</h2>
                <button id="btnBot" onclick="socket.emit('toggle_bot')">CARREGANDO...</button>
                <button id="btnTudo" onclick="socket.emit('toggle_tudo')">CARREGANDO...</button>
                
                <div class="box">
                    <strong>📍 Grupos Monitorados</strong>
                    <p style="font-size: 12px; color: #888;">Se nenhum for marcado, funciona em TODOS.</p>
                    <div id="lista">Aguardando mensagens dos grupos...</div>
                </div>
            </div>

            <script src="/socket.io/socket.io.js"></script>
            <script>
                const socket = io();
                function toggleGrupo(id) { socket.emit('toggle_grupo', id); }
                
                socket.on('status', (data) => {
                    const b = document.getElementById('btnBot');
                    b.innerText = data.botLigado ? 'SISTEMA: LIGADO' : 'SISTEMA: DESLIGADO';
                    b.className = data.botLigado ? 'on' : 'off';

                    const t = document.getElementById('btnTudo');
                    t.innerText = data.curtirTudo ? 'CURTIR TUDO: ON' : 'CURTIR TUDO: OFF';
                    t.className = data.curtirTudo ? 'on' : 'off';
                });

                socket.on('atualizar_grupos', (grupos) => {
                    const cont = document.getElementById('lista');
                    cont.innerHTML = '';
                    for (let id in grupos) {
                        cont.innerHTML += \`<div class="item">\${grupos[id]} <input type="checkbox" onchange="toggleGrupo('\${id}')"></div>\`;
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
