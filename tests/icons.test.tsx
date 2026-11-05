import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { OrganIcon } from '../src/components/icons/organs';
import { SECTIONS } from '../src/content/sections';

describe('OrganIcon', () => {
  it.each(SECTIONS.map((s) => [s.slug, s.icon] as const))('draws an icon for %s', (_slug, icon) => {
    const { container } = render(<OrganIcon name={icon} />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg!.querySelectorAll('path, circle, ellipse, line, rect').length).toBeGreaterThan(0);
  });

  it('uses currentColor stroke and the lucide default width', () => {
    const { container } = render(<OrganIcon name="heart" />);
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveAttribute('stroke', 'currentColor');
    expect(svg).toHaveAttribute('stroke-width', '1.5');
    expect(svg).toHaveAttribute('fill', 'none');
  });
});
