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
    TextInputStyle
} = require('discord.js');
const { Pool } = require('pg'); 
require('dotenv').config();

// ========== DATABASE ==========
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } 
});

const client = new Client({
    intents:  [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers]
});

// ========== DATA PEMBAYARAN ==========
const paymentMethods = [
    { name:  'Bank Jago', emoji: '🟣', number: '104004201095', holder: 'Adrianus Indraprasta Dwicaksana' },
    { name: 'BCA', emoji: '🔵', number: '2802312092', holder: 'Adrianus Indraprasta Dwicaksana' },
    { name:  'GoPay', emoji: '💚', number: '082320010090', holder: 'Adrianus Indraprasta Dwicaksana' },
    { name:  'QRIS', emoji: '📱', number: 'ADR14NSTORE', holder: 'Scan QR Code' }
];

// ========== INIT & STATUS ==========
async function initDb() {
    const client = await pool.connect();
    try {
        await client.query(`CREATE TABLE IF NOT EXISTS transactions (ticket_id SERIAL PRIMARY KEY, channel_id VARCHAR(255), buyer_id VARCHAR(255), buyer_tag VARCHAR(255), product TEXT, amount BIGINT, detail TEXT, status VARCHAR(50) DEFAULT 'open', proof_image TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`);
        await client.query(`CREATE TABLE IF NOT EXISTS testimonials (id SERIAL PRIMARY KEY, user_id VARCHAR(255), username VARCHAR(255), message TEXT, rating INT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`);
        console.log('✅ Database Ready');
    } catch (err) { console.error(err); } finally { client.release(); }
}

async function updateStatus() {
    try {
        const resTrans = await pool.query('SELECT COUNT(*) FROM transactions');
        const resTesti = await pool.query('SELECT COUNT(*) FROM testimonials');
        client.user.setPresence({ activities: [{ name: `🛒 ${resTrans.rows[0].count} Trx | ⭐ ${resTesti.rows[0].count} Testi` }], status: 'online' });
    } catch (e) {}
}

client.once('ready', async () => {
    console.log(`✅ Bot Online: ${client.user.tag}`);
    await initDb();
    updateStatus();
    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    if (guild) await guild.commands.set([{ name: 'setup-ticket', description: 'Setup panel ticket' }]);
});

