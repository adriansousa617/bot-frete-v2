const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, delay } = require('@whiskeysockets/baileys');
const pino = require('pino');
const { Boom } = require('@hapi/boom');

async function iniciarBot() {
    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState('auth_railway');

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        printQRInTerminal: false // Desligamos o QR Code pra não poluir
    });

    // --- CONFIGURAÇÃO DO CÓDIGO DE 8 DÍGITOS ---
    // Coloque seu número aqui entre aspas: "55DDD999999999"
    const meuNumero = "5561998853299"; 

    if (!sock.authState.creds.registered) {
        await delay(5000); // Espera o bot ligar
        const code = await sock.requestPairingCode(meuNumero);
        console.log(`\n🔥 SEU CÓDIGO DE ACESSO É: ${code}\n`);
    }
    // -------------------------------------------

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'open') console.log('\n✅ BOT CONECTADO COM SUCESSO!');
        if (connection === 'close') {
            const deveReconectar = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (deveReconectar) setTimeout(() => iniciarBot(), 5000);
        }
    });

    sock.ev.on('messages.upsert', async m => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;
        const textoRaw = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").toLowerCase();
        const locais = ["aguas claras", "joquei", "smas-spo", "candangolandia", "lucio costa", "guara 1", "smu", "sobradinho", "smas-sofs", "guara 2"];
        if (locais.some(l => textoRaw.includes(l)) && (textoRaw.includes("disponivel") || textoRaw.includes("frete"))) {
            try { await sock.sendMessage(msg.key.remoteJid, { react: { text: "👍", key: msg.key } }); } catch (e) {}
        }
    });
}

iniciarBot().catch(err => console.log(err));
