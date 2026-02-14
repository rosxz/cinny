const fs = require('fs');
const path = require('path');

const wwwDir = path.resolve(__dirname, '..', 'www');
const bridgeSrc = path.resolve(__dirname, '..', 'native-bridge.js');
const bridgeDest = path.join(wwwDir, 'native-bridge.js');

if (!fs.existsSync(wwwDir)) {
  console.error('www directory not found, run web build and prepare:web first');
  process.exit(1);
}

fs.copyFileSync(bridgeSrc, bridgeDest);
console.log('Copied native-bridge.js to www/');
