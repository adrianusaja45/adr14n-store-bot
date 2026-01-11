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
    AttachmentBuilder
} = require('discord.js');
const { Pool } = require('pg'); 
require('dotenv').config();

// ========== KONFIGURASI DATABASE POSTGRESQL ==========
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } 
});

const client = new Client({
    intents:  [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// ========== PAYMENT METHODS ==========
const paymentMethods = [
    { name:  'Bank Jago', emoji: '🟣', number: '104004201095', holder: 'Adrianus Indraprasta Dwicaksana' },
    { name: 'BCA', emoji: '🔵', number: '2802312092', holder: 'Adrianus Indraprasta Dwicaksana' },
    { name:  'GoPay', emoji: '💚', number: '082320010090', holder: 'Adrianus Indraprasta Dwicaksana' },
    { name:  'QRIS', emoji: '📱', number: 'ADR14NSTORE', holder: 'Scan QR Code' }
];

// ========== SETUP DATABASE ==========
async function initDb() {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS transactions (
                ticket_id SERIAL PRIMARY KEY,
                channel_id VARCHAR(255),
                buyer_id VARCHAR(255),
                buyer_tag VARCHAR(255),
                product TEXT,
                amount BIGINT,
                detail TEXT,
                status VARCHAR(50) DEFAULT 'open',
                proof_image TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        await client.query(`
            CREATE TABLE IF NOT EXISTS testimonials (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(255),
                username VARCHAR(255),
                message TEXT,
                rating INT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ Database PostgreSQL Terhubung & Table Siap');
    } catch (err) {
        console.error('❌ Database Error:', err);
    } finally {
        client.release();
    }
}

// ========== STATUS BOT ==========
async function updateStatus() {
    try {
        const resTrans = await pool.query('SELECT COUNT(*) FROM transactions');
        const resTesti = await pool.query('SELECT COUNT(*) FROM testimonials');
        const totalTrans = resTrans.rows[0].count;
        const totalTesti = resTesti.rows[0].count;

        client.user.setPresence({
            activities: [{ name: `🛒 ${totalTrans} Transaksi | ⭐ ${totalTesti} Testimoni` }],
            status: 'online',
        });
    } catch (e) { console.error(e); }
}

// ========== READY EVENT ==========
client.once('ready', async () => {
    console.log(`✅ Bot ${client.user.tag} online!`);
    await initDb();
    updateStatus();
    setInterval(updateStatus, 300000); 

    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    if (guild) {
        await guild.commands.set([
            { name: 'setup-ticket', description: 'Setup panel ticket' },
        ]);
    }
});

// ========== INTERACTION HANDLER ==========
client.on('interactionCreate', async interaction => {
    try {
        // --- COMMAND: SETUP TICKET ---
        if (interaction.isChatInputCommand() && interaction.commandName === 'setup-ticket') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return interaction.reply({content: '❌ Admin only', ephemeral: true});
            
            const embed = new EmbedBuilder()
                .setTitle('🛒 ADR14N STORE - ORDER DISINI')
                .setDescription('Klik tombol di bawah untuk memulai transaksi.\nMetode pembayaran: BCA, Jago, QRIS, E-Wallet.')
                .setColor('Blue');

            // Cek variable QRIS_IMAGE_URL atau QRIS_URL (kompatibilitas)
            const bannerUrl = process.env.BANNER_URL;
            if (bannerUrl) embed.setImage(bannerUrl);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('open_ticket').setLabel('📩 Buat Pesanan').setStyle(ButtonStyle.Primary)
            );
            
            await interaction.channel.send({ embeds: [embed], components: [row] });
            interaction.reply({ content: 'Panel Ticket Terpasang!', ephemeral: true });
        }

        // --- BUTTON: OPEN MODAL ---
        if (interaction.isButton() && interaction.customId === 'open_ticket') {
            const check = await pool.query("SELECT * FROM transactions WHERE buyer_id = $1 AND status != 'completed' AND status != 'cancelled'", [interaction.user.id]);
            if (check.rows.length > 0) return interaction.reply({ content: `❌ Anda masih punya tiket aktif! <#${check.rows[0].channel_id}>`, ephemeral: true });

            const modal = new ModalBuilder().setCustomId('ticket_modal').setTitle('Form Pemesanan');
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('produk').setLabel('Produk').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('harga').setLabel('Estimasi Harga/Budget (Angka)').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('detail').setLabel('Detail Tambahan').setStyle(TextInputStyle.Paragraph).setRequired(false))
            );
            await interaction.showModal(modal);
        }

        // --- SUBMIT MODAL: CREATE TICKET ---
        if (interaction.isModalSubmit() && interaction.customId === 'ticket_modal') {
            await interaction.deferReply({ ephemeral: true });
            
            const produk = interaction.fields.getTextInputValue('produk');
            const harga = interaction.fields.getTextInputValue('harga').replace(/\D/g, '');
            const detail = interaction.fields.getTextInputValue('detail') || '-';

            const insert = await pool.query(
                "INSERT INTO transactions (buyer_id, buyer_tag, product, amount, detail) VALUES ($1, $2, $3, $4, $5) RETURNING ticket_id",
                [interaction.user.id, interaction.user.tag, produk, harga, detail]
            );
            const ticketId = insert.rows[0].ticket_id;

            // --- BAGIAN INI YANG DIPERBAIKI (PERMISSION) ---
            const channel = await interaction.guild.channels.create({
                name: `ticket-${ticketId}`,
                type: ChannelType.GuildText,
                permissionOverwrites: [
                    { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                    // Izin untuk Buyer
                    { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles] },
                    // Izin untuk Role Admin
                    { id: process.env.ADMIN_ROLE_ID, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                    // ✅ Izin untuk BOT (Supaya tidak stuck thinking/locked out)
                    { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles] }
                ]
            });

            await pool.query("UPDATE transactions SET channel_id = $1 WHERE ticket_id = $2", [channel.id, ticketId]);

            const embed = new EmbedBuilder()
                .setTitle(`Ticket #${ticketId}`)
                .addFields(
                    { name: 'Buyer', value: `<@${interaction.user.id}>`, inline: true },
                    { name: 'Produk', value: produk, inline: true },
                    { name: 'Harga', value: `Rp ${parseInt(harga).toLocaleString('id-ID')}`, inline: true },
                    { name: 'Detail', value: detail }
                )
                .setColor('Yellow');

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('btn_pay_info').setLabel('💳 Info Bayar').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('btn_confirm_paid').setLabel('✅ Saya Sudah Bayar').setStyle(ButtonStyle.Success)
            );

            await channel.send({ content: `<@${interaction.user.id}> | <@&${process.env.ADMIN_ROLE_ID}>`, embeds: [embed], components: [row] });
            await interaction.editReply({ content: `✅ Tiket dibuat: ${channel}` });
            updateStatus();
        }

        // --- BUTTON: INFO BAYAR ---
        if (interaction.isButton() && interaction.customId === 'btn_pay_info') {
            let desc = '';
            paymentMethods.forEach(p => desc += `${p.emoji} **${p.name}**: \`${p.number}\` (${p.holder})\n`);
            
            const embed = new EmbedBuilder().setTitle('Metode Pembayaran').setDescription(desc).setColor('Blue');
            
            // Menggunakan QRIS_IMAGE_URL sesuai screenshot Railway
            const qrisUrl = process.env.QRIS_IMAGE_URL || process.env.QRIS_URL;
            if(qrisUrl) embed.setImage(qrisUrl);
            
            interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // --- BUTTON: SUDAH BAYAR (Minta SS) ---
        if (interaction.isButton() && interaction.customId === 'btn_confirm_paid') {
            const ticketData = await pool.query("SELECT * FROM transactions WHERE channel_id = $1", [interaction.channel.id]);
            if (ticketData.rows.length === 0) return;
            if (ticketData.rows[0].buyer_id !== interaction.user.id) return interaction.reply({content: '❌ Anda bukan pembeli tiket ini', ephemeral: true});

            await interaction.reply({ 
                content: '📸 **Silakan upload gambar/screenshot bukti transfer di chat ini.**\nBot menunggu lampiran gambar (timeout 60 detik)...', 
                fetchReply: true 
            });

            const filter = m => m.author.id === interaction.user.id && m.attachments.size > 0;
            const collector = interaction.channel.createMessageCollector({ filter, max: 1, time: 60000 });

            collector.on('collect', async m => {
                const attachment = m.attachments.first();
                const imageUrl = attachment.url;

                await pool.query("UPDATE transactions SET proof_image = $1, status = 'pending_check' WHERE channel_id = $2", [imageUrl, interaction.channel.id]);

                const proofEmbed = new EmbedBuilder()
                    .setTitle('⚠️ Verifikasi Pembayaran')
                    .setDescription(`Buyer <@${m.author.id}> telah mengirim bukti transfer.`)
                    .setImage(imageUrl)
                    .setColor('Orange');

                const adminRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('admin_acc').setLabel('✅ Terima Pembayaran').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId('admin_reject').setLabel('❌ Tolak / Palsu').setStyle(ButtonStyle.Danger)
                );

                await interaction.channel.send({ content: `<@&${process.env.ADMIN_ROLE_ID}> Mohon cek bukti ini.`, embeds: [proofEmbed], components: [adminRow] });
            });
        }

        // --- ADMIN: TERIMA BAYAR ---
        if (interaction.isButton() && interaction.customId === 'admin_acc') {
            if (!interaction.member.roles.cache.has(process.env.ADMIN_ROLE_ID)) return interaction.reply({content: '❌ Khusus Admin', ephemeral: true});

            const res = await pool.query("UPDATE transactions SET status = 'paid' WHERE channel_id = $1 RETURNING *", [interaction.channel.id]);
            const data = res.rows[0];

            await interaction.message.edit({ components: [] }); // Disable buttons
            await interaction.channel.send({ 
                content: `✅ **Pembayaran Diterima!**\nTerima kasih <@${data.buyer_id}>. Pesanan sedang diproses.`,
                embeds: [new EmbedBuilder().setTitle('Status: PAID').setColor('Green')] 
            });

            // LOG TRANSAKSI
            const logChannel = interaction.guild.channels.cache.get(process.env.LOG_TRANSAKSI_ID);
            if (logChannel) {
                logChannel.send({
                    embeds: [new EmbedBuilder()
                        .setTitle('💰 Transaksi Lunas')
                        .addFields(
                            { name: 'Ticket', value: `#${data.ticket_id}`, inline: true },
                            { name: 'Buyer', value: `<@${data.buyer_id}>`, inline: true },
                            { name: 'Total', value: `Rp ${parseInt(data.amount).toLocaleString('id-ID')}`, inline: true }
                        )
                        .setThumbnail(data.proof_image)
                        .setColor('Green')
                        .setTimestamp()
                    ]
                }).catch(err => console.log("Gagal kirim log:", err));
            }

            const finishRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('admin_finish').setLabel('🏁 Selesai & Tutup').setStyle(ButtonStyle.Primary)
            );
            await interaction.channel.send({ content: 'Jika pesanan selesai dikirim, tekan tombol ini:', components: [finishRow] });
            await interaction.reply({ content: 'Status PAID', ephemeral: true });
        }

        // --- ADMIN: TOLAK BAYAR ---
        if (interaction.isButton() && interaction.customId === 'admin_reject') {
            if (!interaction.member.roles.cache.has(process.env.ADMIN_ROLE_ID)) return interaction.reply({content: '❌ Khusus Admin', ephemeral: true});
            await interaction.channel.send(`❌ **Pembayaran Ditolak.**\n<@${interaction.user.id}> (Admin) menolak bukti tersebut. Silakan kirim ulang.`);
            await interaction.message.delete(); 
        }

        // --- ADMIN: SELESAI & TESTIMONI ---
        if (interaction.isButton() && interaction.customId === 'admin_finish') {
            if (!interaction.member.roles.cache.has(process.env.ADMIN_ROLE_ID)) return;

            const res = await pool.query("UPDATE transactions SET status = 'completed' WHERE channel_id = $1 RETURNING *", [interaction.channel.id]);
            const data = res.rows[0];

            const buyer = await client.users.fetch(data.buyer_id);
            const testiRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`testi_${data.buyer_id}`).setLabel('⭐ Beri Testimoni').setStyle(ButtonStyle.Success)
            );

            // Coba DM Buyer
            try {
                await buyer.send({ 
                    content: `Halo! Transaksi #${data.ticket_id} (${data.product}) selesai. Mohon beri ulasan ya!`, 
                    components: [testiRow] 
                });
            } catch (e) {
                await interaction.channel.send({ content: `<@${data.buyer_id}> Transaksi selesai! Klik tombol ini untuk review.`, components: [testiRow] });
            }

            // LOG SELESAI
            const logChannel = interaction.guild.channels.cache.get(process.env.LOG_TRANSAKSI_ID);
            if (logChannel) logChannel.send(`✅ Ticket #${data.ticket_id} SELESAI (Completed).`).catch(() => {});
            
            await interaction.reply('Channel akan dihapus dalam 10 detik.');
            setTimeout(() => interaction.channel.delete().catch(() => {}), 10000);
            updateStatus();
        }

        // --- FORM TESTIMONI ---
        if (interaction.isButton() && interaction.customId.startsWith('testi_')) {
            const buyerId = interaction.customId.split('_')[1];
            if (interaction.user.id !== buyerId) return interaction.reply({content: 'Bukan untukmu', ephemeral: true});

            const modal = new ModalBuilder().setCustomId('modal_testi').setTitle('Tulis Testimoni');
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('rating').setLabel('Rating (1-5)').setStyle(TextInputStyle.Short).setMaxLength(1).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('msg').setLabel('Pesan').setStyle(TextInputStyle.Paragraph).setRequired(true))
            );
            await interaction.showModal(modal);
        }

        // --- SUBMIT TESTIMONI ---
        if (interaction.isModalSubmit() && interaction.customId === 'modal_testi') {
            const ratingStr = interaction.fields.getTextInputValue('rating');
            let rating = parseInt(ratingStr);
            if (isNaN(rating) || rating < 1) rating = 1;
            if (rating > 5) rating = 5;
            const msg = interaction.fields.getTextInputValue('msg');
            const stars = '⭐'.repeat(rating);

            await pool.query("INSERT INTO testimonials (user_id, username, message, rating) VALUES ($1, $2, $3, $4)", [interaction.user.id, interaction.user.username, msg, rating]);

            const testiChannel = client.channels.cache.get(process.env.TESTIMONI_CHANNEL_ID);
            if (testiChannel) {
                const embed = new EmbedBuilder()
                    .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() })
                    .setDescription(`**Rating:** ${stars}\n\n"${msg}"`)
                    .setColor('Gold')
                    .setFooter({ text: 'Terima kasih telah berbelanja!' })
                    .setTimestamp();
                
                await testiChannel.send({ embeds: [embed] });
            }

            await interaction.reply({ content: '✅ Testimoni terkirim! Terima kasih.', ephemeral: true });
            updateStatus();
        }

    } catch (e) {
        console.error('Interaction Error:', e);
        if(!interaction.replied) interaction.reply({ content: 'Terjadi kesalahan sistem.', ephemeral: true });
    }
});

client.login(process.env.DISCORD_TOKEN);
