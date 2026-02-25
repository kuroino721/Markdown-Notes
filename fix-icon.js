import { Jimp } from 'jimp';
import path from 'path';

async function processIcon() {
  try {
    const iconPath = path.resolve('src-tauri/icons/icon.png');
    const image = await Jimp.read(iconPath);
    
    console.log(`Original dimensions: ${image.width}x${image.height}`);
    
    if (image.width !== image.height) {
      console.log('Image is not square. Forcing square...');
      const size = Math.max(image.width, image.height);
      const squareImage = new Jimp({
        width: size,
        height: size,
        color: 0x00000000 // Transparent
      });
      
      const x = Math.round((size - image.width) / 2);
      const y = Math.round((size - image.height) / 2);
      
      squareImage.composite(image, x, y);
      await squareImage.write(iconPath);
      console.log(`Resized to square: ${size}x${size}`);
    } else {
      console.log('Image is already square.');
    }
  } catch (error) {
    console.error('Error processing icon:', error);
  }
}

processIcon();
