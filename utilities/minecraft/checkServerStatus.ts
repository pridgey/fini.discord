export const MINECRAFT_PORT = 56552;

/**
 * Utility function to check if the Minecraft server is running by attempting a socket connection.
 */
export const getServerStatus = async () => {
  try {
    const socket = await Bun.connect({
      hostname: "localhost",
      port: MINECRAFT_PORT,
      socket: {
        open(socket) {
          socket.end();
        },
        data() {},
        error() {},
      },
    });
    return true;
  } catch {
    return false;
  }
};