// ========== INTERACTION HANDLER ==========
client.on('interactionCreate', async interaction => {
    try {
        // --- 1. SETUP COMMAND ---
        if (interaction.isChatInputCommand() && interaction.commandName === 'setup-ticket') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return interaction.reply({content: '❌ Admin only', ephemeral: true});
            
            const embed = new EmbedBuilder()
                .setTitle('🛒 ADR14N STORE - ORDER DISINI')
                .setDescription('Klik tombol di bawah untuk memulai transaksi.\nMetode pembayaran: BCA, Jago, QRIS, E-Wallet.')
                .setColor('Blue');
            
            if (process.env.BANNER_URL) embed.setImage(process.env.BANNER_URL);

            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('open_ticket').setLabel('📩 Buat Pesanan').setStyle(ButtonStyle.Primary));
            await interaction.channel.send({ embeds: [embed], components: [row] });
            interaction.reply({ content: 'Panel Done!', ephemeral: true });
        }

        // --- 2. OPEN MODAL (Dengan Cek Channel Hilang) ---
        if (interaction.isButton() && interaction.customId === 'open_ticket') {
            const check = await pool.query("SELECT * FROM transactions WHERE buyer_id = $1 AND status != 'completed' AND status != 'cancelled'", [interaction.user.id]);
            
            if (check.rows.length > 0) {
                const existing = check.rows[0];
                const channelExist = interaction.guild.channels.cache.get(existing.channel_id);
                if (channelExist) return interaction.reply({ content: `❌ Anda masih punya tiket aktif! <#${existing.channel_id}>`, ephemeral: true });
                else await pool.query("UPDATE transactions SET status = 'cancelled' WHERE ticket_id = $1", [existing.ticket_id]);
            }

            const modal = new ModalBuilder().setCustomId('ticket_modal').setTitle('Form Pemesanan');
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('produk').setLabel('Produk').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('harga').setLabel('Budget (Angka)').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('detail').setLabel('Detail').setStyle(TextInputStyle.Paragraph).setRequired(false))
            );
            await interaction.showModal(modal);
        }

        // --- 3. CREATE TICKET ---
        if (interaction.isModalSubmit() && interaction.customId === 'ticket_modal') {
            await interaction.deferReply({ ephemeral: true });
            const produk = interaction.fields.getTextInputValue('produk');
            const harga = interaction.fields.getTextInputValue('harga').replace(/\D/g, '');
            const detail = interaction.fields.getTextInputValue('detail') || '-';

            const insert = await pool.query("INSERT INTO transactions (buyer_id, buyer_tag, product, amount, detail) VALUES ($1, $2, $3, $4, $5) RETURNING ticket_id", [interaction.user.id, interaction.user.tag, produk, harga, detail]);
            const ticketId = insert.rows[0].ticket_id;

            const channel = await interaction.guild.channels.create({
                name: `ticket-${ticketId}`,
                type: ChannelType.GuildText,
                permissionOverwrites: [
                    { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                    { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles] },
                    { id: process.env.ADMIN_ROLE_ID, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                    { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks] }
                ]
            });

            await pool.query("UPDATE transactions SET channel_id = $1 WHERE ticket_id = $2", [channel.id, ticketId]);

            const embed = new EmbedBuilder().setTitle(`Ticket #${ticketId}`).addFields({ name: 'Buyer', value: `<@${interaction.user.id}>`, inline: true }, { name: 'Produk', value: produk, inline: true }, { name: 'Harga', value: `Rp ${parseInt(harga).toLocaleString('id-ID')}`, inline: true }, { name: 'Detail', value: detail }).setColor('Yellow');
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('btn_pay_info').setLabel('💳 Info Bayar').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('btn_confirm_paid').setLabel('✅ Saya Sudah Bayar').setStyle(ButtonStyle.Success));

            await channel.send({ content: `<@${interaction.user.id}> | <@&${process.env.ADMIN_ROLE_ID}>`, embeds: [embed], components: [row] });
            await interaction.editReply({ content: `✅ Tiket: ${channel}` });
            updateStatus();
        }

        // --- 4. INFO BAYAR ---
        if (interaction.isButton() && interaction.customId === 'btn_pay_info') {
            let desc = ''; paymentMethods.forEach(p => desc += `${p.emoji} **${p.name}**: \`${p.number}\` (${p.holder})\n`);
            const embed = new EmbedBuilder().setTitle('Metode Pembayaran').setDescription(desc).setColor('Blue');
            const qrisUrl = process.env.QRIS_IMAGE_URL || process.env.QRIS_URL;
            if(qrisUrl) embed.setImage(qrisUrl);
            interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // --- 5. UPLOAD BUKTI (VERSI RAPI) ---
        if (interaction.isButton() && interaction.customId === 'btn_confirm_paid') {
            const tData = await pool.query("SELECT * FROM transactions WHERE channel_id = $1", [interaction.channel.id]);
            if (tData.rows.length === 0 || tData.rows[0].buyer_id !== interaction.user.id) return interaction.reply({content: '❌ Error / Bukan pembeli.', ephemeral: true});

            await interaction.reply({ content: '📸 **Silakan upload bukti transfer di sini sekarang.**\nBot menunggu 60 detik...', fetchReply: true });

            const collector = interaction.channel.createMessageCollector({ filter: m => m.author.id === interaction.user.id && m.attachments.size > 0, max: 1, time: 60000 });

            collector.on('collect', async m => {
                const imgUrl = m.attachments.first().url;
                const ticketChId = interaction.channel.id;
                
                await pool.query("UPDATE transactions SET proof_image = $1, status = 'pending_check' WHERE channel_id = $2", [imgUrl, ticketChId]);

                // A. KASIH TAU BUYER (TANPA TOMBOL)
                const waitEmbed = new EmbedBuilder().setTitle('✅ Bukti Diterima').setDescription('Mohon tunggu, Admin sedang memverifikasi pembayaran Anda.').setColor('Blue');
                await interaction.channel.send({ embeds: [waitEmbed] });

                // B. KIRIM TOMBOL KE LOG ADMIN (AGAR RAPI)
                const logChannel = interaction.guild.channels.cache.get(process.env.LOG_TRANSAKSI_ID);
                if (logChannel) {
                    const adminEmbed = new EmbedBuilder().setTitle(`⚠️ Verifikasi #${tData.rows[0].ticket_id}`).setDescription(`Buyer: <@${m.author.id}>\nChannel: <#${ticketChId}>`).setImage(imgUrl).setColor('Orange');
                    // Simpan Channel ID di dalam Custom ID Tombol
                    const adminRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId(`admin_acc_${ticketChId}`).setLabel('✅ Terima').setStyle(ButtonStyle.Success),
                        new ButtonBuilder().setCustomId(`admin_reject_${ticketChId}`).setLabel('❌ Tolak').setStyle(ButtonStyle.Danger)
                    );
                    await logChannel.send({ content: `<@&${process.env.ADMIN_ROLE_ID}>`, embeds: [adminEmbed], components: [adminRow] });
                }
            });
        }

        // --- 6. ADMIN TERIMA (DARI CHANNEL LOG) ---
        if (interaction.isButton() && interaction.customId.startsWith('admin_acc_')) {
            // Ambil Channel ID Tiket dari tombol
            const targetChannelId = interaction.customId.split('_')[2];
            
            // Update DB
            const res = await pool.query("UPDATE transactions SET status = 'paid' WHERE channel_id = $1 RETURNING *", [targetChannelId]);
            if (res.rows.length === 0) return interaction.reply({content: '❌ Data tiket tidak ditemukan (mungkin sudah dihapus).', ephemeral: true});
            const data = res.rows[0];

            // Update Pesan di Log (Hilangkan tombol)
            await interaction.message.edit({ components: [] }); 

            // Kirim Notif ke Channel Ticket Buyer
            const ticketChannel = interaction.guild.channels.cache.get(targetChannelId);
            if (ticketChannel) {
                const finishRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('admin_finish').setLabel('🏁 Selesai & Tutup').setStyle(ButtonStyle.Primary));
                await ticketChannel.send({ 
                    content: `✅ **Pembayaran Diterima!**\nTerima kasih <@${data.buyer_id}>. Pesanan sedang diproses.`,
                    embeds: [new EmbedBuilder().setTitle('Status: PAID').setColor('Green')],
                    components: [finishRow]
                });
            }

            await interaction.reply({ content: `✅ Sukses verifikasi tiket #${data.ticket_id}`, ephemeral: true });
        }

        // --- 7. ADMIN TOLAK (DARI CHANNEL LOG) ---
        if (interaction.isButton() && interaction.customId.startsWith('admin_reject_')) {
            const targetChannelId = interaction.customId.split('_')[2];
            const ticketChannel = interaction.guild.channels.cache.get(targetChannelId);
            
            await interaction.message.delete(); // Hapus pesan di log
            
            if (ticketChannel) {
                await ticketChannel.send(`❌ **Pembayaran Ditolak.**\nAdmin menolak bukti transfer. Silakan kirim ulang yang valid.`);
            }
            await interaction.reply({ content: '❌ Verifikasi ditolak.', ephemeral: true });
        }

        // --- 8. SELESAI & TESTIMONI ---
        if (interaction.isButton() && interaction.customId === 'admin_finish') {
            // Logic sama seperti sebelumnya
            const res = await pool.query("UPDATE transactions SET status = 'completed' WHERE channel_id = $1 RETURNING *", [interaction.channel.id]);
            const data = res.rows[0];
            const buyer = await client.users.fetch(data.buyer_id);
            const testiRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`testi_${data.buyer_id}`).setLabel('⭐ Beri Testimoni').setStyle(ButtonStyle.Success));

            try { await buyer.send({ content: `Halo! Transaksi #${data.ticket_id} selesai. Mohon beri ulasan!`, components: [testiRow] }); } 
            catch (e) { await interaction.channel.send({ content: `<@${data.buyer_id}> Transaksi selesai! Review disini:`, components: [testiRow] }); }

            const logChannel = interaction.guild.channels.cache.get(process.env.LOG_TRANSAKSI_ID);
            if (logChannel) logChannel.send(`✅ Ticket #${data.ticket_id} COMPLETED.`);
            
            await interaction.reply('Channel dihapus dalam 10 detik.');
            setTimeout(() => interaction.channel.delete().catch(() => {}), 10000);
            updateStatus();
        }

        // --- 9. SUBMIT TESTIMONI ---
        if (interaction.isButton() && interaction.customId.startsWith('testi_')) {
            if (interaction.user.id !== interaction.customId.split('_')[1]) return interaction.reply({content: 'Bukan untukmu', ephemeral: true});
            const modal = new ModalBuilder().setCustomId('modal_testi').setTitle('Tulis Testimoni');
            modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('rating').setLabel('Rating (1-5)').setStyle(TextInputStyle.Short).setMaxLength(1).setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('msg').setLabel('Pesan').setStyle(TextInputStyle.Paragraph).setRequired(true)));
            await interaction.showModal(modal);
        }

        if (interaction.isModalSubmit() && interaction.customId === 'modal_testi') {
            let rating = parseInt(interaction.fields.getTextInputValue('rating')) || 5;
            if (rating < 1) rating = 1; if (rating > 5) rating = 5;
            const msg = interaction.fields.getTextInputValue('msg');
            
            await pool.query("INSERT INTO testimonials (user_id, username, message, rating) VALUES ($1, $2, $3, $4)", [interaction.user.id, interaction.user.username, msg, rating]);
            const testiChannel = client.channels.cache.get(process.env.TESTIMONI_CHANNEL_ID);
            if (testiChannel) await testiChannel.send({ embeds: [new EmbedBuilder().setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() }).setDescription(`**Rating:** ${'⭐'.repeat(rating)}\n"${msg}"`).setColor('Gold').setTimestamp()] });
            
            await interaction.reply({ content: 'Testimoni terkirim!', ephemeral: true });
            updateStatus();
        }

    } catch (e) { console.error(e); if(!interaction.replied) interaction.reply({ content: 'Error sistem.', ephemeral: true }); }
});

client.login(process.env.DISCORD_TOKEN);
