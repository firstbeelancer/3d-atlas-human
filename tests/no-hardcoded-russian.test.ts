import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Готовность к переводам: компоненты, страницы, модели и 3D-код не содержат русских строк.
 * Тексты живут в src/i18n/ и src/content/<язык>/. Русские комментарии разрешены.
 */
const ROOT = join(__dirname, '..', 'src');
const DIRS = ['components', 'pages', 'models', 'three', 'lib', 'content/adult'];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.(tsx?|ts)$/.test(n) ? [p] : [];
  });
}

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

describe('no hard-coded Russian in code', () => {
  it('keeps user-facing text in i18n and content files', () => {
    const offenders: string[] = [];
    for (const d of DIRS) {
      for (const f of files(join(ROOT, d))) {
        stripComments(readFileSync(f, 'utf8'))
          .split('\n')
          .forEach((line, i) => {
            if (/[А-Яа-яЁё]/.test(line)) offenders.push(`${relative(ROOT, f)}:${i + 1}  ${line.trim().slice(0, 70)}`);
          });
      }
    }
    expect(offenders).toEqual([]);
  });
});
