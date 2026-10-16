import { ButtonInteraction } from "discord.js";
import { requireAdmin } from "../../utilities/discord/isAdmin";
import { MINECRAFT_SERVER_DIR } from "../../modules/minecraft/minecraft.config";
import { checkForPackUpdate } from "../../modules/minecraft/packUpdate";

export const namespace = "minecraft_update";

export async function execute(interaction: ButtonInteraction, args: string[]) {
  try {
    // Everyone can see this button so they know an update is waiting, but
    // only the admin can act on it
    if (!(await requireAdmin(interaction, "install modpack updates"))) {
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const update = await checkForPackUpdate();

    if (!update) {
      await interaction.editReply(
        "❌ Couldn't determine the modpack version right now. Try again shortly.",
      );
      return;
    }

    if (!update.updateAvailable) {
      await interaction.editReply(
        `✅ **${update.name}** is already up to date (\`${update.installed}\`).`,
      );
      return;
    }

    // Installing means replacing directories on disk, which isn't something to
    // automate behind a button - these are the steps that actually work
    await interaction.editReply(
      [
        `⬆️ **${update.name}** \`${update.installed}\` → \`${update.latest}\``,
        update.releasedAt
          ? `Released <t:${Math.floor(new Date(update.releasedAt).getTime() / 1000)}:R>`
          : "",
        "",
        `**1.** Download the **server** files for \`${update.latest}\` from <${update.filesUrl}>`,
        "**2.** Make sure the server is stopped (`screen -ls` should be empty)",
        `**3.** In \`${MINECRAFT_SERVER_DIR}\`, **delete** \`mods/\` and \`config/\` and put the new ones in place.`,
        "Extracting over the top instead of replacing leaves both versions of every jar, and the server won't boot.",
        "**4.** Leave `world/`, `server.properties`, `ops.json`, `whitelist.json`, `banned-*.json` and `usercache.json` alone.",
        "**5.** Press **Start Server** — I'll run the NeoForge installer automatically if the pack bumped its version.",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  } catch (error) {
    console.error("Error handling minecraft-update button actions:", error);

    if (interaction.deferred) {
      await interaction.editReply("❌ Failed to check for a modpack update");
    } else if (!interaction.replied) {
      await interaction.reply({
        content: "❌ Failed to check for a modpack update",
        ephemeral: true,
      });
    }
  }
}
