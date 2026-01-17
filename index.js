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
    { name: 'Bank Jago', emoji: '🟣', number: '104004201095', holder: 'Adrianus Indraprasta Dwicaksana' },
    { name: 'BCA', emoji: '🔵', number: '2802312092', holder: 'Adrianus Indraprasta Dwicaksana' },
    { name: 'BluBCA', emoji: '🔵', number: '002460031049', holder: 'Adrianus Indraprasta Dwicaksana' },
    { name: 'GoPay', emoji: '💚', number: '082320010090', holder: 'Adrianus Indraprasta Dwicaksana' },
    { name: 'OVO', emoji: '💜', number: '082320010090', holder: 'Adrianus Indraprasta Dwicaksana' },
    { name: 'QRIS', emoji: '📱', number: 'ADR14NSTORE', holder: 'Scan QR Code' }
];

// ========== INIT ==========
client.once('ready', async () => {
    console.log(`✅ Bot Online: ${client.user.tag}`);
    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    if (guild) {
        await guild.commands.set([
            { name: 'setup-ticket', description: 'Setup panel ticket' }
        ]);
    }
});

// ========== INTERACTIONS ==========
client.on('interactionCreate', async interaction => {
    try {
        // === COMMAND: SETUP TICKET PANEL ===
        if (interaction.isChatInputCommand() && interaction.commandName === 'setup-ticket') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return interaction.reply({content: '❌ Admin only', ephemeral: true});
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

        // === BUTTON: OPEN TICKET (BUYER) ===
        if (interaction.isButton() && interaction.customId === 'open_ticket') {
            // Modal setup → validasi ticket aktif → buat ticket baru
            const modal = new ModalBuilder().setCustomId('ticket_modal').setTitle('Form Pemesanan');
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('produk').setLabel('Produk').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('harga').setLabel('Harga').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('detail').setLabel('Detail').setStyle(TextInputStyle.Paragraph).setRequired(false))
            );
            await interaction.showModal(modal);
        }

        // === MODAL SUBMIT: CREATE TICKET ===
        if (interaction.isModalSubmit() && interaction.customId === 'ticket_modal') {
            await interaction.deferReply({ ephemeral: true });
            const produk = interaction.fields.getTextInputValue('produk');
            const harga = interaction.fields.getTextInputValue('harga').replace(/\D/g, '');
            const detail = interaction.fields.getTextInputValue('detail') || '-';
            // Insert ticket data to DB, and get ticketId
            // Skipped DB command (merge with kode DB milikmu)

            // --- TICKET CREATE CHANNEL --- 
            const channel = await interaction.guild.channels.create({
                name: `ticket-1234`, // Ganti 1234 dengan ticketId dari DB
                type: ChannelType.GuildText,
                permissionOverwrites: [
                    { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                    { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles] },
                    { id: process.env.ADMIN_ROLE_ID, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                    { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks] }
                ]
            });

            const embed = new EmbedBuilder()
                .setTitle(`Ticket #1234`) // Ganti 1234 dengan ticketId dari DB
                .addFields(
                    { name: 'Buyer', value: `<@${interaction.user.id}>` },
                    { name: 'Produk', value: produk },
                    { name: 'Harga', value: `Rp ${parseInt(harga).toLocaleString('id-ID')}` },
                    { name: 'Detail', value: detail }
                )
                .setColor('Yellow');

            // Buyer row
            const rowBuyer = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('btn_pay_info').setLabel('💳 Info Bayar').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('btn_confirm_paid').setLabel('✅ Saya Sudah Bayar').setStyle(ButtonStyle.Success)
            );
            // --- ADMIN ROW BARU ---
            const rowAdmin = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('btn_close_ticket').setLabel('🔒 Tutup Ticket').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('btn_cancel_ticket').setLabel('❌ Batalkan Transaksi').setStyle(ButtonStyle.Secondary)
            );

            await channel.send({ 
                content: `<@${interaction.user.id}> | <@&${process.env.ADMIN_ROLE_ID}>`, 
                embeds: [embed], 
                components: [rowBuyer, rowAdmin] 
            });

            await interaction.editReply({ content: `✅ Tiket: ${channel}` });
        }

        // === BUYER & PEMBAYARAN (Handle seperti kodingan Anda sebelumnya) ===
        // --- ... ---

        // === TUTUP TICKET (ADMIN) ===
        if (interaction.isButton() && interaction.customId === 'btn_close_ticket') {
            if (!interaction.member.roles.cache.has(process.env.ADMIN_ROLE_ID)) 
                return interaction.reply({content: '❌ Admin only', ephemeral: true});
            // Update ke DB: status completed
            // await pool.query("UPDATE transactions SET status = 'completed' WHERE channel_id = $1", [interaction.channel.id]);
            await interaction.reply({ content: '✅ Ticket ditutup & transaksi selesai. Channel akan dihapus dalam 5 detik...' });
            setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
        }

        // === BATALKAN TRANSAKSI (ADMIN) ===
        if (interaction.isButton() && interaction.customId === 'btn_cancel_ticket') {
            if (!interaction.member.roles.cache.has(process.env.ADMIN_ROLE_ID)) 
                return interaction.reply({content: '❌ Admin only', ephemeral: true});
            // Update ke DB: status cancelled
            // await pool.query("UPDATE transactions SET status = 'cancelled' WHERE channel_id = $1", [interaction.channel.id]);
            await interaction.reply({ content: '❌ Transaksi dibatalkan. Channel akan dihapus dalam 5 detik...' });
            setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
        }

    } catch (e) { console.error(e); if (!interaction.replied) interaction.reply({ content: 'Error sistem.', ephemeral: true }); }
});

client.login(process.env.DISCORD_TOKEN);
