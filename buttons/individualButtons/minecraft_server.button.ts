import { exec } from "child_process";
import { ButtonInteraction } from "discord.js";
import { MINECRAFT_PORT } from "../../utilities/minecraft/checkServerStatus";
import { MINECRAFT_SERVER_DIR } from "../../utilities/minecraft/minecraft.config";
import { ensureNeoForgeInstalled } from "../../utilities/minecraft/neoforgeInstaller";
import {
  getLogMarker,
  SCREEN_SESSION,
  waitForServerReady,
} from "../../utilities/minecraft/waitForServerReady";
import { getPublicIP } from "../../utilities/misc/getPublicIp";

export const namespace = "minecraft_server";

export async function execute(interaction: ButtonInteraction, args: string[]) {
  try {
    // A user has requested to start the server
    await interaction.update({
      content: `<@${interaction.user.id}> has started the Minecraft server! Starting...`,
      components: [],
    });

    // Booting can outlive the interaction token, so never let a status
    // update take down the actual server start
    const sendStatus = async (content: string) => {
      try {
        await interaction.followUp({ content });
      } catch (error) {
        console.error("Failed to send Minecraft status update:", error);
      }
    };

    try {
      // A pack update can bump the NeoForge version without the libraries for
      // it being installed, which startserver.sh won't catch on its own
      const { version, didInstall } = await ensureNeoForgeInstalled((message) =>
        sendStatus(`⚙️ ${message}`),
      );

      if (didInstall) {
        await sendStatus(`✅ NeoForge ${version} installed. Starting server...`);
      }

      // Anything already in latest.log belongs to a previous boot
      const logMarker = await getLogMarker();

      await new Promise<void>((resolve, reject) => {
        exec(
          `cd ${MINECRAFT_SERVER_DIR} && ATM10_RESTART=false screen -dmS ${SCREEN_SESSION} ./startserver.sh`,
          (error) => {
            if (error) reject(error);
            else resolve();
          },
        );
      });

      await sendStatus(
        "⏳ Launched. Loading mods — this usually takes a few minutes...",
      );

      const result = await waitForServerReady({ logMarker });
      const minutes = (result.elapsedMs / 60000).toFixed(1);

      if (result.status === "failed") {
        await sendStatus(
          `❌ The server failed to boot after ${minutes} minutes: **${result.reason}**.\nCheck \`logs/latest.log\` for details.`,
        );
        return;
      }

      if (result.status === "timeout") {
        await sendStatus(
          `⚠️ The server is still loading after ${minutes} minutes and hasn't reported itself ready. It may still come up — check \`logs/latest.log\`.`,
        );
        return;
      }

      const publicIp = await getPublicIP();

      await sendStatus(`✅ Minecraft server started successfully in ${minutes} minutes!\nEmpty server shutdown monitoring is active.
              \nConnect at: \`${publicIp}:${MINECRAFT_PORT}\``);
    } catch (error) {
      console.error("Error starting Minecraft server:", error);
      await sendStatus(
        "❌ Failed to start the Minecraft server. Please check the logs.",
      );
    }
    return;
  } catch (error) {
    console.error("Error handling minecraft-server button actions:", error);
    await interaction.reply({
      content: "❌ Failed to handle minecraft server action",
    });
  }
}
