import { describe, expect, it } from 'vitest';
import content from '../src/content/ru/pochki';
import { buildKidney } from '../src/models/kidney/build';
import { GROUP_OF, placeKidney } from '../src/models/kidney/anatomy';
import { decode, encode } from '../src/models/kidney/transfer';

describe('kidney geometry', () => {
  it('builds selectable geometry for every published structure and preserves it across the worker boundary', () => {
    const progress: number[] = [];
    const pieces = buildKidney((value) => progress.push(value));
    const { payload } = encode(pieces);
    const restored = decode(payload);
    expect(new Set(restored.map(({ id }) => id))).toEqual(new Set(content.parts.map(({ id }) => id)));
    for (const part of content.parts) expect(GROUP_OF[part.id]).toBe(part.group);
    for (const { geometry } of restored) {
      expect(geometry.attributes.position.count).toBeGreaterThan(0);
      expect(geometry.attributes.normal.count).toBe(geometry.attributes.position.count);
      expect(geometry.attributes.color.count).toBe(geometry.attributes.position.count);
      expect(Number.isFinite(geometry.boundingSphere?.radius)).toBe(true);
      geometry.dispose();
    }
    expect(progress).toEqual([0.20, 0.44, 0.68, 0.88]);
  });

  it('shows the lower right kidney on the left of the anterior view', () => {
    const right = placeKidney([0, 0, 0], false);
    const left = placeKidney([0, 0, 0], true);
    expect(right[0]).toBeLessThan(0);
    expect(left[0]).toBeGreaterThan(0);
    expect(right[1]).toBeLessThan(left[1]);
  });
});
