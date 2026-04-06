const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');

async function iniciarBot() {
    const { version } = await fetchLatestBaileysVersion();
    
    // ATENÇÃO: O '.' indica que o bot vai ler os arquivos que você subiu na raiz do GitHub
    const { state, saveCreds } = await useMultiFileAuthState('.');

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false, // Usamos o qrcode-terminal para desenhar melhor
        browser: ["Ubuntu", "Chrome", "20.0.04"]
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log("\n📢 NOVO QR CODE GERADO (Caso precise reconectar):");
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'open') {
            console.log('\n✅ [SISTEMA] BOT CONECTADO E ATIVO NO RAILWAY!');
        }

        if (connection === 'close') {
            const motivo = (lastDisconnect.error)?.output?.statusCode;
            if (motivo !== DisconnectReason.loggedOut) {
                console.log("🔄 Conexão oscilou, tentando religar...");
                iniciarBot();
            } else {
                console.log("❌ Você saiu da sessão no celular. Precisa logar de novo.");
            }
        }
    });

    // --- LÓGICA DE MONITORAMENTO DE FRETES ---
    sock.ev.on('messages.upsert', async m => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        // Captura o texto da mensagem (conversa direta ou resposta/legenda)
        const textoRaw = (
            msg.message.conversation || 
            msg.message.extendedTextMessage?.text || 
            msg.message.imageMessage?.caption || ""
        ).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // Remove acentos

        // Lista de locais monitorados
        const locais = [
            "aguas claras", "joquei", "smas-spo", "candangolandia", 
            "lucio costa", "guara 1", "smu", "sobradinho", 
            "smas-sofs", "guara 2"
        ];

        // Verifica se tem o local E as palavras chave (disponível ou frete)
        const temLocal = locais.some(l => textoRaw.includes(l));
        const tem
