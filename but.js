const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');

async function iniciarBot() {
    const { version } = await fetchLatestBaileysVersion();
    // Mudamos o nome da pasta para forçar uma conexão limpa
    const { state, saveCreds } = await useMultiFileAuthState('sessao_v3');

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        // Isso ajuda o WhatsApp a aceitar a conexão da nuvem
        browser: ["Ubuntu", "Chrome", "20.0.04"]
    });

    sock.ev.on('creds.update', saveCreds);

    if (!sock.authState.creds.registered) {
        // COLOQUE SEU NÚMERO AQUI (Ex: 5561998853299)
        const meuNumero = "5561998853299"; 

        // Espera 15 segundos para o servidor estabilizar antes de pedir o código
        setTimeout(async () => {
            try {
                const code = await sock.requestPairingCode(meuNumero);
                console.log(`\n✅ DIGITE ESTE CÓDIGO NO WHATSAPP: ${code}\n`);
            } catch (err) {
                console.log("Aguardando estabilidade...");
            }
        }, 15000);
    }

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'open') {
            console.log('\n🚀 CONECTADO COM SUCESSO! O BOT ESTÁ ATIVO.');
        }
        if (connection === 'close') {
            const motivo = (lastDisconnect.error)?.output?.statusCode;
            if (motivo !== DisconnectReason.loggedOut) iniciarBot();
        }
    });

    sock.ev.on('messages.upsert', async m => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;
        const textoRaw = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").toLowerCase();
        const locais = ["aguas claras", "joquei", "smas-spo", "candangolandia", "lucio costa", "guara 1", "smu", "sobradinho", "smas-sofs", "guara 2"];
        if (locais.some(l => textoRaw.includes(l)) && (textoRaw.includes("disponivel") || textoRaw.includes("frete"))) {
            try {
                await sock.sendMessage(msg.key.remoteJid, { react: { text: "👍", key: msg.key } });
            } catch (e) { console.log("Erro na reação"); }
        }
    });
}

iniciarBot().catch(err => console.log(err));
