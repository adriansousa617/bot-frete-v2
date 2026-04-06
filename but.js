const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const { Boom } = require('@hapi/boom');

async function iniciarBot() {
    const { version } = await fetchLatestBaileysVersion();
    
    // Mudamos o nome da pasta para 'auth_railway' para forçar um login novo e limpo
    const { state, saveCreds } = await useMultiFileAuthState('auth_railway');

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0,
        keepAliveIntervalMs: 10000
    });

    // Salva as credenciais automaticamente
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        // Se o bot precisar de login, ele vai desenhar o QR Code nos LOGS do Railway
        if (qr) {
            console.log("\n📢 ESCANEIE O QR CODE ABAIXO NO SEU CELULAR:");
            console.log("Dica: Se o desenho estiver torto, diminua o zoom do navegador (Ctrl e -)\n");
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'open') {
            console.log('\n✅ [SISTEMA] BOT CONECTADO E ATIVO NO RAILWAY!');
        }

        if (connection === 'close') {
            const motivo = (lastDisconnect.error instanceof Boom)?.output?.statusCode;
            
            if (motivo !== DisconnectReason.loggedOut) {
                console.log("🔄 Conexão oscilou. Tentando religar em 5s...");
                setTimeout(() => iniciarBot(), 5000);
            } else {
                console.log("❌ Sessão encerrada. Você desconectou pelo celular.");
            }
        }
    });

    // MONITORAMENTO DE MENSAGENS
    sock.ev.on('messages.upsert', async m => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe || sock.ws.readyState !== 1) return;

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
                // Espera 2 segundos e reage com 👍
                setTimeout(async () => {
                    await sock.sendMessage(msg.key.remoteJid, { 
                        react: { text: "👍", key: msg.key } 
                    });
                    console.log(`✅ REAGIDO: ${textoRaw.substring(0, 25)}...`);
                }, 2000);
            } catch (err) {
                console.log("Erro ao reagir:", err.message);
            }
        }
    });
}

// Evita que o bot "morra" por erros bobos de rede
process.on('uncaughtException', (err) => {
    console.log('Erro de rede ignorado:', err.message);
});

iniciarBot().catch(err => console.log("Erro ao iniciar:", err));
