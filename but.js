const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');

async function iniciarBot() {
    const { version } = await fetchLatestBaileysVersion();
    
    // O ponto '.' lê os arquivos que você já subiu na raiz do GitHub
    const { state, saveCreds } = await useMultiFileAuthState('.');

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        browser: ["Ubuntu", "Chrome", "20.0.04"]
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log("\n📢 NOVO QR CODE GERADO:");
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'open') {
            console.log('\n✅ [SISTEMA] BOT CONECTADO E ATIVO NO RAILWAY!');
        }

        if (connection === 'close') {
            const motivo = (lastDisconnect.error)?.output?.statusCode;
            if (motivo !== DisconnectReason.loggedOut) {
                iniciarBot();
            }
        }
    });

    sock.ev.on('messages.upsert', async m => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const textoRaw = (
            msg.message.conversation || 
            msg.message.extendedTextMessage?.text || 
            msg.message.imageMessage?.caption || ""
        ).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

        const locais = [
            "aguas claras", "joquei", "smas-spo", "candangolandia", 
            "lucio costa", "guara 1", "smu", "sobradinho", 
            "smas-sofs", "guara 2"
        ];

        const temLocal = locais.some(l => textoRaw.includes(l));
        const temPalavraChave = textoRaw.includes("disponivel") || textoRaw.includes("frete");

        if (temLocal && temPalavraChave) {
            try {
                await sock.sendMessage(msg.key.remoteJid, { 
                    react: { text: "👍", key: msg.key } 
                });
                console.log(`✅ REAGIDO: ${textoRaw.substring(0, 20)}...`);
            } catch (err) {
                console.log("Erro na reação:", err.message);
            }
        }
    });
}

iniciarBot().catch(err => console.log(err));
