import { Jimp } from 'jimp';
import path from 'path';

async function generatePWAIcons() {
  try {
    const sourceIcon = path.resolve('src-tauri/icons/icon.png');
    const publicDir = path.resolve('src/public');
    
    const image = await Jimp.read(sourceIcon);
    console.log(`Source icon read: ${image.width}x${image.height}`);

    const targets = [
      { name: 'pwa-192x192.png', size: 192 },
      { name: 'pwa-512x512.png', size: 512 },
      { name: 'apple-touch-icon.png', size: 180 }
    ];

    for (const target of targets) {
      const resized = image.clone().resize({ w: target.size, h: target.size });
      const outputPath = path.join(publicDir, target.name);
      await resized.write(outputPath);
      console.log(`Generated: ${target.name} (${target.size}x${target.size})`);
    }
    
    console.log('PWA icons updated successfully.');
  } catch (error) {
    console.error('Error generating PWA icons:', error);
  }
}

generatePWAIcons();
