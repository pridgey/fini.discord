import { exec } from "child_process";
import { ButtonInteraction } from "discord.js";
import { MINECRAFT_PORT } from "../../utilities/minecraft/checkServerStatus";
import { getPublicIP } from "../../utilities/misc/getPublicIp";

export const namespace = "minecraft_server";

export async function execute(interaction: ButtonInteraction, args: string[]) {
  try {
    // A user has requested to start the server
    await interaction.update({
      content: `<@${interaction.user.id}> has started the Minecraft server! Starting...`,
      components: [],
    });

    try {
      await new Promise<void>((resolve, reject) => {
        exec(
          "cd /opt/minecraft/AllTheMons && ATM10_RESTART=false screen -dmS minecraft ./startserver.sh",
          (error) => {
            if (error) reject(error);
            else resolve();
          },
        );
      });

      // Wait for server to initialize (adjust time based on your server's startup speed)
      await new Promise((resolve) => setTimeout(resolve, 10000));

      const publicIp = await getPublicIP();

      // Send follow-up message
      await interaction.followUp({
        content: `✅ Minecraft server started successfully! Empty server shutdown monitoring is active.
              \nConnect at: \`${publicIp}:${MINECRAFT_PORT}\``,
      });
    } catch (error) {
      console.error("Error starting Minecraft server:", error);
      await interaction.followUp({
        content:
          "❌ Failed to start the Minecraft server. Please check the logs.",
      });
    }
    return;
  } catch (error) {
    console.error("Error handling minecraft-server button actions:", error);
    await interaction.reply({
      content: "❌ Failed to handle minecraft server action",
    });
  }
}
