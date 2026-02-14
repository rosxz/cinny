import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const repoRoot = path.resolve(__dirname, '..');
const distDir = path.join(repoRoot, 'dist');
const bridgeSrc = path.join(repoRoot, 'cinny-mobile', 'native-bridge.js');
const bridgeDest = path.join(distDir, 'native-bridge.js');
const indexHtml = path.join(distDir, 'index.html');

if (!fs.existsSync(distDir)) {
  console.error('dist directory not found; run `npm run build` first');
  process.exit(1);
}

if (!fs.existsSync(bridgeSrc)) {
  console.error('native-bridge.js not found in cinny-mobile; please ensure it exists');
  process.exit(1);
}

fs.copyFileSync(bridgeSrc, bridgeDest);
console.log('Copied native-bridge.js to dist/');

// Inject script tag into index.html if not already present
if (!fs.existsSync(indexHtml)) {
  console.error('dist/index.html not found');
  process.exit(1);
}

let html = fs.readFileSync(indexHtml, 'utf8');
if (!html.includes('native-bridge.js')) {
  const inject = '\n    <script>\n      if (window && window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {\n        var s=document.createElement("script");s.src="/native-bridge.js";document.body.appendChild(s);\n      }\n    </script>\n  ';
  html = html.replace('</body>', `${inject}</body>`);
  fs.writeFileSync(indexHtml, html, 'utf8');
  console.log('Injected native-bridge loader into dist/index.html');
} else {
  console.log('dist/index.html already contains native-bridge.js');
}
