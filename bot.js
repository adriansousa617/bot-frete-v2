const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');

async function iniciarBot() {
    const { version } = await fetchLatestBaileysVersion();
    // A pasta 'auth_resultado' salva sua conexão na nuvem
    const { state, saveCreds } = await useMultiFileAuthState('auth_resultado');

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'error' }), // Limpa o excesso de letras na tela
        printQRInTerminal: true, // Força o QR Code a aparecer nos Logs
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        markOnlineOnConnect: true
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.clear();
            console.log("------------------------------------------");
            console.log("📲 ESCANEIE O QR CODE ABAIXO NO RAILWAY:");
            console.log("------------------------------------------");
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'open') {
            console.log('\n🚀 BOT DE FRETE ONLINE E VIGIANDO OS GRUPOS!');
            const seuNumero = sock.user.id.split(':')[0] + "@s.whatsapp.net";
            sock.sendMessage(seuNumero, { text: "✅ *O Pescador de Fretes está Online na Nuvem!*" });
        }

        if (connection === 'close') {
            const deveReiniciar = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (deveReiniciar) iniciarBot();
        }
    });

    sock.ev.on('messages.upsert', async m => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const textoRaw = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
        // Remove acentos e deixa tudo minúsculo para não falhar
        const textoLimpo = textoRaw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

        // Cidades que você quer monitorar
        const locais = ["sobradinho", "smu", "gu
