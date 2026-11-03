import { spawnSync } from 'child_process';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const androidDir = resolve(__dirname, '..', 'android');
const task = process.argv[2] || 'assembleDebug';

if (!existsSync(androidDir)) {
  console.error('No android/ folder yet. Run: npm run build && npx cap add android');
  process.exit(1);
}

const gradlewBat = join(androidDir, 'gradlew.bat');
const gradlew = join(androidDir, 'gradlew');

let cmd, args, opts;

if (existsSync(gradlewBat) && process.platform === 'win32') {
  cmd = `"${gradlewBat}"`;
  args = [task];
  opts = { cwd: androidDir, stdio: 'inherit', shell: true };
} else {
  cmd = gradlew;
  args = [task];
  opts = { cwd: androidDir, stdio: 'inherit' };
}

console.log(`Running Gradle task: ${task}`);
const result = spawnSync(cmd, args, opts);
process.exit(result.status ?? 1);
