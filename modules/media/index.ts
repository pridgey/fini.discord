/**
 * Shared plumbing for `/ytdlp` and `/convert`.
 *
 * Layering, innermost first:
 *   runProcess           - spawn with a timeout, no shell
 *   sandbox              - bubblewrap confinement for ffmpeg and yt-dlp
 *   mediaFormats         - containers, codecs, and what each one can hold
 *   chromaKey            - colour parsing for the key
 *   timeRange            - start/end parsing, shared by both commands
 *   uploadLimit          - what this guild will accept
 *   urlSafety            - refuses urls that resolve to private addresses
 *   probeMedia           - reads a file so the filters can be built
 *   convertMedia         - ffmpeg, including squeezing to an upload limit
 *   downloadMedia        - yt-dlp
 *   workspace/mediaJobs  - temp files, admission control, time budget
 */

export * from "./chromaKey";
export * from "./convertMedia";
export * from "./downloadMedia";
export * from "./mediaFormats";
export * from "./mediaJobs";
export * from "./probeMedia";
export * from "./runProcess";
export * from "./timeRange";
export * from "./uploadLimit";
export * from "./sandbox";
export * from "./urlSafety";
export * from "./workspace";
