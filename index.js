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
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers]
});

// ========== PAYMENT DATA ==========
const paymentMethods = [
    { name: 'Bank Jago', emoji: '🟣', number: '104004201095', holder: 'Adrianus Indraprasta Dwicaksana' },
    { name: 'BCA', emoji: '🔵', number: '2802312092', holder: 'Adrianus Indraprasta Dwicaksana' },
    { name: 'BluBCA', emoji: '🔵', number: '002460031049', holder: 'Adrianus Indraprasta Dwicaksana' },
    { name: 'GoPay', emoji: '💚', number: '082320010090', holder: 'Adrianus Indraprasta Dwicaksana' },
    { name: 'OVO', emoji: '💜', number: '082320010090', holder: 'Adrianus Indraprasta Dwicaksana' },
    { name: 'QRIS', emoji: '📱', number: 'ADR14NSTORE', holder: 'Scan QR Code' }
];

// ========== BOT STATUS ==========
async function updateStatus() {
    try {
        const trxCount = await pool.query('SELECT COUNT(*) FROM transactions');
        const testiCount = await pool.query('SELECT COUNT(*) FROM testimonials');
        client.user.setPresence({ activities: [{ name: `🛒 ${trxCount.rows[0].count} Trx | ⭐ ${testiCount.rows[0].count} Testi` }], status: 'online' });
    } catch (e) {}
}

// ========== INIT ==========
client.once('ready', async () => {
    console.log(`✅ Bot Online: ${client.user.tag}`);
    updateStatus();

    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    if (guild) {
        await guild.commands.set([{ name: 'setup-ticket', description: 'Setup panel ticket' }]);
    }
});

// ========== INTERACTIONS ==========
client.on('interactionCreate', async interaction => {
    try {
        // === SETUP PANEL ===
        if (interaction.isChatInputCommand() && interaction.commandName === 'setup-ticket') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator))
                return interaction.reply({content: '❌ Admin only', ephemeral: true});

            const embed = new EmbedBuilder()
                .setTitle('🎫 ADR14N STORE - Sistem Transaksi')
                .setDescription('Klik tombol di bawah untuk buat ticket!')
                .setColor('#5865F2')
                .setTimestamp();
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('open_ticket').setLabel('📩 Buat Ticket').setStyle(ButtonStyle.Primary)
            );
            await interaction.channel.send({ embeds: [embed], components: [row] });
            interaction.reply({ content: '✅ Panel Setup Berhasil!', ephemeral: true });
        }

        // === OPEN TICKET ===
        if (interaction.isButton() && interaction.customId === 'open_ticket') {
            // Modal (form)
            const modal = new ModalBuilder().setCustomId('ticket_modal').setTitle('Form Pemesanan');
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('produk').setLabel('Produk').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('harga').setLabel('Harga').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('detail').setLabel('Detail').setStyle(TextInputStyle.Paragraph).setRequired(false))
            );
            await interaction.showModal(modal);
        }

        // === CREATE TICKET ===
        if (interaction.isModalSubmit() && interaction.customId === 'ticket_modal') {
            await interaction.deferReply({ ephemeral: true });
            const produk = interaction.fields.getTextInputValue('produk');
            const harga = interaction.fields.getTextInputValue('harga').replace(/\D/g, '');
            const detail = interaction.fields.getTextInputValue('detail') || '-';

            // Create ticket db
            const insert = await pool.query(
                "INSERT INTO transactions (buyer_id, buyer_tag, product, amount, detail) VALUES ($1, $2, $3, $4, $5) RETURNING ticket_id",
                [interaction.user.id, interaction.user.tag, produk, harga, detail]
            );
            const ticketId = insert.rows[0].ticket_id;

            // Create channel
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

            // Update channel_id di db
            await pool.query("UPDATE transactions SET channel_id = $1 WHERE ticket_id = $2", [channel.id, ticketId]);

            const embed = new EmbedBuilder()
                .setTitle(`Ticket #${ticketId}`)
                .addFields(
                    { name: 'Buyer', value: `<@${interaction.user.id}>` },
                    { name: 'Produk', value: produk },
                    { name: 'Harga', value: `Rp ${parseInt(harga).toLocaleString('id-ID')}` },
                    { name: 'Detail', value: detail }
                )
                .setColor('Yellow');

            // Baris untuk Buyer
            const rowBuyer = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('btn_pay_info').setLabel('💳 Info Bayar').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('btn_confirm_paid').setLabel('✅ Saya Sudah Bayar').setStyle(ButtonStyle.Success)
            );
            // Baris untuk Admin (Hanya admin bisa klik!)
            const rowAdmin = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('btn_close_ticket').setLabel('🔒 Tutup Ticket').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('btn_cancel_ticket').setLabel('❌ Batalkan Transaksi').setStyle(ButtonStyle.Secondary)
            );

            await channel.send({ 
                content: `<@${interaction.user.id}> | <@&${process.env.ADMIN_ROLE_ID}>`, 
                embeds: [embed], 
                components: [rowBuyer, rowAdmin] // TOMBOL ADMIN SELALU ADA, HANYA ADMIN BISA KLIK!
            });

            await interaction.editReply({ content: `✅ Tiket: ${channel}` });
            updateStatus();
        }

        // === INFO BAYAR ===
        if (interaction.isButton() && interaction.customId === 'btn_pay_info') {
            let desc = '';
            paymentMethods.forEach(p => desc += `${p.emoji} **${p.name}**\n\`${p.number}\`\na.n ${p.holder}\n\n`);
            const embed = new EmbedBuilder().setTitle('Metode Pembayaran').setDescription(desc).setColor('Blue');
            const qrisUrl = process.env.QRIS_IMAGE_URL || process.env.QRIS_URL;
            if(qrisUrl) embed.setImage(qrisUrl);
            interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // === SAYA SUDAH BAYAR (Buyer) ===
        // ... (lanjutkan logika pembayaran)

        // === TUTUP TICKET - Hanya untuk ADMIN ===
        if (interaction.isButton() && interaction.customId === 'btn_close_ticket') {
            // Cek apakah admin: hanya admin bisa klik (tidak berlaku untuk member/buyer)
            if (!interaction.member.roles.cache.has(process.env.ADMIN_ROLE_ID)) 
                return interaction.reply({content: '❌ Hanya Admin yang bisa menutup ticket!', ephemeral: true});
            await pool.query("UPDATE transactions SET status = 'completed' WHERE channel_id = $1", [interaction.channel.id]);
            await interaction.reply({ content: '✅ Ticket ditutup & transaksi selesai. Channel akan dihapus dalam 5 detik...' });
            setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
            updateStatus();
        }

        // === BATALKAN TRANSAKSI - Hanya untuk ADMIN ===
        if (interaction.isButton() && interaction.customId === 'btn_cancel_ticket') {
            if (!interaction.member.roles.cache.has(process.env.ADMIN_ROLE_ID)) 
                return interaction.reply({content: '❌ Hanya Admin yang bisa membatalkan!', ephemeral: true});
            await pool.query("UPDATE transactions SET status = 'cancelled' WHERE channel_id = $1", [interaction.channel.id]);
            await interaction.reply({ content: '❌ Transaksi dibatalkan. Channel akan dihapus dalam 5 detik...' });
            setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
            updateStatus();
        }

    } catch (e) { console.error(e); if (!interaction.replied) interaction.reply({ content: 'Error sistem.', ephemeral: true }); }
});

client.login(process.env.DISCORD_TOKEN);
