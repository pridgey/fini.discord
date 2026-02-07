import {
  ButtonInteraction,
  SectionBuilder,
  ButtonStyle,
  MessageFlags,
  ContainerBuilder,
} from "discord.js";
import { queryAnime } from "../../modules/finistocks/utilities";

export const namespace = "view_anistock_details";

export async function execute(interaction: ButtonInteraction, args: string[]) {
  try {
    const [animeId, userId] = args;

    if (interaction.user.id !== userId) {
      await interaction.reply({
        content: "❌ This button is not for you!",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    const queryResult = await queryAnime(animeId);
    if (queryResult.length === 0) {
      await interaction.reply({
        content: "❌ Anime not found",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    const anime = queryResult[0];

    const cardDetail = new ContainerBuilder()
      .setAccentColor(0x0099ff)
      .addTextDisplayComponents((text) => text.setContent(`## ${anime.title}`))
      .addMediaGalleryComponents((media) =>
        media.addItems((item) =>
          item.setURL(anime.image_url).setDescription(`${anime.title} Image`),
        ),
      )
      .addTextDisplayComponents((text) =>
        text.setContent(
          `**Season:** ${anime.season || "N/A"} • **Year:** ${
            anime.year || "N/A"
          } • **Status:** ${anime.status}`,
        ),
      )
      .addSeparatorComponents((sep) => sep)
      .addTextDisplayComponents((text) =>
        text.setContent(
          `**Current AniStock Price:** ${anime.initial_stock_price.toFixed(
            2,
          )}\n**Hype Score:** ${
            anime.initial_hype_score
          }\n**Volatility Rating:** ${anime.volatility_rating}\n**Rating:** ${
            anime.initial_popularity
          }`,
        ),
      );

    // Create a detailed card-like view
    const detailSection = new SectionBuilder().addTextDisplayComponents(
      (textDisplay) =>
        textDisplay.setContent(
          `# ${anime.title}\n\n` +
            `**Season** ${anime.season || "N/A"} • **Year** ${
              anime.year || "N/A"
            } • **Status** ${anime.status}\n\n` +
            `━━━━━━━━━━━━━━━━━━━━\n\n` +
            `**📊 Stock Information**\n` +
            `• MAL ID: \`${anime.mal_id}\`\n` +
            `• Current Price: \`$${anime.initial_stock_price.toFixed(2)}\`\n` +
            `• Rating: \`${anime.initial_popularity}\`\n` +
            `• Hype Score: \`${anime.initial_hype_score}\`\n` +
            `• Volatility: \`${anime.volatility_rating}\`\n\n` +
            `━━━━━━━━━━━━━━━━━━━━\n\n` +
            `*Requested by ${interaction.user.username}*`,
        ),
    );

    // // Back button section - explicitly return the button
    // const backSection = new SectionBuilder()
    //   .addTextDisplayComponents((textDisplay) => textDisplay.setContent(`—`))
    //   .setButtonAccessory((button) => {
    //     return button
    //       .setCustomId(`back_to_anistock_list:${userId}`)
    //       .setLabel("← Back to Results")
    //       .setStyle(ButtonStyle.Secondary);
    //   });

    await interaction.update({
      components: [cardDetail],
      flags: [MessageFlags.IsComponentsV2],
    });
  } catch (error) {
    console.error("Error handling view anime details:", error);
    await interaction.reply({
      content: "❌ Failed to load anime details",
      flags: [MessageFlags.Ephemeral],
    });
  }
}
