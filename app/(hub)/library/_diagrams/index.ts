import type { StaticImageData } from "next/image";
import agenticInternalTool from "./agentic-internal-tool.png";
import aiServiceAgent from "./ai-service-agent.png";
import incrementalMigration from "./incremental-migration.png";
import peakTrafficBooking from "./peak-traffic-booking.png";

// Diagrams ship with the code, keyed by architecture id. Static imports are served
// from /_next/static (outside the sign-in proxy) and resized by Image Optimization,
// which caches each size on the CDN.
export const DIAGRAMS: Record<string, StaticImageData> = {
  "agentic-internal-tool": agenticInternalTool,
  "ai-service-agent": aiServiceAgent,
  "incremental-migration": incrementalMigration,
  "peak-traffic-booking": peakTrafficBooking,
};
