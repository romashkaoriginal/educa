const fs = require('fs');
const path = require('path');

const v = process.env.BUILD_VERSION || String(Date.now());
const target = path.join(__dirname, '..', 'public', 'version.json');

fs.writeFileSync(target, `${JSON.stringify({ v }, null, 2)}\n`);
console.log(`version.json -> ${v}`);
