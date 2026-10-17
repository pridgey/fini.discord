/**
 * Type declarations for packages that ship none, covering only what Fini uses.
 */

declare module "gif-encoder-2" {
  export default class GIFEncoder {
    /**
     * @param algorithm Palette quantizer: "neuquant" (default) or "octree"
     * @param useOptimizer Skip re-quantizing frames whose colours barely change
     */
    constructor(
      width: number,
      height: number,
      algorithm?: "neuquant" | "octree",
      useOptimizer?: boolean,
      totalFrames?: number,
    );
    setDelay(ms: number): void;
    setRepeat(times: number): void;
    setQuality(quality: number): void;
    setTransparent(color: number | null): void;
    setThreshold(percent: number): void;
    setDispose(code: number): void;
    start(): void;
    addFrame(frame: Uint8Array | Uint8ClampedArray | Buffer): void;
    finish(): void;
    readonly out: { getData(): Buffer };
  }
}

declare module "@blockzilla101/citation" {
  /** A Papers, Please style citation slip. */
  export class Citation {
    title: string;
    reason: string;
    penalty: string;
    /** Renders the slip; when `out` is given it is also written to that file. */
    render(
      out?: string,
      gif?: boolean,
      frameRate?: number,
      yPos?: number | null,
    ): Promise<Buffer>;
  }
}
