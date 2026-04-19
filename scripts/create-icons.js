const fs = require("fs");
const path = require("path");

const imagesDir = path.join(__dirname, "../public/images");

if (!fs.existsSync(imagesDir)) {
  fs.mkdirSync(imagesDir, { recursive: true });
}

// A simple 1x1 transparent PNG in base64
const emptyPngBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

const createPlaceholderIcon = (size) => {
  const dest = path.join(imagesDir, `icon-${size}.png`);
  fs.writeFileSync(dest, Buffer.from(emptyPngBase64, "base64"));
  console.log(`Created placeholder icon-${size}.png`);
};

console.log("Generating placeholder PWA icons...");
createPlaceholderIcon(192);
createPlaceholderIcon(512);
