import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  MessageFlags,
} from "discord.js";
import { exec } from "child_process";
import { monitor } from "../../utilities/minecraft/minecraftMonitoring";
import { getPublicIP } from "../../utilities/misc/getPublicIp";
import { MINECRAFT_PORT } from "../../utilities/minecraft/checkServerStatus";

export const namespace = "minecraft_server";

export async function execute(interaction: ButtonInteraction, args: string[]) {
  try {
    const [state, userId] = args;

    if (!["offline", "confirm"].includes(state)) {
      return null;
    }

    if (state === "offline") {
      // Server is currently offline, someone clicked the button to start it
      const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`${namespace}:confirm:${interaction.user.id}`)
          .setLabel("Second User Confirm")
          .setStyle(ButtonStyle.Primary),
      );

      await interaction.update({
        content: `The Fini Minecraft server is currently offline. <@${userId}> has requested to start it. A second user must agree.`,
        components: [buttonRow],
      });
      return;
    }

    if (state === "confirm") {
      if (userId === interaction.user.id) {
        // The requester cannot confirm their own request
        await interaction.reply({
          content:
            "❌ You cannot confirm your own request to start the server.",
          flags: [MessageFlags.Ephemeral],
        });
        return;
      } else {
        // A second user has confirmed, start the server
        await interaction.update({
          content: `<@${interaction.user.id}> has confirmed to start the Minecraft server! Starting...`,
          components: [],
        });

        try {
          await new Promise<void>((resolve, reject) => {
            exec(
              "cd /opt/minecraft/AllTheMons && screen -dmS minecraft ./startserver.sh",
              (error) => {
                if (error) reject(error);
                else resolve();
              },
            );
          });

          // Wait for server to initialize (adjust time based on your server's startup speed)
          await new Promise((resolve) => setTimeout(resolve, 10000));

          // Start monitoring
          await monitor.startMonitoring();

          const publicIp = await getPublicIP();

          // Send follow-up message
          await interaction.followUp({
            content: `✅ Minecraft server started successfully! Auto-shutdown monitoring is active.
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
      }
    }
  } catch (error) {
    console.error("Error handling minecraft-server button actions:", error);
    await interaction.reply({
      content: "❌ Failed to handle minecraft server action",
    });
  }
}
