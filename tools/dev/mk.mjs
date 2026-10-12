// build a cdp steps JSON from a list of {eval file or code, wait, snap}
import { readFileSync, writeFileSync } from 'node:fs';
const spec = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const steps = spec.map(s => ({ ...s, eval: s.file ? readFileSync(s.file, 'utf8') : s.eval }));
process.stdout.write(JSON.stringify(steps));
