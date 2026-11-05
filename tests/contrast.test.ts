import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Цвета систем используются для текста (подзаголовки, ссылки) — нужен контраст WCAG AA 4.5:1. */
const css = readFileSync(join(__dirname, '..', 'src', 'styles', 'index.css'), 'utf8');

function lum(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a: string, b: string): number {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
function block(selector: RegExp): string {
  const m = css.match(selector);
  if (!m) throw new Error(`no block ${selector}`);
  return m[1];
}
function sysColors(src: string): Record<string, string> {
  return Object.fromEntries([...src.matchAll(/--color-sys-([a-z]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]));
}

const light = sysColors(block(/@theme\s*\{([\s\S]*?)\n\}/));
const dark = sysColors(block(/\[data-theme='dark'\]\s*\{([\s\S]*?)\n\}/));
const stoneLight = block(/:root\s*\{([\s\S]*?)\n\}/).match(/--c-stone:\s*(#[0-9a-f]{6})/i)![1];
const stoneDark = block(/\[data-theme='dark'\]\s*\{([\s\S]*?)\n\}/).match(/--c-stone:\s*(#[0-9a-f]{6})/i)![1];

describe('system colours contrast', () => {
  it('defines a dark-theme variant for every system colour', () => {
    expect(Object.keys(dark).sort()).toEqual(Object.keys(light).sort());
  });

  it.each(Object.keys(light))('%s is readable as text on the light background', (id) => {
    expect(ratio(light[id], stoneLight)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(Object.keys(light))('%s is readable as text on the dark background', (id) => {
    expect(ratio(dark[id], stoneDark)).toBeGreaterThanOrEqual(4.5);
  });
});
