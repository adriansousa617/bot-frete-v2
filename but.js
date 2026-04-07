const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
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
let curtirTudo = false; 
let gruposAlvo = []; 
let listaDeGrupos = {}; 

async function iniciarBot() {
    // Lendo a pasta principal onde estão seus arquivos de login (.json)
    const { state, saveCreds } = await useMultiFileAuthState('.');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        printQRInTerminal: false,
        // Adicionando tempos de espera maiores para evitar quedas no Railway
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0,
        keepAliveIntervalMs: 10000
    });

    // SÓ PEDE CÓDIGO SE NÃO EXISTIR LOGIN SALVO
    // Removi a parte que forçava o código toda vez!

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'open') {
            console.log('\n✅ [SISTEMA] BOT RECONECTADO COM SUCESSO USANDO O LOGIN EXISTENTE!');
        }
        if (connection === 'close') {
            const motivo = (lastDisconnect.error instanceof Boom)?.output?.statusCode;
            // Se não for logoff manual, ele tenta voltar sozinho
            if (motivo !== DisconnectReason.loggedOut) {
                console.log("🔄 Conexão oscilou. Tentando voltar...");
                iniciarBot();
            }
        }
    });

    // --- RESTO DO CÓDIGO (REAEAÇÕES E PAINEL) ---
    sock.ev.on('messages.upsert', async m => {
        const msg = m.messages[0];
        if (!botLigado || !msg.message || msg.key.fromMe) return;

        const jid = msg.key.remoteJid;
        const isGroup = jid.endsWith('@g.us');
        
        // Se for grupo, identifica o nome para o painel
        if (isGroup && !listaDeGrupos[jid]) {
            try {
                const metadata = await sock.groupMetadata(jid);
                listaDeGrupos[jid] = metadata.subject;
                io.emit('atualizar_grupos', listaDeGrupos);
            } catch (e) {}
        }

        // Filtro de Grupos Escolhidos
        if (isGroup && gruposAlvo.length > 0 && !gruposAlvo.includes(jid)) return;

        const texto = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").toLowerCase();
        const locais = ["aguas claras", "joquei", "smas-spo", "candangolandia", "lucio costa", "guara 1", "smu", "sobradinho", "smas-sofs", "guara 2"];
        const ehFrete = locais.some(l => texto.includes(l)) && (texto.includes("disponivel") || texto.includes("frete"));

        // CURTIR TUDO OU SÓ FRETE
        if (curtirTudo || ehFrete) {
            try {
                await sock.sendMessage(jid, { react: { text: "👍", key: msg.key } });
                console.log(`👍 Reagido em: ${listaDeGrupos[jid] || jid}`);
            } catch (e) {}
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
            <title>FreteBot Pro</title>
            <style>
                body { font-family: sans-serif; background: #121212; color: white; padding: 20px; text-align: center; }
                .card { background: #1e1e1e; border-radius: 15px; padding: 20px; max-width: 450px; margin: auto; box-shadow: 0 10px 20px rgba(0,0,0,0.5); }
                button { width: 100%; padding: 18px; border-radius: 12px; border: none; font-weight: bold; cursor: pointer; margin: 10px 0; font-size: 16px; transition: 0.3s; }
                .on { background: #25d366; color: black; } 
                .off { background: #ea4335; color: white; }
                .box { background: #2a2a2a; padding: 15px; border-radius: 10px; text-align: left; margin-top: 15px; }
                .item { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid #333; }
                input[type="checkbox"] { width: 20px; height: 20px; cursor: pointer; }
            </style>
        </head>
        <body>
            <div class="card">
                <h2>🚚 FreteBot Pro</h2>
                <button id="btnBot" onclick="socket.emit('toggle_bot')">CARREGANDO...</button>
                <button id="btnTudo" onclick="socket.emit('toggle_tudo')">CARREGANDO...</button>
                
                <div class="box">
                    <strong>📍 Grupos Monitorados</strong>
                    <p style="font-size: 12px; color: #888; margin-bottom: 15px;">Marque os grupos que o bot deve atuar. Se não marcar nenhum, ele atua em todos.</p>
                    <div id="lista">Aguardando mensagens...</div>
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
                    t.innerText = data.curtirTudo ? 'MODO: CURTIR TUDO' : 'MODO: SÓ FRETES';
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
