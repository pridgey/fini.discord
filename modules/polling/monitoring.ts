import { Client } from "discord.js";
import { MonitorRecord } from "../../types/PocketbaseTables";
import { sendToBotChannelByServerId } from "../../utilities/discord/discordUtils";
import { pb } from "../../utilities/pocketbase";

/**
 * Utility function to check the status of a single monitored service
 */
export const checkServiceStatus = async (
  service: Pick<MonitorRecord, "ip">
) => {
  const httpIncluded =
    service.ip.startsWith("http://") || service.ip.startsWith("https://");

  console.log("Debug - checking service status for:", service);

  // Check service status
  try {
    // Construct timeout for fetch
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const url = httpIncluded ? service.ip : `http://${service.ip}`;

    console.log("Debug - constructed URL:", url);

    const serviceResponse = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      redirect: "follow",
      // Bun-specific: disable connection reuse
      keepalive: false,
    });

    clearTimeout(timeoutId);

    console.log("Debug - service response status:", serviceResponse.status);

    if (serviceResponse.status >= 200 && serviceResponse.status < 400) {
      return true;
    } else {
      return false;
    }
  } catch (error) {
    // Handle error if needed
    console.log("Debug - error checking service status:", error);
    return false;
  }
};

/**
 * Polling function to check all monitored services and update their status in the database
 */
export const checkMonitoredServices = async (cl: Client) => {
  const now = new Date();
  const minute = now.getMinutes();

  const monitoredServices = await pb
    .collection<MonitorRecord>("monitoring")
    .getFullList();

  if (monitoredServices.length === 0) {
    return;
  }

  // Filter services that need to be checked at this minute
  const filteredServices = monitoredServices.filter(
    (service) =>
      minute % service.frequency === 0 || // Interval equals current minute
      (service.frequency === 60 && minute === 0) // Interval is every hour
  );

  for (const service of filteredServices) {
    try {
      const serviceCheckResult = await checkServiceStatus(service);

      if (serviceCheckResult) {
        // Service is reachable
        if (!service.healthy) {
          // Update to healthy
          await pb
            .collection<MonitorRecord>("monitoring")
            .update(service.id!, { healthy: true, failing_since: null });
        }
      } else {
        // Service is not reachable
        if (service.healthy) {
          // Update to unhealthy
          await pb.collection<MonitorRecord>("monitoring").update(service.id!, {
            healthy: false,
            failing_since: new Date().toISOString(),
          });

          let failureDate = new Date();
          if (service.failing_since) {
            failureDate = new Date(service.failing_since);
          }

          // Ping user that service is down
          await sendToBotChannelByServerId(
            cl,
            service.server_id,
            `<@${service.user_id}> The monitored service _'${
              service.name
            }'_ is currently :red_square: **DOWN**. It has been marked as unhealthy since ${failureDate.toLocaleString()}.`
          );
        }
      }
    } catch (error) {
      // Fetch error - treat as unreachable
      if (service.healthy) {
        // Update to unhealthy
        await pb.collection<MonitorRecord>("monitoring").update(service.id!, {
          healthy: false,
          failing_since: new Date().toISOString(),
        });

        let failureDate = new Date();
        if (service.failing_since) {
          failureDate = new Date(service.failing_since);
        }

        // Ping user that service is down
        await sendToBotChannelByServerId(
          cl,
          service.server_id,
          `<@${service.user_id}> The monitored service _'${
            service.name
          }'_ is currently :red_square: **DOWN**. It has been marked as unhealthy since ${failureDate.toLocaleString()}.`
        );
      }
    }
  }
};
