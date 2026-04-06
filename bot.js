const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');

async function iniciarBot() {
    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState('auth_resultado');

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'fatal' }),
        printQRInTerminal: true,
        browser: ["Windows", "Chrome", "11.0"],
        syncFullHistory: false,
        markOnlineOnConnect: true
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            console.clear();
            console.log("📲 ESCANEIE O QR CODE NO LOG DO RAILWAY:");
            qrcode.generate(qr, { small: true });
        }
        if (connection === 'open') console.log('\n🚀 BOT DE FRETE ONLINE NA NUVEM!');
        if (connection === 'close') {
            const motivo = (lastDisconnect.error)?.output?.statusCode;
            if (motivo !== DisconnectReason.loggedOut) iniciarBot();
        }
    });

    sock.ev.on('messages.upsert', async m => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const textoRaw = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
        const textoLimpo = textoRaw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

        const locais = ["aguas claras", "joquei", "smas-spo", "candangolandia", "lucio costa", "guara 1", "smu", "sobradinho", "smas-sofs"];
        
        if (locais.some(l => textoLimpo.includes(l)) && textoLimpo.includes("disponivel")) {
            try {
                // Reação Dupla para Garantia
                await sock.sendMessage(msg.key.remoteJid, { react: { text: "👍", key: msg.key } });
                
                const seuNumero = sock.user.id.split(':')[0] + "@s.whatsapp.net";
                await sock.sendMessage(seuNumero, { text: `✅ *REAGIDO NO GRUPO!* \n📍 Local: ${textoRaw}` });
                console.log(`✅ REAGIDO: ${textoRaw}`);
            } catch (err) { console.log(`❌ ERRO: ${err.message}`); }
        }
    });
}

iniciarBot().catch(err => console.log("Erro:", err));