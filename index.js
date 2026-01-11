const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ChannelType, 
    PermissionFlagsBits,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActivityType,
    StringSelectMenuBuilder
} = require('discord.js');
require('dotenv').config();

// ========== DATABASE SETUP ==========
const { Pool } = require('pg');
let db = null;
let useDatabase = false;

// Fallback JSON storage
const fs = require('fs');
const dataPath = './data';
if (!fs. existsSync(dataPath)) fs.mkdirSync(dataPath);

function loadJSON(file) {
    const filePath = `${dataPath}/${file}`;
    if (! fs.existsSync(filePath)) {
        const defaultData = file === 'config. json' ? {} :  [];
        fs.writeFileSync(filePath, JSON.stringify(defaultData));
    }
    return JSON.parse(fs.readFileSync(filePath));
}

function saveJSON(file, data) {
    fs.writeFileSync(`${dataPath}/${file}`, JSON.stringify(data, null, 2));
}

// Initialize PostgreSQL
async function initDatabase() {
    if (! process.env.DATABASE_URL) {
        console.log('⚠️ DATABASE_URL tidak ditemukan, menggunakan JSON storage');
        return;
    }
    
    try {
        db = new Pool({ 
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false }
        });
        
        // Test connection
        await db.query('SELECT NOW()');
        console.log('✅ PostgreSQL connected! ');
        useDatabase = true;
        
        // Create tables
        await db. query(`
            CREATE TABLE IF NOT EXISTS config (
                key VARCHAR(255) PRIMARY KEY,
                value TEXT
            );
            
            CREATE TABLE IF NOT EXISTS transactions (
                id SERIAL PRIMARY KEY,
                ticket_id INTEGER UNIQUE,
                buyer_id VARCHAR(255),
                buyer_name VARCHAR(255),
                buyer_tag VARCHAR(255),
                channel_id VARCHAR(255),
                status VARCHAR(50) DEFAULT 'open',
                payment_status VARCHAR(50) DEFAULT 'unpaid',
                product TEXT,
                amount INTEGER DEFAULT 0,
                detail TEXT,
                proof_url TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                paid_at TIMESTAMP,
                completed_at TIMESTAMP,
                closed_at TIMESTAMP,
                closed_by VARCHAR(255)
            );
            
            CREATE TABLE IF NOT EXISTS testimonials (
                id SERIAL PRIMARY KEY,
                ticket_id INTEGER,
                user_id VARCHAR(255),
                username VARCHAR(255),
                user_tag VARCHAR(255),
                user_avatar TEXT,
                product TEXT,
                message TEXT,
                rating INTEGER,
                image_url TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            
            CREATE TABLE IF NOT EXISTS chat_logs (
                id SERIAL PRIMARY KEY,
                ticket_id INTEGER,
                author VARCHAR(255),
                author_id VARCHAR(255),
                content TEXT,
                attachments TEXT,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ Database tables ready!');
    } catch (error) {
        console. error('❌ Database error:', error.message);
        console.log('⚠️ Falling back to JSON storage');
        useDatabase = false;
    }
}

// ========== DATABASE HELPERS ==========
async function getConfig(key) {
    if (useDatabase) {
        const result = await db.query('SELECT value FROM config WHERE key = $1', [key]);
        return result.rows[0]?.value;
    }
    const config = loadJSON('config.json');
    return config[key];
}

async function setConfig(key, value) {
    if (useDatabase) {
        await db.query(
            'INSERT INTO config (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2',
            [key, value]
        );
    } else {
        const config = loadJSON('config.json');
        config[key] = value;
        saveJSON('config. json', config);
    }
}

async function generateTicketId() {
    const lastId = parseInt(await getConfig('lastTicketId') || '1000');
    const newId = lastId + 1;
    await setConfig('lastTicketId', newId. toString());
    return newId;
}

async function saveTransaction(transaction) {
    if (useDatabase) {
        const existing = await db.query('SELECT id FROM transactions WHERE ticket_id = $1', [transaction.ticketId]);
        if (existing.rows. length > 0) {
            await db.query(`
                UPDATE transactions SET 
                    status = $1, payment_status = $2, proof_url = $3, 
                    paid_at = $4, completed_at = $5, closed_at = $6, closed_by = $7
                WHERE ticket_id = $8
            `, [
                transaction.status, transaction.paymentStatus, transaction.proofUrl,
                transaction. paidAt, transaction. completedAt, transaction.closedAt, 
                transaction.closedBy, transaction.ticketId
            ]);
        } else {
            await db.query(`
                INSERT INTO transactions (
                    ticket_id, buyer_id, buyer_name, buyer_tag, channel_id, 
                    status, payment_status, product, amount, detail, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            `, [
                transaction. ticketId, transaction.buyerId, transaction.buyerName,
                transaction.buyerTag, transaction. channelId, transaction.status,
                transaction.paymentStatus, transaction.product, transaction.amount,
                transaction.detail, transaction.createdAt
            ]);
        }
    } else {
        const transactions = loadJSON('transactions.json');
        const index = transactions.findIndex(t => t. ticketId === transaction.ticketId);
        if (index >= 0) {
            transactions[index] = transaction;
        } else {
            transactions.push(transaction);
        }
        saveJSON('transactions.json', transactions);
    }
}

async function getTransaction(ticketId) {
    if (useDatabase) {
        const result = await db.query('SELECT * FROM transactions WHERE ticket_id = $1', [ticketId]);
        if (result.rows[0]) {
            const row = result.rows[0];
            return {
                ticketId: row. ticket_id,
                buyerId: row.buyer_id,
                buyerName: row.buyer_name,
                buyerTag: row. buyer_tag,
                channelId:  row.channel_id,
                status:  row.status,
                paymentStatus:  row.payment_status,
                product:  row.product,
                amount: row. amount,
                detail: row.detail,
                proofUrl: row.proof_url,
                createdAt: row. created_at,
                paidAt:  row.paid_at,
                completedAt: row.completed_at,
                closedAt: row.closed_at,
                closedBy: row.closed_by
            };
        }
        return null;
    }
    const transactions = loadJSON('transactions.json');
    return transactions.find(t => t.ticketId === ticketId);
}

async function getAllTransactions() {
    if (useDatabase) {
        const result = await db. query('SELECT * FROM transactions ORDER BY created_at DESC');
        return result.rows. map(row => ({
            ticketId: row.ticket_id,
            buyerId: row.buyer_id,
            buyerName: row.buyer_name,
            buyerTag: row.buyer_tag,
            channelId: row. channel_id,
            status: row. status,
            paymentStatus: row. payment_status,
            product: row. product,
            amount: row.amount,
            detail: row.detail,
            proofUrl: row.proof_url,
            createdAt: row.created_at,
            paidAt: row. paid_at,
            completedAt:  row.completed_at,
            closedAt: row.closed_at,
            closedBy: row.closed_by
        }));
    }
    return loadJSON('transactions.json');
}

async function getCompletedTransactionsCount() {
    if (useDatabase) {
        const result = await db.query("SELECT COUNT(*) FROM transactions WHERE status = 'completed'");
        return parseInt(result.rows[0].count);
    }
    const transactions = loadJSON('transactions.json');
    return transactions.filter(t => t. status === 'completed').length;
}

async function saveTestimonial(testimonial) {
    if (useDatabase) {
        await db.query(`
            INSERT INTO testimonials (
                ticket_id, user_id, username, user_tag, user_avatar, 
                product, message, rating, image_url, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [
            testimonial.ticketId, testimonial. userId, testimonial. username,
            testimonial.userTag, testimonial.userAvatar, testimonial. product,
            testimonial.message, testimonial.rating, testimonial.imageUrl,
            testimonial. createdAt
        ]);
    } else {
        const testimonials = loadJSON('testimonials.json');
        testimonials.push(testimonial);
        saveJSON('testimonials. json', testimonials);
    }
}

async function getAllTestimonials() {
    if (useDatabase) {
        const result = await db.query('SELECT * FROM testimonials ORDER BY created_at DESC');
        return result.rows.map(row => ({
            ticketId: row. ticket_id,
            userId: row. user_id,
            username: row. username,
            userTag: row.user_tag,
            userAvatar: row.user_avatar,
            product: row.product,
            message: row.message,
            rating:  row.rating,
            imageUrl: row.image_url,
            createdAt: row.created_at
        }));
    }
    return loadJSON('testimonials.json');
}

async function saveChatLog(ticketId, author, authorId, content, attachments) {
    if (useDatabase) {
        await db.query(`
            INSERT INTO chat_logs (ticket_id, author, author_id, content, attachments)
            VALUES ($1, $2, $3, $4, $5)
        `, [ticketId, author, authorId, content, JSON.stringify(attachments)]);
    } else {
        const transactions = loadJSON('transactions.json');
        const transaction = transactions.find(t => t.ticketId === ticketId);
        if (transaction) {
            if (! transaction.chatLog) transaction.chatLog = [];
            transaction.chatLog.push({
                author, authorId, content, attachments, timestamp: new Date().toISOString()
            });
            saveJSON('transactions. json', transactions);
        }
    }
}

async function getChatLogs(ticketId) {
    if (useDatabase) {
        const result = await db.query(
            'SELECT * FROM chat_logs WHERE ticket_id = $1 ORDER BY timestamp ASC',
            [ticketId]
        );
        return result.rows;
    }
    const transactions = loadJSON('transactions.json');
    const transaction = transactions.find(t => t.ticketId === ticketId);
    return transaction?. chatLog || [];
}

// ========== DISCORD CLIENT ==========
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// ========== PAYMENT METHODS ==========
const paymentMethods = [
    { name: 'Bank Jago', emoji: '🟣', number: '104004201095', holder: 'Adrianus Indraprasta Dwicaksana' },
    { name: 'BCA', emoji: '🔵', number: '2802312092', holder: 'Adrianus Indraprasta Dwicaksana' },
    { name:  'BluBCA', emoji: '🔵', number: '002460031049', holder: 'Adrianus Indraprasta Dwicaksana' },
    { name:  'GoPay', emoji: '💚', number: '082320010090', holder: 'Adrianus Indraprasta Dwicaksana' },
    { name:  'OVO', emoji: '💜', number: '082320010090', holder: 'Adrianus Indraprasta Dwicaksana' },
    { name: 'QRIS', emoji: '📱', number: 'ADR14NSTORE', holder: 'Scan QR Code di bawah' }
];

// ========== HELPER FUNCTIONS ==========
function isAdmin(member) {
    return member.permissions.has(PermissionFlagsBits.Administrator) || 
           member.roles.cache.has(process.env.ADMIN_ROLE_ID);
}

function createPaymentEmbed() {
    const embed = new EmbedBuilder()
        .setTitle('💳 Metode Pembayaran ADR14N Store')
        .setColor('#FFD700');

    let description = '**🏦 Transfer Bank:**\n\n';
    paymentMethods.filter(p => p.name.includes('Bank') || p.name.includes('BCA') || p.name. includes('Blu')).forEach(p => {
        description += `${p.emoji} **${p.name}**\n┣ 📝 No.  Rek:  \`${p.number}\`\n┗ 👤 A. N:  ${p.holder}\n\n`;
    });

    description += '**📱 E-Wallet:**\n\n';
    paymentMethods.filter(p => p. name === 'GoPay' || p.name === 'OVO').forEach(p => {
        description += `${p.emoji} **${p.name}**\n┣ 📱 No. HP: \`${p.number}\`\n┗ 👤 A.N:  ${p.holder}\n\n`;
    });

    description += '**📱 QRIS (Semua Aplikasi):**\n📱 **ADR14NSTORE**\n┗ Scan QR Code di bawah\n';
    embed.setDescription(description);
    embed.setFooter({ text: '📸 Kirim bukti pembayaran setelah transfer' });

    if (process.env.QRIS_IMAGE_URL) {
        embed.setImage(process.env. QRIS_IMAGE_URL);
    }

    return embed;
}

// ========== UPDATE BOT STATUS ==========
async function updateBotStatus() {
    try {
        const completedCount = await getCompletedTransactionsCount();
        let testimoniCount = 0;
        
        // Count messages in testimoni channel
        const testimoniChannelId = process.env. TESTIMONI_CHANNEL_ID;
        if (testimoniChannelId) {
            try {
                const channel = await client.channels.fetch(testimoniChannelId);
                if (channel) {
                    const messages = await channel. messages. fetch({ limit: 100 });
                    testimoniCount = messages. size;
                }
            } catch (e) {
                const testimonials = await getAllTestimonials();
                testimoniCount = testimonials. length;
            }
        } else {
            const testimonials = await getAllTestimonials();
            testimoniCount = testimonials.length;
        }
        
        client.user.setActivity(
            `⭐ ${testimoniCount} Testimoni | ✅ ${completedCount} Transaksi`, 
            { type: ActivityType.Watching }
        );
    } catch (error) {
        console.error('Error updating status:', error. message);
    }
}

// ========== SEND LOG TO CHANNEL ==========
async function sendTransactionLog(transaction, action, admin = null, proofUrl = null) {
    try {
        const logChannelId = await getConfig('logChannelId');
        if (!logChannelId) return;
        
        const channel = await client.channels.fetch(logChannelId);
        if (!channel) return;
        
        const statusEmoji = action === 'completed' ? '✅' : action === 'cancelled' ? '❌' : '📝';
        const statusText = action === 'completed' ? 'Selesai' : action === 'cancelled' ? 'Dibatalkan' : 'Update';
        
        const embed = new EmbedBuilder()
            .setTitle(`${statusEmoji} Transaksi #${transaction.ticketId} ${statusText}`)
            .setColor(action === 'completed' ? '#00FF00' : action === 'cancelled' ? '#FF0000' : '#FFA500')
            .addFields(
                { name:  '👤 Buyer', value: `${transaction.buyerTag}\n<@${transaction.buyerId}>`, inline: true },
                { name: '📦 Produk', value:  transaction.product || '-', inline: true },
                { name:  '💰 Harga', value: `Rp${(transaction.amount || 0).toLocaleString('id-ID')}`, inline: true },
                { name:  '📅 Dibuat', value: new Date(transaction.createdAt).toLocaleString('id-ID'), inline: true }
            )
            .setTimestamp();
        
        if (admin) {
            embed.addFields({ name: '👮 Admin', value:  admin, inline: true });
        }
        
        if (action === 'completed' && transaction.completedAt) {
            embed.addFields({ name: '✅ Selesai', value:  new Date(transaction.completedAt).toLocaleString('id-ID'), inline: true });
        }
        
        if (proofUrl) {
            embed.setImage(proofUrl);
            embed.addFields({ name: '📸 Bukti', value: 'Lihat gambar di bawah', inline:  false });
        }
        
        await channel.send({ embeds: [embed] });
    } catch (error) {
        console.error('Error sending log:', error.message);
    }
}

// ========== POST TESTIMONIAL TO CHANNEL ==========
async function postTestimonialToChannel(testimonial) {
    try {
        const channelId = process.env.TESTIMONI_CHANNEL_ID;
        if (!channelId) return;
        
        const channel = await client.channels.fetch(channelId);
        if (!channel) return;
        
        const stars = '⭐'.repeat(testimonial.rating);
        
        const embed = new EmbedBuilder()
            .setColor('#FFD700')
            .setDescription(`${stars}\n\n👤 **${testimonial.username}**\n📦 Produk: ${testimonial.product || '-'}\n\n"${testimonial.message}"`)
            .setFooter({ text: `📅 ${new Date(testimonial.createdAt).toLocaleDateString('id-ID')}` });
        
        if (testimonial.userAvatar) {
            embed.setThumbnail(testimonial.userAvatar);
        }
        
        if (testimonial.imageUrl) {
            embed.setImage(testimonial.imageUrl);
        }
        
        await channel.send({ embeds: [embed] });
    } catch (error) {
        console.error('Error posting testimonial:', error.message);
    }
}

// ========== PENDING TESTIMONIALS ==========
const pendingTestimonials = new Map();
const pendingProofs = new Map();

// ========== BOT READY ==========
client.once('ready', async () => {
    console.log(`✅ Bot ${client.user.tag} sudah online! `);
    console.log(`🆔 Bot ID: ${client. user.id}`);
    
    // Initialize database
    await initDatabase();
    
    // Update status
    await updateBotStatus();
    
    // Update status every 5 minutes
    setInterval(updateBotStatus, 5 * 60 * 1000);
    
    const guild = client.guilds.cache.get(process. env.GUILD_ID);
    if (guild) {
        await guild.commands.set([
            { name: 'setup-ticket', description: 'Setup panel ticket transaksi (Admin only)' },
            { 
                name: 'setup-log', 
                description: 'Setup channel untuk log transaksi (Admin only)',
                options: [{ name: 'channel', description: 'Channel untuk log (kosongkan untuk auto-create)', type: 7, required: false }]
            },
            { name:  'riwayat', description: 'Lihat semua riwayat transaksi (Admin only)' },
            { 
                name: 'riwayat-user', 
                description: 'Lihat riwayat transaksi user tertentu (Admin only)',
                options: [{ name: 'user', description: 'User yang ingin dilihat riwayatnya', type: 6, required: true }]
            },
            { name:  'pembayaran', description: 'Lihat daftar metode pembayaran' },
            { name: 'testimoni', description: 'Lihat jumlah dan daftar testimoni' },
            { 
                name: 'tambah-testimoni', 
                description:  'Tambah testimoni baru (Admin only)',
                options: [
                    { name:  'user', description: 'User yang memberikan testimoni', type: 6, required: true },
                    { name: 'pesan', description: 'Isi testimoni', type: 3, required: true },
                    { name: 'rating', description: 'Rating 1-5', type: 4, required: true, choices: [
                        { name:  '⭐', value: 1 }, { name: '⭐⭐', value:  2 }, { name: '⭐⭐⭐', value:  3 },
                        { name: '⭐⭐⭐⭐', value: 4 }, { name: '⭐⭐⭐⭐⭐', value: 5 }
                    ]}
                ]
            },
            { 
                name: 'log-transaksi', 
                description: 'Lihat log chat dari transaksi tertentu (Admin only)',
                options:  [{ name: 'ticket_id', description: 'ID Ticket (contoh:  1001)', type: 4, required: true }]
            },
            { name: 'stats', description: 'Lihat statistik transaksi (Admin only)' }
        ]);
        console.log('✅ Slash commands terdaftar! ');
    }
});

// ========== SAVE CHAT LOG & DETECT PAYMENT PROOF ==========
client.on('messageCreate', async message => {
    if (message.author. bot) return;
    
    if (message.channel. name && message.channel.name.startsWith('ticket-')) {
        const ticketId = parseInt(message.channel. name.split('-')[1]);
        
        // Save chat log
        await saveChatLog(
            ticketId,
            message.author.username,
            message. author.id,
            message. content,
            message.attachments. map(a => a.url)
        );
        
        // Check if waiting for payment proof
        if (pendingProofs. has(ticketId)) {
            const proofData = pendingProofs.get(ticketId);
            
            // Check if sender is the buyer
            if (message.author. id === proofData.buyerId && message.attachments.size > 0) {
                const proofUrl = message.attachments. first().url;
                
                // Update transaction
                const transaction = await getTransaction(ticketId);
                if (transaction) {
                    transaction.proofUrl = proofUrl;
                    transaction.paymentStatus = 'pending_verification';
                    await saveTransaction(transaction);
                }
                
                pendingProofs.delete(ticketId);
                
                const embed = new EmbedBuilder()
                    .setTitle('📸 Bukti Pembayaran Diterima!')
                    .setDescription(`Bukti pembayaran dari ${message.author} sudah diterima.\n\n⏳ **Menunggu verifikasi admin...**`)
                    .setImage(proofUrl)
                    .setColor('#FFA500')
                    .setTimestamp();
                
                const adminButtons = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('admin_confirm_payment')
                            .setLabel('✅ Konfirmasi Pembayaran')
                            .setStyle(ButtonStyle.Success),
                        new ButtonBuilder()
                            .setCustomId('admin_reject_payment')
                            .setLabel('❌ Tolak Pembayaran')
                            .setStyle(ButtonStyle. Danger)
                    );
                
                await message.channel. send({ 
                    content: `<@&${process.env.ADMIN_ROLE_ID}> - Mohon verifikasi pembayaran! `,
                    embeds: [embed], 
                    components: [adminButtons] 
                });
            }
        }
        
        // Check if waiting for testimonial image
        if (pendingTestimonials.has(message.author.id)) {
            const testiData = pendingTestimonials.get(message.author.id);
            
            if (message.content.toLowerCase() === 'skip') {
                // Save without image
                await saveTestimonial(testiData);
                await postTestimonialToChannel(testiData);
                pendingTestimonials. delete(message.author.id);
                
                await message.reply('✅ Testimoni berhasil disimpan!  Terima kasih atas feedback Anda!  🙏');
            } else if (message.attachments.size > 0) {
                // Save with image
                testiData.imageUrl = message.attachments.first().url;
                await saveTestimonial(testiData);
                await postTestimonialToChannel(testiData);
                pendingTestimonials.delete(message.author.id);
                
                await message.reply('✅ Testimoni dengan gambar berhasil disimpan! Terima kasih atas feedback Anda!  🙏');
            }
        }
    }
});

