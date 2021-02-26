import chalk from 'chalk';
import fs from 'fs';
import https from 'https';
import Twitter from 'twitter';

import { Image, createCanvas } from 'canvas';

const convert = require('color-convert');
const sharp = require('sharp');

if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

type colorRGB = [number, number, number];

const client = new Twitter({
  consumer_key: process.env.TWITTER_API_CONSUMER_KEY || '',
  consumer_secret: process.env.TWITTER_API_CONSUMER_SECRET || '',
  access_token_key: process.env.TWITTER_API_TOKEN || '',
  access_token_secret: process.env.TWITTER_API_TOKEN_SECRET || ''
});

const SLEEP_TIME = 60 * 60 * 1000;

const getColor = (src: Buffer): colorRGB => {
  const img = new Image();

  img.src = src;

  const canvas = createCanvas(50, 50);
  const ctx = canvas.getContext('2d');

  canvas.width = img.width;
  canvas.height = img.height;
  ctx.drawImage(img, 0, 0);

  const data = ctx.getImageData(0, 0, img.width / 2, img.height / 2).data;
  const color: colorRGB = [data[4], data[5], data[6]];

  return color;
};

const loop = () => {
  console.log(chalk.green('Bot is running...'));
  console.log(`Fetch image from ${process.env.SOURCE_IMAGE}`);

  const req = https.get(process.env.SOURCE_IMAGE, (res) => {
    if (res.statusCode == 200) {
      const chunks = [];

      res.on('data', (chunk) => {
        chunks.push(chunk);
      });

      res.on('end', async () => {
        console.log('Image successfully fetched');

        const src = Buffer.concat(chunks);
        const srcCrop = await sharp(src).extract({ width: 50, height: 50, left: 150, top: 0 }).toBuffer();
        const colorRGB = getColor(srcCrop);
        const colorHex = convert.rgb.hex(colorRGB);
        const colorName = convert.rgb.keyword(colorRGB);

        updateWithImage(colorName, colorHex);
      });
    } else {
      console.error('Error fetching image from source', res.statusCode);
    }
  });

  req.on('error', (error) => {
    console.error('Request Error', error.message);
  });

  console.log(chalk.yellow(`Repeat fetch in ${Math.round(SLEEP_TIME / 60 / 1000)} minutes`));
  setTimeout(loop, SLEEP_TIME);
};

const updateWithImage = (colorName: string, colorHex: string) => {
  console.log('Create canvas and update output png');

  const canvas = createCanvas(400, 300);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = `#${colorHex}`;
  ctx.fillRect(0, 0, 400, 300);

  const dataURL = canvas.toDataURL().replace(/^data:image\/png;base64,/, '');

  return fs.writeFile('output.png', dataURL, 'base64', (error) => {
    if (error) throw error;

    console.log('Output png updated');
    sendUpdate(colorName, colorHex);
  });
};

const sendUpdate = (colorName: string, colorHex: string) => {
  const image = fs.readFileSync('output.png', 'base64');

  client.post(
    'media/upload',
    { media_data: image },
    (error, data) => {
      if (error) {
        return console.error(error);
      }

      const status = {
        status: `The color of the sky in Minsk is ${colorName}. #${colorHex}`,
        media_ids: data.media_id_string,
      };

      client.post('statuses/update', status, (error) => {
        if (error) {
          console.error(error);
        } else {
          console.log('Status updated');
        }
      });
    }
  );
};

loop();
