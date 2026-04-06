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
        // Aumentamos o tempo de espera para o servidor não desistir rápido
        connectTimeoutMs: 120000, // 2 minutos
        defaultQueryTimeoutMs: 120000,
        keepAliveIntervalMs: 30000,
        generateHighQualityLinkPreview: false
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log("\n📢 ESCANEIE O QR CODE:");
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'open') {
            console.log('\n✅ [SISTEMA] BOT CONECTADO E ATIVO!');
        }

        if (connection === 'close') {
            const codigoErro = (lastDisconnect.error instanceof Boom)?.output?.statusCode;
            
            // Se o erro for timeout (408) ou conexão fechada (428), a gente religa rápido
            if (codigoErro !== DisconnectReason.loggedOut) {
                console.log(`🔄 Conexão instável (Erro ${codigoErro}). Reiniciando em 5s...`);
                setTimeout(() => iniciarBot(), 5000);
            } else {
                console.log("❌ Sessão encerrada. Apague os arquivos de sessão e logue de novo.");
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

        const locais = ["aguas claras", "joquei", "smas-spo", "candangolandia", "lucio costa", "guara 1", "smu", "sobradinho", "smas-sofs", "guara 2"];
        const temLocal = locais.some(l => textoRaw.includes(l));
        const temPalavraChave = textoRaw.includes("disponivel") || textoRaw.includes("frete");

        if (temLocal && temPalavraChave) {
            try {
                // Pequeno delay para estabilidade
                await new Promise(resolve => setTimeout(resolve, 1500));
                await sock.sendMessage(msg.key.remoteJid, { react: { text: "👍", key: msg.key } });
                console.log(`✅ REAGIDO: ${textoRaw.substring(0, 20)}...`);
            } catch (err) {
                // Se der erro ao reagir, ignora para o bot não cair
                console.log("Aviso: Falha ao reagir, mas o bot continua vivo.");
            }
        }
    });
}

// Tratamento de erro global para o processo não morrer
process.on('uncaughtException', (err) => {
    console.log('Erro ignorado para manter o bot vivo:', err.message);
});

iniciarBot().catch(err => console.log("Erro inicial:", err));
