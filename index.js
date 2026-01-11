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
const fs = require('fs');
require('dotenv').config();

const client = new Client({
    intents:  [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// ========== DATA STORAGE ==========
const dataPath = './data';
if (!fs. existsSync(dataPath)) fs.mkdirSync(dataPath);

function loadData(file) {
    const filePath = `${dataPath}/${file}`;
    if (! fs.existsSync(filePath)) {
        const defaultData = file === 'config.json' ? {} : [];
        fs.writeFileSync(filePath, JSON. stringify(defaultData));
    }
    return JSON.parse(fs. readFileSync(filePath));
}

function saveData(file, data) {
    fs.writeFileSync(`${dataPath}/${file}`, JSON.stringify(data, null, 2));
}

function generateTicketId() {
    const config = loadData('config.json');
    const newId = (config.lastTicketId || 1000) + 1;
    config.lastTicketId = newId;
    saveData('config.json', config);
    return newId;
}

// ========== PAYMENT METHODS ==========
const paymentMethods = [
    { name:  'Bank Jago', emoji: '🟣', number: '104004201095', holder: 'Adrianus Indraprasta Dwicaksana' },
    { name: 'BCA', emoji: '🔵', number: '2802312092', holder: 'Adrianus Indraprasta Dwicaksana' },
    { name:  'BluBCA', emoji: '🔵', number: '002460031049', holder: 'Adrianus Indraprasta Dwicaksana' },
    { name:  'GoPay', emoji: '💚', number: '082320010090', holder: 'Adrianus Indraprasta Dwicaksana' },
    { name:  'OVO', emoji: '💜', number: '082320010090', holder: 'Adrianus Indraprasta Dwicaksana' },
    { name:  'QRIS', emoji: '📱', number: 'ADR14NSTORE', holder: 'Scan QR Code di bawah' }
];

// ========== HELPER:  Check Admin ==========
function isAdmin(member) {
    return member.permissions.has(PermissionFlagsBits.Administrator) || 
           member.roles.cache.has(process.env.ADMIN_ROLE_ID);
}

// ========== BOT READY ==========
client. once('ready', async () => {
    console.log(`✅ Bot ${client.user.tag} sudah online!`);
    console.log(`🆔 Bot ID: ${client. user.id}`);
    
    const guild = client.guilds.cache.get(process. env.GUILD_ID);
    if (guild) {
        await guild.commands.set([
            { name: 'setup-ticket', description: 'Setup panel ticket transaksi (Admin only)' },
            { name: 'riwayat', description: 'Lihat semua riwayat transaksi (Admin only)' },
            { 
                name: 'riwayat-user', 
                description: 'Lihat riwayat transaksi user tertentu (Admin only)',
                options: [{ name: 'user', description: 'User yang ingin dilihat riwayatnya', type: 6, required: true }]
            },
            { name: 'pembayaran', description:  'Lihat daftar metode pembayaran' },
            { name: 'testimoni', description: 'Lihat jumlah dan daftar testimoni' },
            { 
                name: 'tambah-testimoni', 
                description: 'Tambah testimoni baru (Admin only)',
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
                name: 'kirim-testimoni', 
                description:  'Kirim testimoni ke channel tertentu (Admin only)',
                options:  [{ name: 'channel', description: 'Channel tujuan testimoni', type: 7, required: true }]
            },
            { name:  'selesai-transaksi', description:  'Tandai transaksi selesai (Admin only, di ticket)' },
            { 
                name: 'log-transaksi', 
                description:  'Lihat log chat dari transaksi tertentu (Admin only)',
                options:  [{ name: 'ticket_id', description: 'ID Ticket (contoh:  1001)', type: 4, required: true }]
            },
            { name:  'stats', description: 'Lihat statistik transaksi (Admin only)' }
        ]);
        console.log('✅ Slash commands terdaftar!');
    }
});

// ========== SAVE CHAT LOG ==========
client. on('messageCreate', async message => {
    if (message.author. bot) return;
    
    if (message.channel. name && message.channel.name. startsWith('ticket-')) {
        const ticketId = parseInt(message.channel. name.split('-')[1]);
        const transactions = loadData('transactions.json');
        const transaction = transactions.find(t => t.ticketId === ticketId);
        
        if (transaction) {
            if (! transaction.chatLog) transaction.chatLog = [];
            transaction.chatLog.push({
                author: message.author. username,
                authorId: message.author. id,
                content: message.content,
                timestamp: new Date().toISOString(),
                attachments: message.attachments.map(a => a.url)
            });
            saveData('transactions.json', transactions);
        }
    }
});

// ========== INTERACTIONS ==========
client. on('interactionCreate', async interaction => {
    try {
        // ==================== SETUP TICKET PANEL ====================
        if (interaction.isChatInputCommand() && interaction.commandName === 'setup-ticket') {
            if (!isAdmin(interaction.member)) {
                return interaction.reply({ content: '❌ Hanya admin yang bisa menggunakan command ini!', ephemeral: true });
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
            await interaction.reply({ content: '✅ Panel ticket berhasil dibuat!', ephemeral: true });
        }

        // ==================== VIEW PAYMENT PUBLIC ====================
        if (interaction.isButton() && interaction.customId === 'view_payment_public') {
            const paymentEmbed = new EmbedBuilder()
                .setTitle('💳 Metode Pembayaran ADR14N Store')
                .setColor('#00FF00');

            let description = '**🏦 Transfer Bank:**\n\n';
            paymentMethods.filter(p => p.name. includes('Bank') || p.name.includes('BCA') || p.name. includes('Blu')).forEach(p => {
                description += `${p.emoji} **${p.name}**\n┣ 📝 No.  Rek: \`${p.number}\`\n┗ 👤 A. N:  ${p.holder}\n\n`;
            });

            description += '**📱 E-Wallet:**\n\n';
            paymentMethods.filter(p => p. name === 'GoPay' || p.name === 'OVO').forEach(p => {
                description += `${p.emoji} **${p.name}**\n┣ 📱 No. HP: \`${p.number}\`\n┗ 👤 A. N: ${p. holder}\n\n`;
            });

            description += '**📱 QRIS (Semua Aplikasi):**\n📱 **ADR14NSTORE**\n┗ Scan QR Code di bawah\n';
            paymentEmbed.setDescription(description);
            paymentEmbed.setFooter({ text: '📸 Kirim bukti pembayaran setelah transfer' });

            if (process.env.QRIS_IMAGE_URL) {
                paymentEmbed.setImage(process.env. QRIS_IMAGE_URL);
            }

            await interaction.reply({ embeds: [paymentEmbed], ephemeral: true });
        }

        // ==================== OPEN MODAL FORM ====================
        if (interaction.isButton() && interaction.customId === 'open_ticket_modal') {
            const transactions = loadData('transactions.json');
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
                .setPlaceholder('Contoh:  150000')
                .setStyle(TextInputStyle. Short).setRequired(true).setMaxLength(15);

            const detailInput = new TextInputBuilder()
                .setCustomId('detail_input').setLabel('Detail tambahan (opsional)')
                .setPlaceholder('Contoh:  Region Indonesia, butuh cepat, dll')
                .setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(500);

            modal.addComponents(
                new ActionRowBuilder().addComponents(produkInput),
                new ActionRowBuilder().addComponents(hargaInput),
                new ActionRowBuilder().addComponents(detailInput)
            );

            await interaction.showModal(modal);
        }

        // ==================== HANDLE MODAL SUBMIT ====================
        if (interaction.isModalSubmit() && interaction.customId === 'ticket_form') {
            await interaction.deferReply({ ephemeral:  true });

            const produk = interaction.fields.getTextInputValue('produk_input');
            const hargaRaw = interaction.fields. getTextInputValue('harga_input');
            const detail = interaction.fields. getTextInputValue('detail_input') || '-';
            const harga = parseInt(hargaRaw. replace(/\D/g, '')) || 0;

            const ticketId = generateTicketId();
            const ticketName = `ticket-${ticketId}`;
            
            const ticketChannel = await interaction.guild.channels.create({
                name:  ticketName,
                type: ChannelType.GuildText,
                permissionOverwrites:  [
                    { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                    { id: interaction.user.id, allow: [PermissionFlagsBits. ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] },
                    { id: process.env.ADMIN_ROLE_ID, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits. SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.AttachFiles] },
                    { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits. SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks] }
                ]
            });

            const ticketEmbed = new EmbedBuilder()
                .setTitle(`🎫 Ticket #${ticketId}`)
                .setDescription(`Halo ${interaction.user}! Pesanan Anda telah diterima.\n\nAdmin akan segera merespons pesanan Anda.\n───────────────────`)
                .addFields(
                    { name: '👤 Buyer', value: `${interaction.user. tag}`, inline: true },
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

            const ticketButtons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder().setCustomId('show_payment').setLabel('💳 Metode Pembayaran').setStyle(ButtonStyle. Success),
                    new ButtonBuilder().setCustomId('confirm_paid').setLabel('✅ Sudah Bayar').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('close_ticket').setLabel('🔒 Tutup Ticket').setStyle(ButtonStyle. Danger)
                );

            await ticketChannel.send({ content: `${interaction.user} | <@&${process.env. ADMIN_ROLE_ID}>`, embeds: [ticketEmbed], components: [ticketButtons] });
            await interaction.editReply({ content: `✅ Ticket berhasil dibuat!\n\n🎫 **Ticket ID:** \`${ticketId}\`\n📦 **Produk:** ${produk}\n💰 **Harga:** Rp${harga. toLocaleString('id-ID')}\n📍 **Channel:** ${ticketChannel}` });

            const transactions = loadData('transactions.json');
            transactions.push({
                ticketId, buyerId: interaction.user.id, buyerName: interaction. user.username, buyerTag: interaction.user. tag,
                channelId: ticketChannel.id, status: 'open', paymentStatus: 'unpaid', product: produk, amount: harga, detail,
                createdAt: new Date().toISOString(), paidAt: null, completedAt: null, closedAt: null, closedBy: null, chatLog: []
            });
            saveData('transactions.json', transactions);
        }

        // ==================== SHOW PAYMENT ====================
        if (interaction.isButton() && interaction.customId === 'show_payment') {
            const paymentEmbed = new EmbedBuilder().setTitle('💳 Metode Pembayaran ADR14N Store').setColor('#FFD700');

            let description = '**🏦 Transfer Bank:**\n\n';
            paymentMethods.filter(p => p. name.includes('Bank') || p.name.includes('BCA') || p.name.includes('Blu')).forEach(p => {
                description += `${p.emoji} **${p.name}**\n┣ 📝 \`${p.number}\`\n┗ 👤 ${p.holder}\n\n`;
            });
            description += '**📱 E-Wallet:**\n\n';
            paymentMethods.filter(p => p.name === 'GoPay' || p. name === 'OVO').forEach(p => {
                description += `${p.emoji} **${p.name}**\n┣ 📱 \`${p.number}\`\n┗ 👤 ${p.holder}\n\n`;
            });
            description += '**📱 QRIS (Semua Aplikasi):**\nMerchant:  **ADR14NSTORE**\n';
            paymentEmbed.setDescription(description);
            paymentEmbed.setFooter({ text:  '⚠️ Setelah transfer, klik tombol "Sudah Bayar" dan kirim bukti!' });

            if (process.env. QRIS_IMAGE_URL) paymentEmbed.setImage(process.env.QRIS_IMAGE_URL);
            await interaction.reply({ embeds: [paymentEmbed], ephemeral: true });
        }

        // ==================== CONFIRM PAID ====================
        if (interaction. isButton() && interaction.customId === 'confirm_paid') {
            const ticketId = parseInt(interaction.channel. name.split('-')[1]);
            const transactions = loadData('transactions.json');
            const transaction = transactions.find(t => t.ticketId === ticketId);
            
            if (transaction && transaction.buyerId === interaction.user.id) {
                const embed = new EmbedBuilder()
                    .setTitle('💰 Konfirmasi Pembayaran')
                    .setDescription(`${interaction.user} mengkonfirmasi sudah melakukan pembayaran.\n\n**📸 Silakan kirim bukti transfer/pembayaran di chat ini.**\n\nAdmin akan segera memverifikasi pembayaran Anda. `)
                    .setColor('#FFA500').setTimestamp();

                transaction.paymentStatus = 'pending_verification';
                transaction.paidAt = new Date().toISOString();
                saveData('transactions.json', transactions);

                await interaction.reply({ embeds: [embed] });
            } else {
                await interaction.reply({ content: '❌ Hanya buyer yang bisa mengkonfirmasi pembayaran!', ephemeral: true });
            }
        }

        // ==================== CLOSE TICKET ====================
        if (interaction.isButton() && interaction.customId === 'close_ticket') {
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
            if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Hanya admin! ', ephemeral:  true });

            const ticketId = parseInt(interaction.channel. name.split('-')[1]);
            const transactions = loadData('transactions.json');
            const transaction = transactions.find(t => t.ticketId === ticketId);
            
            if (transaction) {
                transaction.status = 'completed';
                transaction. paymentStatus = 'paid';
                transaction.completedAt = new Date().toISOString();
                transaction.closedBy = interaction.user. username;
                saveData('transactions.json', transactions);

                const embed = new EmbedBuilder()
                    .setTitle('✅ Transaksi Selesai!')
                    .setDescription(`Transaksi **#${ticketId}** berhasil diselesaikan!\n\nTerima kasih telah berbelanja di **ADR14N Store** 🎉`)
                    .addFields(
                        { name: '👤 Buyer', value: transaction.buyerTag, inline: true },
                        { name: '📦 Produk', value: transaction.product, inline: true },
                        { name: '💰 Total', value: `Rp${transaction. amount.toLocaleString('id-ID')}`, inline: true }
                    )
                    .setColor('#00FF00').setFooter({ text: 'Channel akan dihapus dalam 10 detik.. .' }).setTimestamp();

                await interaction.update({ embeds: [embed], components: [] });
                setTimeout(() => interaction.channel.delete().catch(console.error), 10000);
            }
        }

        // ==================== CANCEL TRANSACTION ====================
        if (interaction.isButton() && interaction.customId === 'cancel_transaction') {
            if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Hanya admin! ', ephemeral:  true });

            const ticketId = parseInt(interaction.channel. name.split('-')[1]);
            const transactions = loadData('transactions.json');
            const transaction = transactions.find(t => t.ticketId === ticketId);
            
            if (transaction) {
                transaction.status = 'cancelled';
                transaction.closedAt = new Date().toISOString();
                transaction.closedBy = interaction. user.username;
                saveData('transactions.json', transactions);

                const embed = new EmbedBuilder()
                    . setTitle('❌ Transaksi Dibatalkan')
                    .setDescription(`Transaksi **#${ticketId}** telah dibatalkan. `)
                    .addFields({ name: '👤 Buyer', value: transaction.buyerTag, inline: true }, { name: '📦 Produk', value: transaction. product, inline: true })
                    . setColor('#FF0000').setFooter({ text: 'Channel akan dihapus dalam 10 detik...' }).setTimestamp();

                await interaction.update({ embeds: [embed], components: [] });
                setTimeout(() => interaction.channel.delete().catch(console.error), 10000);
            }
        }

        // ==================== BACK CLOSE ====================
        if (interaction. isButton() && interaction.customId === 'back_close') {
            await interaction.message.delete().catch(() => {});
        }

        // ==================== SELESAI TRANSAKSI ====================
        if (interaction.isChatInputCommand() && interaction.commandName === 'selesai-transaksi') {
            if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Hanya admin!', ephemeral: true });
            if (!interaction.channel.name. startsWith('ticket-')) return interaction.reply({ content: '❌ Gunakan di channel ticket!', ephemeral: true });

            const ticketId = parseInt(interaction.channel.name.split('-')[1]);
            const transactions = loadData('transactions.json');
            const transaction = transactions.find(t => t.ticketId === ticketId);

            if (transaction) {
                transaction. status = 'completed';
                transaction. paymentStatus = 'paid';
                transaction.completedAt = new Date().toISOString();
                transaction.closedBy = interaction.user.username;
                saveData('transactions. json', transactions);

                const embed = new EmbedBuilder()
                    .setTitle('✅ Transaksi Selesai!')
                    .setDescription(`Transaksi **#${ticketId}** telah ditandai selesai! `)
                    .addFields(
                        { name: '👤 Buyer', value: transaction. buyerTag, inline: true },
                        { name: '📦 Produk', value: transaction.product || '-', inline: true },
                        { name: '💰 Total', value: transaction.amount ?  `Rp${transaction.amount.toLocaleString('id-ID')}` : '-', inline:  true }
                    )
                    . setColor('#00FF00').setFooter({ text: 'Terima kasih!  🎉' }).setTimestamp();

                await interaction.reply({ embeds: [embed] });
            }
        }

        // ==================== RIWAYAT ====================
        if (interaction.isChatInputCommand() && interaction.commandName === 'riwayat') {
            if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Hanya admin!', ephemeral: true });

            const transactions = loadData('transactions.json');
            if (transactions.length === 0) return interaction.reply({ content: '📭 Belum ada riwayat transaksi. ', ephemeral:  true });

            const completed = transactions.filter(t => t.status === 'completed').length;
            const open = transactions.filter(t => t.status === 'open').length;
            const cancelled = transactions.filter(t => t.status === 'cancelled').length;
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
            transactions.slice(-10).reverse().forEach(t => {
                const statusEmoji = t.status === 'completed' ?  '✅' :  t.status === 'open' ? '⏳' : '❌';
                description += `${statusEmoji} **#${t.ticketId}** - ${t.buyerTag}\n┗ 📦 ${t.product || '-'} | 💰 Rp${(t.amount || 0).toLocaleString('id-ID')}\n\n`;
            });

            embed.setDescription(description);
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // ==================== RIWAYAT USER ====================
        if (interaction.isChatInputCommand() && interaction.commandName === 'riwayat-user') {
            if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Hanya admin!', ephemeral: true });

            const user = interaction.options.getUser('user');
            const transactions = loadData('transactions. json');
            const userTransactions = transactions. filter(t => t.buyerId === user.id);

            if (userTransactions.length === 0) return interaction.reply({ content: `📭 **${user.tag}** belum memiliki riwayat transaksi.`, ephemeral: true });

            const embed = new EmbedBuilder().setTitle(`📋 Riwayat:  ${user.tag}`).setThumbnail(user.displayAvatarURL()).setColor('#5865F2');

            let description = '';
            userTransactions.forEach(t => {
                const statusEmoji = t.status === 'completed' ? '✅' : t. status === 'open' ? '⏳' : '❌';
                const date = new Date(t.createdAt).toLocaleDateString('id-ID');
                description += `${statusEmoji} **#${t.ticketId}** - ${date}\n┣ 📦 ${t.product || '-'}\n┗ 💰 Rp${(t.amount || 0).toLocaleString('id-ID')}\n\n`;
            });

            embed. setDescription(description).setFooter({ text: `Total: ${userTransactions.length} transaksi` });
            await interaction. reply({ embeds:  [embed], ephemeral: true });
        }

        // ==================== LOG TRANSAKSI ====================
        if (interaction. isChatInputCommand() && interaction.commandName === 'log-transaksi') {
            if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Hanya admin!', ephemeral: true });

            const ticketId = interaction.options.getInteger('ticket_id');
            const transactions = loadData('transactions. json');
            const transaction = transactions.find(t => t. ticketId === ticketId);

            if (! transaction) return interaction. reply({ content: `❌ Ticket #${ticketId} tidak ditemukan. `, ephemeral: true });

            const embed = new EmbedBuilder()
                .setTitle(`📝 Log - Ticket #${ticketId}`)
                .setColor('#5865F2')
                .addFields(
                    { name: '👤 Buyer', value: transaction.buyerTag, inline:  true },
                    { name: '📦 Produk', value: transaction. product || '-', inline: true },
                    { name: '💰 Harga', value:  `Rp${(transaction.amount || 0).toLocaleString('id-ID')}`, inline: true },
                    { name: '📊 Status', value:  transaction.status, inline: true }
                );

            if (transaction.chatLog && transaction.chatLog. length > 0) {
                let chatText = '';
                transaction.chatLog.slice(-15).forEach(msg => {
                    const time = new Date(msg.timestamp).toLocaleTimeString('id-ID');
                    chatText += `**[${time}] ${msg.author}:** ${msg.content}\n`;
                });
                if (chatText.length > 1000) chatText = chatText.slice(-1000);
                embed.setDescription(chatText);
            } else {
                embed.setDescription('*Tidak ada log chat.*');
            }

            await interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // ==================== STATS ====================
        if (interaction.isChatInputCommand() && interaction.commandName === 'stats') {
            if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Hanya admin!', ephemeral: true });

            const transactions = loadData('transactions.json');
            const testimonials = loadData('testimonials.json');

            const completed = transactions.filter(t => t.status === 'completed');
            const totalRevenue = completed. reduce((sum, t) => sum + (t.amount || 0), 0);
            const avgRating = testimonials.length > 0 ?  (testimonials.reduce((sum, t) => sum + t.rating, 0) / testimonials.length).toFixed(1) : 0;

            const embed = new EmbedBuilder()
                .setTitle('📊 Statistik ADR14N Store')
                .setColor('#FFD700')
                .addFields(
                    { name:  '📈 Total Transaksi', value: `${transactions.length}`, inline: true },
                    { name: '✅ Transaksi Selesai', value: `${completed.length}`, inline: true },
                    { name: '💰 Total Pendapatan', value: `Rp${totalRevenue.toLocaleString('id-ID')}`, inline: true },
                    { name: '⭐ Total Testimoni', value: `${testimonials.length}`, inline: true },
                    { name: '⭐ Rata-rata Rating', value:  `${avgRating}/5`, inline: true }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // ==================== PEMBAYARAN ====================
        if (interaction. isChatInputCommand() && interaction.commandName === 'pembayaran') {
            const embed = new EmbedBuilder().setTitle('💳 Metode Pembayaran ADR14N Store').setColor('#00FF00');

            let description = '**🏦 Transfer Bank:**\n\n';
            paymentMethods.filter(p => p. name.includes('Bank') || p.name.includes('BCA') || p.name.includes('Blu')).forEach(p => {
                description += `${p.emoji} **${p.name}**\n┣ 📝 \`${p.number}\`\n┗ 👤 ${p.holder}\n\n`;
            });
            description += '**📱 E-Wallet:**\n\n';
            paymentMethods.filter(p => p. name === 'GoPay' || p.name === 'OVO').forEach(p => {
                description += `${p.emoji} **${p.name}**\n┣ 📱 \`${p.number}\`\n┗ 👤 ${p.holder}\n\n`;
            });
            description += '**📱 QRIS:**\nMerchant:  **ADR14NSTORE**\n';

            embed.setDescription(description);
            if (process.env. QRIS_IMAGE_URL) embed.setImage(process.env. QRIS_IMAGE_URL);
            await interaction.reply({ embeds: [embed] });
        }

        // ==================== TESTIMONI ====================
        if (interaction.isChatInputCommand() && interaction.commandName === 'testimoni') {
            const testimonials = loadData('testimonials.json');
            const avgRating = testimonials.length > 0 ?  (testimonials.reduce((sum, t) => sum + t. rating, 0) / testimonials.length).toFixed(1) : 0;

            const embed = new EmbedBuilder()
                .setTitle('⭐ Testimoni ADR14N Store')
                .setColor('#FFD700')
                .addFields({ name: '📊 Total', value: `${testimonials.length}`, inline: true }, { name: '⭐ Rating', value: `${avgRating}/5`, inline: true });

            if (testimonials.length > 0) {
                let desc = '\n';
                testimonials. slice(-5).reverse().forEach(t => {
                    desc += `${'⭐'. repeat(t.rating)} **${t.username}**\n"${t.message}"\n\n`;
                });
                embed.setDescription(desc);
            } else {
                embed.setDescription('\n*Belum ada testimoni.*');
            }

            await interaction.reply({ embeds: [embed] });
        }

        // ==================== TAMBAH TESTIMONI ====================
        if (interaction.isChatInputCommand() && interaction.commandName === 'tambah-testimoni') {
            if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Hanya admin!', ephemeral: true });

            const user = interaction.options. getUser('user');
            const message = interaction.options. getString('pesan');
            const rating = interaction.options. getInteger('rating');

            const testimonials = loadData('testimonials.json');
            testimonials.push({
                id: Date.now(), oderId: user.id, username: user.username, userTag: user.tag,
                userAvatar: user.displayAvatarURL(), message, rating, createdAt: new Date().toISOString()
            });
            saveData('testimonials.json', testimonials);

            const embed = new EmbedBuilder()
                .setTitle('✅ Testimoni Ditambahkan!')
                .setDescription(`"${message}"`)
                .addFields({ name: '👤 User', value: user. tag, inline: true }, { name: '⭐ Rating', value: '⭐'. repeat(rating), inline: true })
                .setThumbnail(user.displayAvatarURL())
                .setColor('#00FF00');

            await interaction. reply({ embeds:  [embed] });
        }

        // ==================== KIRIM TESTIMONI ====================
        if (interaction.isChatInputCommand() && interaction.commandName === 'kirim-testimoni') {
            if (!isAdmin(interaction.member)) return interaction.reply({ content: '❌ Hanya admin!', ephemeral: true });

            const channel = interaction.options.getChannel('channel');
            const testimonials = loadData('testimonials.json');

            if (testimonials.length === 0) return interaction.reply({ content: '❌ Belum ada testimoni. ', ephemeral:  true });

            const avgRating = (testimonials.reduce((sum, t) => sum + t.rating, 0) / testimonials.length).toFixed(1);

            const headerEmbed = new EmbedBuilder()
                .setTitle('⭐ TESTIMONI ADR14N STORE ⭐')
                .setDescription(`📊 **Total:** ${testimonials.length} | ⭐ **Rating:** ${avgRating}/5\n\n*Terima kasih kepada semua pelanggan setia! *`)
                .setColor('#FFD700').setTimestamp();

            await channel.send({ embeds: [headerEmbed] });

            for (const t of testimonials. slice(-10)) {
                const testiEmbed = new EmbedBuilder()
                    .setAuthor({ name: t.userTag || t.username, iconURL: t.userAvatar || null })
                    .setDescription(`"${t.message}"`)
                    .addFields({ name: 'Rating', value: '⭐'.repeat(t.rating), inline: true })
                    .setColor('#FFD700');
                await channel.send({ embeds: [testiEmbed] });
            }

            await interaction.reply({ content: `✅ Testimoni dikirim ke ${channel}!`, ephemeral: true });
        }

    } catch (error) {
        console. error('Error:', error);
        if (interaction.replied || interaction.deferred) {
            await interaction. followUp({ content:  '❌ Terjadi error.  Silakan coba lagi. ', ephemeral:  true }).catch(() => {});
        } else {
            await interaction.reply({ content: '❌ Terjadi error.  Silakan coba lagi.', ephemeral: true }).catch(() => {});
        }
    }
});

// ========== LOGIN ==========
client.login(process.env. DISCORD_TOKEN);
