const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');

async function iniciarBot() {
    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState('auth_resultado');

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        browser: ["Ubuntu", "Chrome", "20.0.04"]
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        // Se a conexão fechar por erro, ele tenta ligar de novo
        if (connection === 'close') {
            const motivo = (lastDisconnect.error)?.output?.statusCode;
            if (motivo !== DisconnectReason.loggedOut) {
                console.log("🔄 Conexão oscilou, tentando ligar de novo...");
                iniciarBot();
            }
        } 

        // QUANDO A CONEXÃO ESTIVER PRONTA PARA PEDIR O CÓDIGO
        if (connection === 'open') {
            console.log('\n🚀 BOT ONLINE E CONECTADO!');
        }
    });

    // --- PARTE DO CÓDIGO DE EMPARELHAMENTO MAIS SEGURO ---
    if (!sock.authState.creds.registered) {
        // COLOQUE SEU NÚMERO ABAIXO (Exemplo: 5561998853299)
        const meuNumero = "5561999999999"; 

        // Espera 10 segundos para garantir que o sinal está forte
        setTimeout(async () => {
            try {
                const code = await sock.requestPairingCode(meuNumero);
                console.log(`\n✅ SEU CÓDIGO DE ACESSO NOVO: ${code}\n`);
            } catch (err) {
                console.log("\n❌ Erro ao gerar código. Reiniciando para tentar de novo...");
                iniciarBot();
            }
        }, 10000); 
    }

    // Lógica das mensagens (Joinha automático)
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
            } catch (err) { console.log(`❌ Erro ao reagir: ${err.message}`); }
        }
    });
}

iniciarBot().catch(err => console.log("Erro crítico:", err));
