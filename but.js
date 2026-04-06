const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');

async function iniciarBot() {
    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState('auth_resultado');

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }), // Silencia erros bobos pra limpar o log
        printQRInTerminal: true, // Força o QR Code a aparecer nos logs
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        syncFullHistory: false
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log("\n⬇️--- ESCANEIE O QR CODE ABAIXO ---⬇️\n");
            qrcode.generate(qr, { small: true });
            console.log("\n⬆️--- ESCANEIE RÁPIDO ---⬆️\n");
        }

        if (connection === 'open') {
            console.log('\n🚀 TUDO CERTO! BOT ONLINE NA NUVEM!');
            const seuNumero = sock.user.id.split(':')[0] + "@s.whatsapp.net";
            sock.sendMessage(seuNumero, { text: "✅ *O Pescador de Frete está Online!* Agora pode fechar o PC." });
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) iniciarBot();
        }
    });

    sock.ev.on('messages.upsert', async m => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const textoRaw = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
        const textoLimpo = textoRaw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

        // Cidades que o bot vai vigiar
        const locais = ["aguas claras", "joquei", "smas-spo", "candangolandia", "lucio costa", "guara 1", "smu", "sobradinho", "smas-sofs", "guara 2"];
        
        if (locais.some(l => textoLimpo.includes(l)) && (textoLimpo.includes("disponivel") || textoLimpo.includes("frete"))) {
            try {
                // Reage com Joinha no Grupo
                await sock.sendMessage(msg.key.remoteJid, { react: { text: "👍", key: msg.key } });
                
                // Te avisa no privado que pegou um frete
                const seuNumero = sock.user.id.split(':')[0] + "@s.whatsapp.net";
                await sock.sendMessage(seuNumero, { text: `🎯 *FRETE DETECTADO!* \n📍 Local: ${textoRaw}` });
                console.log(`✅ REAGIDO: ${textoRaw}`);
            } catch (err) {
                console.log(`❌ Erro ao reagir: ${err.message}`);
            }
        }
    });
}

iniciarBot().catch(err => console.log("Erro ao iniciar:", err));