
import { Jimp } from "jimp";
import fs from "fs";
import path from "path";

const SOURCE_PATH = "src-tauri/icons/production_dev_icons.png";
const PROD_OUTPUT = "src-tauri/icons/icon.png";
const DEV_OUTPUT = "src-tauri/icons/dev-icon.png";

async function main() {
  if (!fs.existsSync(SOURCE_PATH)) {
    console.error(`Error: Source file ${SOURCE_PATH} not found.`);
    process.exit(1);
  }

  try {
    console.log("Reading image...");
    const image = await Jimp.read(SOURCE_PATH);
    const width = image.bitmap.width;
    const height = image.bitmap.height;

    console.log(`Loaded image: ${width}x${height}`);

    const halfWidth = Math.floor(width / 2);
    
    const cropSize = Math.floor(Math.min(halfWidth, height) * 0.8);
    const xOffsetProd = Math.floor((halfWidth - cropSize) / 2);
    const xOffsetDev = halfWidth + Math.floor((halfWidth - cropSize) / 2);
    
    const heightWithoutText = height * 0.85;
    const yOffset = Math.floor((heightWithoutText - cropSize) / 2);

    // Crop Production Icon (Left)
    const prodIcon = image.clone();
    console.log(`Cropping Prod: x=${xOffsetProd}, y=${yOffset}, size=${cropSize}`);
    prodIcon.crop({ x: xOffsetProd, y: yOffset, w: cropSize, h: cropSize });
    await prodIcon.write(PROD_OUTPUT);
    console.log(`Saved Production Icon to ${PROD_OUTPUT}`);

    // Crop Development Icon (Right)
    const devIcon = image.clone();
    console.log(`Cropping Dev: x=${xOffsetDev}, y=${yOffset}, size=${cropSize}`);
    devIcon.crop({ x: xOffsetDev, y: yOffset, w: cropSize, h: cropSize });
    await devIcon.write(DEV_OUTPUT);
    console.log(`Saved Development Icon to ${DEV_OUTPUT}`);

  } catch (error) {
    console.error("Error processing image:", error);
    if (error instanceof Error) {
        console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
