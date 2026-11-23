import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// package.json `version` is the single source of the app version. This copies
// it into the Xcode project's MARKETING_VERSION (CFBundleShortVersionString).
// The build number (CURRENT_PROJECT_VERSION) comes from IOS_BUILD_NUMBER when
// set — CI passes its run number — and is otherwise left as it is.
const root = resolve(new URL('..', import.meta.url).pathname);
const { version } = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const project = resolve(root, 'ios/App/App.xcodeproj/project.pbxproj');
let text = readFileSync(project, 'utf8');
const before = text;
text = text.replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`);
const build = process.env.IOS_BUILD_NUMBER;
if (build && /^\d+$/.test(build)) {
  text = text.replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${build};`);
}
if (text !== before) writeFileSync(project, text);
console.log(`iOS MARKETING_VERSION = ${version}${build ? `, build ${build}` : ''}`);