// ========== INTERACTIONS ==========
client. on('interactionCreate', async interaction => {
    try {
        // ==================== SETUP TICKET PANEL ====================
        if (interaction.isChatInputCommand() && interaction.commandName === 'setup-ticket') {
            if (! isAdmin(interaction.member)) {
                return interaction.reply({ content: '❌ Hanya admin yang bisa menggunakan command ini! ', ephemeral:  true });
            }

            const embed = new EmbedBuilder()
                .setTitle('🎫 ADR14N STORE - Sistem Transaksi')
                .setDescription(
                    '**Selamat datang di ADR14N Store!**\n\n' +
                    '📦 **Layanan Kami:**\n' +
                    '• Jual Steam Key & Game Original\n' +
                    '• Windows & Office License\n' +
                    '• Jasa Digital Lainnya\n\n' +
                    '✨ **Keunggulan:**\n' +
                    '• Proses Cepat\n' +
                    '• Harga Bersaing\n' +
                    '• Garansi Produk\n\n' +
                    '👇 **Klik tombol di bawah untuk membuat ticket! **'
                )
                .setColor('#5865F2')
                .setThumbnail(interaction.guild.iconURL())
                .setFooter({ text: 'ADR14N Store • Trusted Seller' })
                .setTimestamp();

            const button = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder().setCustomId('open_ticket_modal').setLabel('📩 Buat Ticket').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('view_payment_public').setLabel('💳 Metode Pembayaran').setStyle(ButtonStyle.Secondary)
                );

            await interaction.channel.send({ embeds: [embed], components: [button] });
            await interaction.reply({ content: '✅ Panel ticket berhasil dibuat! ', ephemeral:  true });
        }

        // ==================== SETUP LOG CHANNEL ====================
        if (interaction.isChatInputCommand() && interaction.commandName === 'setup-log') {
            if (!isAdmin(interaction.member)) {
                return interaction.reply({ content: '❌ Hanya admin yang bisa menggunakan command ini! ', ephemeral:  true });
            }

            let channel = interaction.options.getChannel('channel');
            
            if (!channel) {
                // Auto create channel
                channel = await interaction.guild.channels. create({
                    name: 'log-transaksi',
                    type: ChannelType.GuildText,
                    permissionOverwrites: [
                        { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                        { id: process.env.ADMIN_ROLE_ID, allow: [PermissionFlagsBits. ViewChannel, PermissionFlagsBits.ReadMessageHistory] },
                        { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
                    ]
                });
            }
            
            await setConfig('logChannelId', channel.id);
            
            const embed = new EmbedBuilder()
                .setTitle('📋 Log Transaksi ADR14N Store')
                .setDescription('Channel ini akan mencatat semua transaksi yang selesai atau dibatalkan.')
                .setColor('#5865F2')
                .setTimestamp();
            
            await channel.send({ embeds: [embed] });
            await interaction. reply({ content: `✅ Channel log transaksi berhasil diset ke ${channel}!`, ephemeral: true });
        }

        // ==================== VIEW PAYMENT PUBLIC ====================
        if (interaction.isButton() && interaction.customId === 'view_payment_public') {
            await interaction.reply({ embeds: [createPaymentEmbed()], ephemeral:  true });
        }

        // ==================== OPEN MODAL FORM ====================
        if (interaction.isButton() && interaction.customId === 'open_ticket_modal') {
            const transactions = await getAllTransactions();
            const existingTicket = transactions.find(t => t. buyerId === interaction.user. id && t.status === 'open');
            
            if (existingTicket) {
                return interaction.reply({ content: `❌ Anda sudah memiliki ticket aktif:  <#${existingTicket.channelId}>`, ephemeral: true });
            }

            const modal = new ModalBuilder().setCustomId('ticket_form').setTitle('📝 Form Pemesanan ADR14N Store');

            const produkInput = new TextInputBuilder()
                .setCustomId('produk_input').setLabel('Produk/Jasa yang ingin dibeli')
                .setPlaceholder('Contoh: Steam Key GTA V, Windows 11 Pro, dll')
                .setStyle(TextInputStyle. Short).setRequired(true).setMaxLength(100);

            const hargaInput = new TextInputBuilder()
                .setCustomId('harga_input').setLabel('Budget/Harga (angka saja, dalam Rupiah)')
                .setPlaceholder('Contoh: 150000')
                .setStyle(TextInputStyle. Short).setRequired(true).setMaxLength(15);

            const detailInput = new TextInputBuilder()
                .setCustomId('detail_input').setLabel('Detail tambahan (opsional)')
                .setPlaceholder('Contoh:  Region Indonesia, butuh cepat, dll')
                .setStyle(TextInputStyle. Paragraph).setRequired(false).setMaxLength(500);

            modal.addComponents(
                new ActionRowBuilder().addComponents(produkInput),
                new ActionRowBuilder().addComponents(hargaInput),
                new ActionRowBuilder().addComponents(detailInput)
            );

            await interaction.showModal(modal);
        }

        // ==================== HANDLE MODAL SUBMIT ====================
        if (interaction.isModalSubmit() && interaction.customId === 'ticket_form') {
            await interaction. deferReply({ ephemeral: true });

            const produk = interaction.fields.getTextInputValue('produk_input');
            const hargaRaw = interaction.fields. getTextInputValue('harga_input');
            const detail = interaction.fields. getTextInputValue('detail_input') || '-';
            const harga = parseInt(hargaRaw. replace(/\D/g, '')) || 0;

            const ticketId = await generateTicketId();
            const ticketName = `ticket-${ticketId}`;
            
            const ticketChannel = await interaction.guild.channels. create({
                name:  ticketName,
                type: ChannelType.GuildText,
                permissionOverwrites:  [
                    { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                    { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] },
                    { id: process.env. ADMIN_ROLE_ID, allow:  [PermissionFlagsBits.ViewChannel, PermissionFlagsBits. SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.AttachFiles] },
                    { id: client.user. id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits. ReadMessageHistory, PermissionFlagsBits.ManageChannels, PermissionFlagsBits. AttachFiles] }
                ]
            });

            const ticketEmbed = new EmbedBuilder()
                .setTitle(`🎫 Ticket #${ticketId}`)
                .setDescription(`Halo ${interaction.user}! Pesanan Anda telah diterima.\n\nAdmin akan segera merespons pesanan Anda.\n───────────────────`)
                .addFields(
                    { name: '👤 Buyer', value: `${interaction.user.tag}`, inline: true },
                    { name: '🆔 Ticket ID', value: `${ticketId}`, inline: true },
                    { name: '📅 Dibuat', value: `<t:${Math. floor(Date.now()/1000)}:F>`, inline: true },
                    { name: '📦 Produk/Jasa', value: produk, inline: false },
                    { name: '💰 Budget/Harga', value: `Rp${harga.toLocaleString('id-ID')}`, inline: true },
                    { name: '📝 Detail', value: detail, inline: false }
                )
                .setColor('#00FF00')
                .setThumbnail(interaction.user.displayAvatarURL())
                .setFooter({ text: 'ADR14N Store • Gunakan tombol di bawah' })
                .setTimestamp();

            // BUYER BUTTONS
            const buyerButtons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder().setCustomId('show_payment').setLabel('💳 Metode Pembayaran').setStyle(ButtonStyle. Secondary),
                    new ButtonBuilder().setCustomId('confirm_paid').setLabel('✅ Sudah Bayar').setStyle(ButtonStyle.Success)
                );

            // ADMIN BUTTONS
            const adminButtons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder().setCustomId('close_ticket').setLabel('🔒 Tutup Ticket').setStyle(ButtonStyle. Danger)
                );

            await ticketChannel. send({ 
                content: `${interaction.user} | <@&${process.env. ADMIN_ROLE_ID}>`, 
                embeds: [ticketEmbed], 
                components: [buyerButtons, adminButtons] 
            });
            
            await interaction. editReply({ 
                content: `✅ Ticket berhasil dibuat!\n\n🎫 **Ticket ID:** \`${ticketId}\`\n📦 **Produk:** ${produk}\n💰 **Harga:** Rp${harga. toLocaleString('id-ID')}\n\n👉 Klik di sini:  ${ticketChannel}` 
            });

            // Save transaction
            await saveTransaction({
                ticketId,
                buyerId: interaction.user.id,
                buyerName: interaction.user. username,
                buyerTag: interaction.user. tag,
                channelId: ticketChannel.id,
                status: 'open',
                paymentStatus: 'unpaid',
                product: produk,
                amount: harga,
                detail,
                createdAt: new Date().toISOString()
            });
        }

        // ==================== SHOW PAYMENT ====================
        if (interaction.isButton() && interaction.customId === 'show_payment') {
            await interaction.reply({ embeds: [createPaymentEmbed()], ephemeral: true });
        }

        // ==================== CONFIRM PAID (BUYER) ====================
        if (interaction.isButton() && interaction.customId === 'confirm_paid') {
            const ticketId = parseInt(interaction.channel.name.split('-')[1]);
            const transaction = await getTransaction(ticketId);
            
            if (! transaction) {
                return interaction.reply({ content: '❌ Transaksi tidak ditemukan!', ephemeral: true });
            }
            
            if (transaction.buyerId !== interaction.user.id) {
                return interaction.reply({ content: '❌ Hanya buyer yang bisa mengkonfirmasi pembayaran!', ephemeral: true });
            }
            
            if (transaction.paymentStatus === 'pending_verification') {
                return interaction.reply({ content: '⏳ Pembayaran Anda sedang menunggu verifikasi admin. ', ephemeral:  true });
            }

            // Set pending proof
            pendingProofs.set(ticketId, {
                buyerId: interaction.user.id,
                timestamp: Date.now()
            });

            const embed = new EmbedBuilder()
                .setTitle('📸 Kirim Bukti Pembayaran')
                .setDescription(
                    `${interaction.user} mengkonfirmasi sudah melakukan pembayaran.\n\n` +
                    '**📸 Silakan kirim screenshot bukti transfer di chat ini.**\n\n' +
                    '⏳ Anda memiliki waktu 10 menit untuk mengirim bukti.'
                )
                .setColor('#FFA500')
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });

            // Auto timeout after 10 minutes
            setTimeout(() => {
                if (pendingProofs.has(ticketId)) {
                    pendingProofs.delete(ticketId);
                }
            }, 10 * 60 * 1000);
        }

        // ==================== ADMIN CONFIRM PAYMENT ====================
        if (interaction. isButton() && interaction.customId === 'admin_confirm_payment') {
            if (!isAdmin(interaction.member)) {
                return interaction.reply({ content: '❌ Hanya admin yang bisa mengkonfirmasi pembayaran!', ephemeral: true });
            }

            const ticketId = parseInt(interaction.channel.name.split('-')[1]);
            const transaction = await getTransaction(ticketId);
            
            if (!transaction) {
                return interaction. reply({ content: '❌ Transaksi tidak ditemukan!', ephemeral: true });
            }

            // Update transaction
            transaction.status = 'completed';
            transaction. paymentStatus = 'paid';
            transaction. completedAt = new Date().toISOString();
            transaction.closedBy = interaction.user. username;
            await saveTransaction(transaction);

            // Send log
            await sendTransactionLog(transaction, 'completed', interaction.user.tag, transaction.proofUrl);

            // Update bot status
            await updateBotStatus();

            const successEmbed = new EmbedBuilder()
                .setTitle('✅ Pembayaran Dikonfirmasi!')
                .setDescription(
                    `Transaksi **#${ticketId}** berhasil diselesaikan!\n\n` +
                    `👤 Buyer: <@${transaction.buyerId}>\n` +
                    `📦 Produk: ${transaction.product}\n` +
                    `💰 Total: Rp${transaction.amount.toLocaleString('id-ID')}\n\n` +
                    'Terima kasih telah berbelanja di **ADR14N Store**!  🎉'
                )
                .setColor('#00FF00')
                .setTimestamp();

            // Ask for testimonial
            const testiButtons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('give_testimonial')
                        .setLabel('⭐ Beri Testimoni')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('skip_testimonial')
                        .setLabel('❌ Lewati')
                        .setStyle(ButtonStyle. Secondary)
                );

            await interaction.update({ embeds: [successEmbed], components: [testiButtons] });
        }

        // ==================== ADMIN REJECT PAYMENT ====================
        if (interaction.isButton() && interaction.customId === 'admin_reject_payment') {
            if (!isAdmin(interaction.member)) {
                return interaction.reply({ content: '❌ Hanya admin yang bisa menolak pembayaran!', ephemeral: true });
            }

            const modal = new ModalBuilder()
                .setCustomId('reject_reason_modal')
                .setTitle('❌ Alasan Penolakan');

            const reasonInput = new TextInputBuilder()
                .setCustomId('reject_reason')
                .setLabel('Alasan penolakan pembayaran')
                .setPlaceholder('Contoh: Bukti tidak jelas, nominal tidak sesuai, dll')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
            await interaction.showModal(modal);
        }

        // ==================== HANDLE REJECT REASON ====================
        if (interaction.isModalSubmit() && interaction.customId === 'reject_reason_modal') {
            const reason = interaction.fields.getTextInputValue('reject_reason');
            const ticketId = parseInt(interaction.channel. name.split('-')[1]);
            const transaction = await getTransaction(ticketId);

            if (transaction) {
                transaction.paymentStatus = 'rejected';
                await saveTransaction(transaction);
            }

            const embed = new EmbedBuilder()
                .setTitle('❌ Pembayaran Ditolak')
                .setDescription(
                    `Pembayaran untuk transaksi **#${ticketId}** ditolak.\n\n` +
                    `**Alasan:** ${reason}\n\n` +
                    'Silakan kirim ulang bukti pembayaran yang valid.'
                )
                .setColor('#FF0000')
                .setTimestamp();

            // Re-enable payment button
            const retryButtons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder().setCustomId('confirm_paid').setLabel('✅ Kirim Ulang Bukti').setStyle(ButtonStyle.Success)
                );

            await interaction.update({ embeds: [embed], components: [retryButtons] });
        }

        // ==================== GIVE TESTIMONIAL ====================
        if (interaction.isButton() && interaction.customId === 'give_testimonial') {
            const ticketId = parseInt(interaction.channel.name.split('-')[1]);
            const transaction = await getTransaction(ticketId);

            const modal = new ModalBuilder()
                .setCustomId('testimonial_form')
                .setTitle('⭐ Form Testimoni');

            const ratingInput = new TextInputBuilder()
                .setCustomId('rating_input')
                .setLabel('Rating (ketik angka 1-5)')
                .setPlaceholder('5')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(1);

            const messageInput = new TextInputBuilder()
                .setCustomId('message_input')
                .setLabel('Pesan testimoni')
                .setPlaceholder('Contoh:  Mantap!  Proses cepat, recommended seller!')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setMaxLength(500);

            modal.addComponents(
                new ActionRowBuilder().addComponents(ratingInput),
                new ActionRowBuilder().addComponents(messageInput)
            );

            await interaction.showModal(modal);
        }

        // ==================== HANDLE TESTIMONIAL FORM ====================
        if (interaction.isModalSubmit() && interaction.customId === 'testimonial_form') {
            const ratingRaw = interaction.fields.getTextInputValue('rating_input');
            const message = interaction.fields. getTextInputValue('message_input');
            const rating = Math.min(5, Math.max(1, parseInt(ratingRaw) || 5));

            const ticketId = parseInt(interaction.channel.name.split('-')[1]);
            const transaction = await getTransaction(ticketId);

            const testimonial = {
                ticketId,
                userId: interaction.user. id,
                username: interaction.user. username,
                userTag: interaction.user.tag,
                userAvatar: interaction.user.displayAvatarURL(),
                product: transaction?. product || '-',
                message,
                rating,
                imageUrl: null,
                createdAt: new Date().toISOString()
            };

            // Store pending testimonial
            pendingTestimonials.set(interaction.user.id, testimonial);

            const embed = new EmbedBuilder()
                .setTitle('📸 Tambah Gambar? ')
                .setDescription(
                    `${'⭐'. repeat(rating)}\n\n` +
                    `"${message}"\n\n` +
                    '**📸 Mau tambah gambar? **\n' +
                    'Kirim gambar dalam 60 detik, atau ketik `skip` untuk lewati.'
                )
                .setColor('#FFD700')
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });

            // Auto save after 60 seconds if no image
            setTimeout(async () => {
                if (pendingTestimonials.has(interaction.user.id)) {
                    const testi = pendingTestimonials.get(interaction. user.id);
                    await saveTestimonial(testi);
                    await postTestimonialToChannel(testi);
                    pendingTestimonials. delete(interaction.user.id);
                    
                    try {
                        await interaction.channel.send(`✅ Testimoni dari ${interaction.user} berhasil disimpan! `);
                    } catch (e) {}
                }
            }, 60 * 1000);
        }

        // ==================== SKIP TESTIMONIAL ====================
        if (interaction.isButton() && interaction.customId === 'skip_testimonial') {
            const embed = new EmbedBuilder()
                .setTitle('✅ Transaksi Selesai!')
                .setDescription('Terima kasih telah berbelanja di **ADR14N Store**! 🎉\n\nChannel akan ditutup dalam 10 detik.. .')
                .setColor('#00FF00')
                .setTimestamp();

            await interaction.update({ embeds: [embed], components: [] });
            
            setTimeout(() => {
                interaction.channel.delete().catch(console.error);
            }, 10000);
        }

        // ==================== CLOSE TICKET ====================
        if (interaction. isButton() && interaction.customId === 'close_ticket') {
            if (!isAdmin(interaction.member)) {
                return interaction.reply({ content: '❌ Hanya admin yang bisa menutup ticket!', ephemeral: true });
            }

            const confirmEmbed = new EmbedBuilder()
                .setTitle('⚠️ Konfirmasi Tutup Ticket')
                .setDescription('Pilih aksi yang ingin dilakukan:\n\n✅ **Selesai** - Transaksi berhasil\n❌ **Batal** - Transaksi dibatalkan\n🔙 **Kembali** - Batalkan penutupan')
                .setColor('#FFA500');

            const confirmButtons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder().setCustomId('complete_transaction').setLabel('✅ Selesai').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId('cancel_transaction').setLabel('❌ Batalkan').setStyle(ButtonStyle.Danger),
                    new ButtonBuilder().setCustomId('back_close').setLabel('🔙 Kembali').setStyle(ButtonStyle.Secondary)
                );

            await interaction.reply({ embeds: [confirmEmbed], components:  [confirmButtons] });
        }

        // ==================== COMPLETE TRANSACTION ====================
        if (interaction. isButton() && interaction.customId === 'complete_transaction') {
            if (!isAdmin(interaction.member)) {
                return interaction.reply({ content: '❌ Hanya admin! ', ephemeral:  true });
            }

            const ticketId = parseInt(interaction.channel.name. split('-')[1]);
            const transaction = await getTransaction(ticketId);
            
            if (transaction) {
                transaction.status = 'completed';
                transaction.paymentStatus = 'paid';
                transaction.completedAt = new Date().toISOString();
                transaction.closedBy = interaction.user. username;
                await saveTransaction(transaction);

                await sendTransactionLog(transaction, 'completed', interaction.user. tag);
                await updateBotStatus();

                const embed = new EmbedBuilder()
                    .setTitle('✅ Transaksi Selesai!')
                    . setDescription(`Transaksi **#${ticketId}** berhasil diselesaikan!\n\nTerima kasih telah berbelanja di **ADR14N Store** 🎉`)
                    .addFields(
                        { name: '👤 Buyer', value: transaction.buyerTag, inline: true },
                        { name: '📦 Produk', value: transaction. product, inline: true },
                        { name: '💰 Total', value: `Rp${transaction. amount.toLocaleString('id-ID')}`, inline: true }
                    )
                    .setColor('#00FF00')
                    .setFooter({ text: 'Channel akan dihapus dalam 10 detik.. .' })
                    .setTimestamp();

                await interaction. update({ embeds:  [embed], components: [] });
                setTimeout(() => interaction.channel.delete().catch(console.error), 10000);
            }
        }

        // ==================== CANCEL TRANSACTION ====================
        if (interaction.isButton() && interaction.customId === 'cancel_transaction') {
            if (!isAdmin(interaction.member)) {
                return interaction.reply({ content: '❌ Hanya admin! ', ephemeral:  true });
            }

            const ticketId = parseInt(interaction.channel.name.split('-')[1]);
            const transaction = await getTransaction(ticketId);
            
            if (transaction) {
                transaction.status = 'cancelled';
                transaction. closedAt = new Date().toISOString();
                transaction.closedBy = interaction.user.username;
                await saveTransaction(transaction);

                await sendTransactionLog(transaction, 'cancelled', interaction.user.tag);

                const embed = new EmbedBuilder()
                    .setTitle('❌ Transaksi Dibatalkan')
                    .setDescription(`Transaksi **#${ticketId}** telah dibatalkan. `)
                    .addFields(
                        { name: '👤 Buyer', value: transaction.buyerTag, inline:  true },
                        { name: '📦 Produk', value: transaction. product, inline: true }
                    )
                    .setColor('#FF0000')
                    .setFooter({ text:  'Channel akan dihapus dalam 10 detik...' })
                    .setTimestamp();

                await interaction.update({ embeds: [embed], components: [] });
                setTimeout(() => interaction.channel.delete().catch(console.error), 10000);
            }
        }

        // ==================== BACK CLOSE ====================
        if (interaction.isButton() && interaction.customId === 'back_close') {
            await interaction.message.delete().catch(() => {});
        }

        // ==================== RIWAYAT ====================
        if (interaction.isChatInputCommand() && interaction.commandName === 'riwayat') {
            if (!isAdmin(interaction.member)) {
                return interaction.reply({ content: '❌ Hanya admin!', ephemeral: true });
            }

            const transactions = await getAllTransactions();
            if (transactions.length === 0) {
                return interaction.reply({ content: '📭 Belum ada riwayat transaksi. ', ephemeral:  true });
            }

            const completed = transactions.filter(t => t.status === 'completed').length;
            const open = transactions.filter(t => t.status === 'open').length;
            const cancelled = transactions.filter(t => t. status === 'cancelled').length;
            const totalRevenue = transactions.filter(t => t. status === 'completed' && t.amount).reduce((sum, t) => sum + t.amount, 0);

            const embed = new EmbedBuilder()
                .setTitle('📊 Riwayat Transaksi ADR14N Store')
                .setColor('#5865F2')
                .addFields(
                    { name: '📈 Total', value: `${transactions.length}`, inline: true },
                    { name:  '✅ Selesai', value:  `${completed}`, inline: true },
                    { name:  '⏳ Aktif', value: `${open}`, inline: true },
                    { name: '❌ Batal', value: `${cancelled}`, inline: true },
                    { name: '💰 Pendapatan', value:  `Rp${totalRevenue.toLocaleString('id-ID')}`, inline: true }
                );

            let description = '\n**📋 Transaksi Terakhir:**\n\n';
            transactions.slice(0, 10).forEach(t => {
                const statusEmoji = t.status === 'completed' ? '✅' : t.status === 'open' ? '⏳' : '❌';
                description += `${statusEmoji} **#${t.ticketId}** - ${t.buyerTag}\n┗ 📦 ${t.product || '-'} | 💰 Rp${(t.amount || 0).toLocaleString('id-ID')}\n\n`;
            });

            embed.setDescription(description);
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // ==================== RIWAYAT USER ====================
        if (interaction.isChatInputCommand() && interaction.commandName === 'riwayat-user') {
            if (!isAdmin(interaction.member)) {
                return interaction. reply({ content: '❌ Hanya admin!', ephemeral: true });
            }

            const user = interaction.options.getUser('user');
            const transactions = await getAllTransactions();
            const userTransactions = transactions. filter(t => t.buyerId === user.id);

            if (userTransactions.length === 0) {
                return interaction.reply({ content: `📭 **${user.tag}** belum memiliki riwayat transaksi.`, ephemeral: true });
            }

            const embed = new EmbedBuilder()
                .setTitle(`📋 Riwayat:  ${user.tag}`)
                .setThumbnail(user.displayAvatarURL())
                .setColor('#5865F2');

            let description = '';
            userTransactions.forEach(t => {
                const statusEmoji = t.status === 'completed' ? '✅' : t. status === 'open' ? '⏳' : '❌';
                const date = new Date(t.createdAt).toLocaleDateString('id-ID');
                description += `${statusEmoji} **#${t.ticketId}** - ${date}\n┣ 📦 ${t.product || '-'}\n┗ 💰 Rp${(t.amount || 0).toLocaleString('id-ID')}\n\n`;
            });

            embed.setDescription(description).setFooter({ text: `Total: ${userTransactions.length} transaksi` });
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // ==================== LOG TRANSAKSI ====================
        if (interaction. isChatInputCommand() && interaction.commandName === 'log-transaksi') {
            if (!isAdmin(interaction.member)) {
                return interaction.reply({ content: '❌ Hanya admin!', ephemeral: true });
            }

            const ticketId = interaction.options.getInteger('ticket_id');
            const transaction = await getTransaction(ticketId);

            if (! transaction) {
                return interaction.reply({ content: `❌ Ticket #${ticketId} tidak ditemukan. `, ephemeral: true });
            }

            const chatLogs = await getChatLogs(ticketId);

            const embed = new EmbedBuilder()
                .setTitle(`📝 Log - Ticket #${ticketId}`)
                .setColor('#5865F2')
                .addFields(
                    { name: '👤 Buyer', value: transaction.buyerTag, inline:  true },
                    { name: '📦 Produk', value: transaction. product || '-', inline: true },
                    { name: '💰 Harga', value:  `Rp${(transaction.amount || 0).toLocaleString('id-ID')}`, inline: true },
                    { name: '📊 Status', value: transaction. status, inline: true }
                );

            if (chatLogs && chatLogs.length > 0) {
                let chatText = '';
                chatLogs.slice(-15).forEach(msg => {
                    const time = new Date(msg.timestamp).toLocaleTimeString('id-ID');
                    const content = msg.content || '[attachment]';
                    chatText += `**[${time}] ${msg.author}:** ${content}\n`;
                });
                if (chatText. length > 1000) chatText = chatText.slice(-1000);
                embed.setDescription(chatText);
            } else {
                embed.setDescription('*Tidak ada log chat.*');
            }

            await interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // ==================== STATS ====================
        if (interaction.isChatInputCommand() && interaction.commandName === 'stats') {
            if (!isAdmin(interaction.member)) {
                return interaction.reply({ content: '❌ Hanya admin! ', ephemeral:  true });
            }

            const transactions = await getAllTransactions();
            const testimonials = await getAllTestimonials();

            const completed = transactions.filter(t => t.status === 'completed');
            const totalRevenue = completed. reduce((sum, t) => sum + (t.amount || 0), 0);
            const avgRating = testimonials.length > 0 
                ? (testimonials.reduce((sum, t) => sum + t.rating, 0) / testimonials.length).toFixed(1) 
                : 0;

            const embed = new EmbedBuilder()
                .setTitle('📊 Statistik ADR14N Store')
                .setColor('#FFD700')
                .addFields(
                    { name:  '📈 Total Transaksi', value: `${transactions.length}`, inline: true },
                    { name: '✅ Transaksi Selesai', value: `${completed.length}`, inline: true },
                    { name: '💰 Total Pendapatan', value:  `Rp${totalRevenue.toLocaleString('id-ID')}`, inline: true },
                    { name:  '⭐ Total Testimoni', value: `${testimonials.length}`, inline: true },
                    { name: '⭐ Rata-rata Rating', value:  `${avgRating}/5`, inline: true }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // ==================== PEMBAYARAN ====================
        if (interaction. isChatInputCommand() && interaction.commandName === 'pembayaran') {
            await interaction.reply({ embeds: [createPaymentEmbed()] });
        }

        // ==================== TESTIMONI ====================
        if (interaction.isChatInputCommand() && interaction.commandName === '
