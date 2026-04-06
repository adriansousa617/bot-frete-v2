const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const { Boom } = require('@hapi/boom');

async function iniciarBot() {
    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState('.');

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        // Adiciona um tempo maior de espera para evitar o erro 428
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0,
        keepAliveIntervalMs: 10000
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log("\n📢 ESCANEIE O QR CODE:");
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'open') {
            console.log('\n✅ [SISTEMA] BOT CONECTADO E ATIVO NO RAILWAY!');
        }

        if (connection === 'close') {
            const deveReconectar = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('🔄 Conexão fechada devido ao erro:', lastDisconnect.error, '- Tentando reconectar:', deveReconectar);
            
            if (deveReconectar) {
                // Espera 5 segundos antes de tentar ligar de novo para não travar o Railway
                setTimeout(() => iniciarBot(), 5000);
            }
        }
    });

    sock.ev.on('messages.upsert', async m => {
        const msg = m.messages[0];
        // Adicionamos uma trava: se a conexão não estiver aberta, ele não tenta reagir
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
                // Delay de 2 segundos antes de reagir para parecer humano e evitar erro de conexão
                setTimeout(async () => {
                    await sock.sendMessage(msg.key.remoteJid, { react: { text: "👍", key: msg.key } });
                    console.log(`✅ REAGIDO: ${textoRaw.substring(0, 20)}...`);
                }, 2000);
            } catch (err) {
                console.log("Erro ao reagir:", err.message);
            }
        }
    });
}

iniciarBot().catch(err => console.log("Erro no bot:", err));
