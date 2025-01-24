import { GifUtil, GifFrame, BitmapImage, GifCodec } from "gifwrap";
import { Jimp } from "jimp";
import GifEncoder from "gif-encoder-2";
import sharp from "sharp";
import path from "path";

export async function createGifOverlay(
  cardImageBuffer: Buffer,
  holographicGifPath: string
): Promise<Buffer> {
  console.time();
  // Load the trading card image
  const cardImage = await Jimp.read(cardImageBuffer);

  // Resize the trading card image to reduce memory usage
  cardImage.resize({ w: 500 }); // Adjust dimensions as needed

  // Load the holographic GIF
  const gif = await GifUtil.read(holographicGifPath);

  // Create a new GIF with the same dimensions as the trading card
  const compositedFrames: GifFrame[] = gif.frames.map((frame) => {
    const frameBitmap = frame.bitmap;

    const frameImage = new Jimp({
      data: frameBitmap.data,
      height: frameBitmap.height,
      width: frameBitmap.width,
    });

    frameImage.resize({
      h: cardImage.height,
      w: cardImage.width,
    });

    // Composite the holographic frame onto the card image
    const compositedImage = cardImage.clone();
    compositedImage.composite(frameImage, 0, 0);

    // Convert the Jimp image to a BitmapImage
    const bitmapImage = new BitmapImage(compositedImage.bitmap);

    // Return the BitmapImage as a GifFrame
    return new GifFrame(bitmapImage, {
      delayCentisecs: frame.delayCentisecs, // Preserve the frame delay
    });
  });

  const encoder = new GifEncoder(cardImage.width, cardImage.height);
  encoder.start();

  compositedFrames.forEach(async (cf) => {
    encoder.addFrame(cf.bitmap.data);
  });

  encoder.finish();

  const buffer = encoder.out.getData();

  console.timeEnd();
  return buffer;
}
