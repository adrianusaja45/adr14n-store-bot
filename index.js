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

// Cache Sementara untuk menyimpan URL gambar sebelum Modal disubmit
const tempImageCache = new Map();

const client = new Client({
    intents:  [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers]
});

// ========== DATA PEMBAYARAN ==========
const paymentMethods = [
    { name: 'Bank Jago', emoji: '🟣', number: '104004201095', holder: 'Adrianus Indraprasta Dwicaksana' },
    { name: 'BCA', emoji: '🔵', number: '2802312092', holder: 'Adrianus Indraprasta Dwicaksana' },
    { name: 'BluBCA', emoji: '🔵', number: '002460031049', holder: 'Adrianus Indraprasta Dwicaksana' },
    { name: 'GoPay', emoji: '💚', number: '082320010090', holder: 'Adrianus Indraprasta Dwicaksana' },
    { name: 'OVO', emoji: '💜', number: '082320010090', holder: 'Adrianus Indraprasta Dwicaksana' },
    { name: 'QRIS', emoji: '📱', number: 'ADR14NSTORE', holder: 'Scan QR Code' }
];

// ========== INIT & STATUS ==========
async function initDb() {
    const client = await pool.connect();
    try {
        await client.query(`CREATE TABLE IF NOT EXISTS transactions (ticket_id SERIAL PRIMARY KEY, channel_id VARCHAR(255), buyer_id VARCHAR(255), buyer_tag VARCHAR(255), product TEXT, amount BIGINT, detail TEXT, status VARCHAR(50) DEFAULT 'open', proof_image TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`);
        await client.query(`CREATE TABLE IF NOT EXISTS testimonials (id SERIAL PRIMARY KEY, user_id VARCHAR(255), username VARCHAR(255), message TEXT, rating INT, image_url TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`);
        await client.query(`ALTER TABLE testimonials ADD COLUMN IF NOT EXISTS image_url TEXT;`);
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
                    '👇 **Klik tombol di bawah untuk membuat ticket!**'
                )
                .setColor('#5865F2')
                .setFooter({ text: 'ADR14N Store • Trusted Seller' })
                .setTimestamp();
            
            if (interaction.guild.iconURL()) {
                embed.setThumbnail(interaction.guild.iconURL({ dynamic: true }));
            }
            if (process.env.BANNER_URL) embed.setImage(process.env.BANNER_URL);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('open_ticket').setLabel('📩 Buat Ticket').setStyle(ButtonStyle.Primary)
            );

            await interaction.channel.send({ embeds: [embed], components: [row] });
            interaction.reply({ content: '✅ Panel Setup Berhasil!', ephemeral: true });
        }

        // --- 2. OPEN MODAL ---
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
                // UPDATE DISINI: Mengubah Label "Budget (Angka)" menjadi "Harga"
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('harga').setLabel('Harga').setStyle(TextInputStyle.Short).setRequired(true)),
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
            let desc = ''; paymentMethods.forEach(p => desc += `${p.emoji} **${p.name}**\n\`${p.number}\`\na.n ${p.holder}\n\n`);
            const embed = new EmbedBuilder().setTitle('Metode Pembayaran').setDescription(desc).setColor('Blue');
            const qrisUrl = process.env.QRIS_IMAGE_URL || process.env.QRIS_URL;
            if(qrisUrl) embed.setImage(qrisUrl);
            interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // --- 5. UPLOAD BUKTI BAYAR ---
        if (interaction.isButton() && interaction.customId === 'btn_confirm_paid') {
            const tData = await pool.query("SELECT * FROM transactions WHERE channel_id = $1", [interaction.channel.id]);
            if (tData.rows.length === 0 || tData.rows[0].buyer_id !== interaction.user.id) return interaction.reply({content: '❌ Error / Bukan pembeli.', ephemeral: true});

            await interaction.reply({ content: '📸 **Silakan upload bukti transfer di sini sekarang.**\nBot menunggu 60 detik...', fetchReply: true });

            const collector = interaction.channel.createMessageCollector({ filter: m => m.author.id === interaction.user.id && m.attachments.size > 0, max: 1, time: 60000 });

            collector.on('collect', async m => {
                const imgUrl = m.attachments.first().url;
                const ticketChId = interaction.channel.id;
                
                await pool.query("UPDATE transactions SET proof_image = $1, status = 'pending_check' WHERE channel_id = $2", [imgUrl, ticketChId]);

                const waitEmbed = new EmbedBuilder().setTitle('✅ Bukti Diterima').setDescription('Mohon tunggu, Admin sedang memverifikasi pembayaran Anda.').setColor('Blue');
                await interaction.channel.send({ embeds: [waitEmbed] });

                const logChannel = interaction.guild.channels.cache.get(process.env.LOG_TRANSAKSI_ID);
                if (logChannel) {
                    const adminEmbed = new EmbedBuilder().setTitle(`⚠️ Verifikasi #${tData.rows[0].ticket_id}`).setDescription(`Buyer: <@${m.author.id}>\nChannel: <#${ticketChId}>`).setImage(imgUrl).setColor('Orange');
                    const adminRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId(`admin_acc_${ticketChId}`).setLabel('✅ Terima').setStyle(ButtonStyle.Success),
                        new ButtonBuilder().setCustomId(`admin_reject_${ticketChId}`).setLabel('❌ Tolak').setStyle(ButtonStyle.Danger)
                    );
                    await logChannel.send({ content: `<@&${process.env.ADMIN_ROLE_ID}>`, embeds: [adminEmbed], components: [adminRow] });
                }
            });
        }

        // --- 6. ADMIN TERIMA ---
        if (interaction.isButton() && interaction.customId.startsWith('admin_acc_')) {
            const targetChannelId = interaction.customId.split('_')[2];
            const res = await pool.query("UPDATE transactions SET status = 'paid' WHERE channel_id = $1 RETURNING *", [targetChannelId]);
            if (res.rows.length === 0) return interaction.reply({content: '❌ Error.', ephemeral: true});
            const data = res.rows[0];

            await interaction.message.edit({ components: [] }); 

            const ticketChannel = interaction.guild.channels.cache.get(targetChannelId);
            if (ticketChannel) {
                const adminSentRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('admin_sent_product').setLabel('📦 Barang Sudah Dikirim').setStyle(ButtonStyle.Primary)
                );
                
                await ticketChannel.send({ 
                    content: `✅ **Pembayaran Diterima!**\nTerima kasih <@${data.buyer_id}>. Admin akan segera mengirim produk Anda.\n\n*(Admin: Klik tombol di bawah jika produk sudah dikirim)*`,
                    embeds: [new EmbedBuilder().setTitle('Status: PAID').setColor('Green')],
                    components: [adminSentRow]
                });
            }
            await interaction.reply({ content: `✅ Sukses verifikasi tiket #${data.ticket_id}`, ephemeral: true });
        }

        // --- 7. ADMIN BARANG DIKIRIM ---
        if (interaction.isButton() && interaction.customId === 'admin_sent_product') {
            if (!interaction.member.roles.cache.has(process.env.ADMIN_ROLE_ID)) return interaction.reply({content: '❌ Admin only', ephemeral: true});

            const buyerConfirmRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('buyer_confirm_receive').setLabel('✅ Pesanan Diterima').setStyle(ButtonStyle.Success)
            );

            await interaction.reply({ 
                content: `📦 **Produk Telah Dikirim!**\n\nSilakan cek pesanan Anda. Jika sudah sesuai, klik tombol di bawah untuk menyelesaikan transaksi.`,
                components: [buyerConfirmRow] 
            });
        }

        // --- 8. BUYER KONFIRMASI TERIMA ---
        if (interaction.isButton() && interaction.customId === 'buyer_confirm_receive') {
            const tData = await pool.query("SELECT * FROM transactions WHERE channel_id = $1", [interaction.channel.id]);
            if (tData.rows.length === 0 || tData.rows[0].buyer_id !== interaction.user.id) {
                return interaction.reply({ content: '❌ Hanya Pembeli yang bisa mengkonfirmasi ini!', ephemeral: true });
            }

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('open_testi_modal_final').setLabel('✍️ Tulis Ulasan (Form)').setStyle(ButtonStyle.Primary)
            );

            await interaction.reply({ 
                content: `📸 **(Opsional) Sertakan Foto Produk**\nJika Anda ingin menampilkan foto produk di testimoni, silakan **KIRIM GAMBAR/FOTO di chat ini sekarang**.\n\nJika sudah kirim gambar (atau tidak ingin pakai gambar), klik tombol **Tulis Ulasan** di bawah.`, 
                components: [row] 
            });
        }

        // --- 9. BUKA FORM TESTIMONI ---
        if (interaction.isButton() && interaction.customId === 'open_testi_modal_final') {
            const messages = await interaction.channel.messages.fetch({ limit: 10 });
            const lastImageMsg = messages.find(m => m.author.id === interaction.user.id && m.attachments.size > 0);
            
            if (lastImageMsg) {
                tempImageCache.set(interaction.user.id, lastImageMsg.attachments.first().url);
            } else {
                tempImageCache.delete(interaction.user.id);
            }

            const modal = new ModalBuilder().setCustomId('modal_testi').setTitle('Bagaimana Pelayanan Kami?');
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('rating').setLabel('Rating (1-5)').setStyle(TextInputStyle.Short).setMaxLength(1).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('msg').setLabel('Tulis ulasan singkat...').setStyle(TextInputStyle.Paragraph).setRequired(true))
            );
            await interaction.showModal(modal);
        }

        // --- 10. SUBMIT TESTIMONI & DELETE ---
        if (interaction.isModalSubmit() && interaction.customId === 'modal_testi') {
            await interaction.deferReply();

            let rating = parseInt(interaction.fields.getTextInputValue('rating')) || 5;
            if (rating < 1) rating = 1; if (rating > 5) rating = 5;
            const msg = interaction.fields.getTextInputValue('msg');
            
            const imageUrl = tempImageCache.get(interaction.user.id) || null;
            tempImageCache.delete(interaction.user.id); 

            await pool.query("INSERT INTO testimonials (user_id, username, message, rating, image_url) VALUES ($1, $2, $3, $4, $5)", [interaction.user.id, interaction.user.username, msg, rating, imageUrl]);
            await pool.query("UPDATE transactions SET status = 'completed' WHERE channel_id = $1", [interaction.channel.id]);

            const testiChannel = client.channels.cache.get(process.env.TESTIMONI_CHANNEL_ID);
            if (testiChannel) {
                const embed = new EmbedBuilder()
                    .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() })
                    .setDescription(`**Rating:** ${'⭐'.repeat(rating)}\n"${msg}"`)
                    .setColor('Gold')
                    .setTimestamp();
                if (imageUrl) embed.setImage(imageUrl); 
                await testiChannel.send({ embeds: [embed] });
            }

            const logChannel = interaction.guild.channels.cache.get(process.env.LOG_TRANSAKSI_ID);
            if (logChannel) logChannel.send(`✅ Ticket (Completed) - ${interaction.user.tag}`);

            await interaction.editReply({ content: '✅ Terima kasih! Transaksi selesai. Channel akan dihapus dalam 5 detik...' });
            setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
            updateStatus();
        }

        // --- 11. ADMIN TOLAK ---
        if (interaction.isButton() && interaction.customId.startsWith('admin_reject_')) {
            const targetChannelId = interaction.customId.split('_')[2];
            const ticketChannel = interaction.guild.channels.cache.get(targetChannelId);
            await interaction.message.delete(); 
            if (ticketChannel) await ticketChannel.send(`❌ **Pembayaran Ditolak.**\nBukti tidak valid. Silakan kirim ulang.`);
            await interaction.reply({ content: '❌ Ditolak.', ephemeral: true });
        }

    } catch (e) { console.error(e); if(!interaction.replied) interaction.reply({ content: 'Error sistem.', ephemeral: true }); }
});

client.login(process.env.DISCORD_TOKEN);
