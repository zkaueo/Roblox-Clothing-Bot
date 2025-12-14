// =====================================================
// BOT DISCORD – ROUPAS ROBLOX COM IA (VERSÃO AVANÇADA)
// Comandos: /camisa /calca
// Recursos: IA online, upscale 4x, alinhamento ML, preview, botão baixar
// =====================================================

const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  REST,
  Routes,
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const fetch = require('node-fetch');
const FormData = require('form-data');
require('dotenv').config();

// ================= CONFIG =================
const TOKEN = process.env.TOKEN;           // Token do bot Discord
const CLIENT_ID = process.env.CLIENT_ID;   // ID da aplicação
const IA_API_URL = process.env.IA_API_URL; // https://sua-ia.up.railway.app/process

if (!TOKEN || !CLIENT_ID || !IA_API_URL) {
  console.error('❌ Variáveis de ambiente faltando');
  process.exit(1);
}

// ================= CLIENT =================
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// ================= SLASH COMMANDS =================
const commands = [
  new SlashCommandBuilder()
    .setName('camisa')
    .setDescription('Criar camisa Roblox com IA avançada')
    .addAttachmentOption(o =>
      o.setName('imagem').setDescription('Imagem da roupa').setRequired(true)
    )
    .addNumberOption(o =>
      o.setName('brilho').setDescription('Brilho (padrão 1.1)').setRequired(false)
    )
    .addNumberOption(o =>
      o.setName('contraste').setDescription('Contraste (padrão 1.1)').setRequired(false)
    )
    .addStringOption(o =>
      o.setName('modo').setDescription('normal | slim | largo').setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('calca')
    .setDescription('Criar calça Roblox com IA avançada')
    .addAttachmentOption(o =>
      o.setName('imagem').setDescription('Imagem da roupa').setRequired(true)
    )
    .addNumberOption(o =>
      o.setName('brilho').setDescription('Brilho (padrão 1.1)').setRequired(false)
    )
    .addNumberOption(o =>
      o.setName('contraste').setDescription('Contraste (padrão 1.1)').setRequired(false)
    )
    .addStringOption(o =>
      o.setName('modo').setDescription('normal | slim | largo').setRequired(false)
    )
].map(c => c.toJSON());

// ================= READY =================
client.once('ready', async () => {
  console.log(`🤖 Bot online como ${client.user.tag}`);

  const rest = new REST({ version: '10' }).setToken(TOKEN);
  await rest.put(
    Routes.applicationCommands(CLIENT_ID),
    { body: commands }
  );

  console.log('✅ Slash commands registrados');
});

// ================= INTERACTIONS =================
client.on('interactionCreate', async interaction => {
  // Botões
  if (interaction.isButton()) {
    if (interaction.customId.startsWith('download_')) {
      const url = interaction.customId.replace('download_', '');
      return interaction.reply({
        content: `📥 Download direto: ${url}`,
        ephemeral: true
      });
    }
    return;
  }

  // Comandos
  if (!interaction.isChatInputCommand()) return;
  if (!['camisa', 'calca'].includes(interaction.commandName)) return;

  await interaction.deferReply();

  try {
    const imagem = interaction.options.getAttachment('imagem');
    const brilho = interaction.options.getNumber('brilho') ?? 1.1;
    const contraste = interaction.options.getNumber('contraste') ?? 1.1;
    const modo = interaction.options.getString('modo') ?? 'normal';

    // Baixar imagem enviada
    const imgBuffer = await fetch(imagem.url).then(r => r.buffer());

    // Enviar para IA
    const form = new FormData();
    form.append('file', imgBuffer, 'upload.png');
    form.append('tipo', interaction.commandName); // camisa ou calca
    form.append('brilho', brilho);
    form.append('contraste', contraste);
    form.append('modo', modo);
    form.append('upscale', '4x');          // upscale 4x
    form.append('auto_align', 'true');     // alinhamento ML
    form.append('preview', 'true');        // gerar preview

    const res = await fetch(IA_API_URL, {
      method: 'POST',
      body: form
    });

    if (!res.ok) throw new Error('Erro na API da IA');

    const result = await res.json();
    // Esperado da IA:
    // result.template_url -> PNG template Roblox
    // result.preview_url  -> preview realista

    const templateBuffer = await fetch(result.template_url).then(r => r.buffer());
    const attachment = new AttachmentBuilder(templateBuffer, {
      name: 'roblox-template.png'
    });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('📥 Baixar Template')
        .setStyle(ButtonStyle.Link)
        .setURL(result.template_url),
      new ButtonBuilder()
        .setLabel('👕 Ver Preview')
        .setStyle(ButtonStyle.Link)
        .setURL(result.preview_url)
    );

    await interaction.editReply({
      content: '✅ Roupa criada com IA (upscale 4x + alinhamento automático)',
      files: [attachment],
      components: [row]
    });

  } catch (err) {
    console.error(err);
    await interaction.editReply('❌ Erro ao gerar a roupa com IA');
  }
});

// ================= LOGIN =================
client.login(TOKEN);
