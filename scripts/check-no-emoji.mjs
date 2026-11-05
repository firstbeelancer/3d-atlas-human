// Проверка: в исходниках не должно быть эмодзи (требование проекта — только иконки).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Эмодзи = символ с эмодзи-представлением по умолчанию, любой пиктограф с селектором U+FE0F,
// или символ из астральных блоков эмодзи. Типографика (©, ®, ™, стрелки, ≈) не считается.
const EMOJI = /\p{Emoji_Presentation}|\p{Extended_Pictographic}️|[\u{1F000}-\u{1FAFF}]/gu;

/** @param {string} text @returns {string[]} */
export function findEmoji(text) {
  return text.match(EMOJI) ?? [];
}

const SCAN = ['src', 'scripts', 'index.html', 'public'];
const EXT = new Set(['.ts', '.tsx', '.js', '.mjs', '.css', '.html', '.json', '.md', '.svg', '.txt']);

function* walk(path) {
  let st;
  try {
    st = statSync(path);
  } catch {
    return;
  }
  if (st.isDirectory()) {
    for (const name of readdirSync(path)) yield* walk(join(path, name));
  } else if (EXT.has(extname(path))) {
    yield path;
  }
}

function main() {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const hits = [];
  for (const entry of SCAN) {
    for (const file of walk(join(root, entry))) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          const found = findEmoji(line);
          if (found.length) hits.push(`${relative(root, file)}:${i + 1}  ${found.join(' ')}`);
        });
    }
  }
  if (hits.length) {
    console.error('Найдены эмодзи (запрещены, используйте иконки):\n' + hits.join('\n'));
    process.exit(1);
  }
  console.log('check:emoji — эмодзи не найдено');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
