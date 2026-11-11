import { spawnSync } from 'child_process';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const androidDir = join(rootDir, 'android');
const task = process.argv[2] || 'assembleDebug';

if (!existsSync(androidDir)) {
  console.error('No android/ folder yet. Run: npm run build && npx cap add android');
  process.exit(1);
}

// `cap sync` silently drops the local SMS plugin when its node_modules link is
// broken, which builds an APK with every SMS feature hidden. Refuse to build that.
const settingsGradle = join(androidDir, 'capacitor.settings.gradle');
const smsPluginLinked = existsSync(join(rootDir, 'node_modules', '@budgy', 'sms-inbox', 'package.json'));
const smsPluginIncluded =
  existsSync(settingsGradle) && readFileSync(settingsGradle, 'utf8').includes('../plugins/sms-inbox/android');

if (!smsPluginLinked || !smsPluginIncluded) {
  console.error(
    'The SMS plugin (@budgy/sms-inbox) is missing from the Android project, so the APK would have no SMS features.\n' +
      'Fix it with: npm install && npx cap sync android',
  );
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
