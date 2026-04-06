const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');

async function iniciarBot() {
    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState('auth_resultado');

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false, // Desligamos o QR Code ruim
        browser: ["Ubuntu", "Chrome", "20.0.04"]
    });

    // --- CONFIGURAÇÃO DO CÓDIGO DE EMPARELHAMENTO ---
    if (!sock.authState.creds.registered) {
        // COLOQUE SEU NÚMERO ABAIXO (Exemplo: 5561998853299)
        const meuNumero = "5561999999999"; 
        
        setTimeout(async () => {
            const code = await sock.requestPairingCode(meuNumero);
            console.log(`\n✅ SEU CÓDIGO DE ACESSO É: ${code}\n`);
        }, 5000);
    }
    // -----------------------------------------------

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'open') console.log('\n🚀 BOT ONLINE E CONECTADO!');
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
        const locais = ["aguas claras", "joquei", "smas-spo", "candangolandia", "lucio costa", "guara 1", "smu", "sobradinho", "smas-sofs", "guara 2"];
        
        if (locais.some(l => textoLimpo.includes(l)) && (textoLimpo.includes("disponivel") || textoLimpo.includes("frete"))) {
            try {
                await sock.sendMessage(msg.key.remoteJid, { react: { text: "👍", key: msg.key } });
                console.log(`✅ REAGIDO: ${textoRaw}`);
            } catch (err) { console.log(`❌ Erro: ${err.message}`); }
        }
    });
}

iniciarBot().catch(err => console.log(err));
