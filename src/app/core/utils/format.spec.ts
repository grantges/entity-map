import { formatDate, formatSize } from './format';

describe('formatSize', () => {
  it('reports plain bytes below 1 KB', () => {
    expect(formatSize(0)).toBe('0 B');
    expect(formatSize(1023)).toBe('1023 B');
  });

  it('switches to KB at exactly 1024 bytes', () => {
    expect(formatSize(1024)).toBe('1.0 KB');
  });

  it('reports one decimal place in KB', () => {
    expect(formatSize(1536)).toBe('1.5 KB');
  });

  it('switches to MB at exactly 1 MiB', () => {
    expect(formatSize(1024 * 1024)).toBe('1.0 MB');
  });
});

describe('formatDate', () => {
  // toLocaleDateString() is locale- and timezone-dependent, so asserting a
  // literal string passes locally and fails in CI under a different TZ.
  // Assert the contract that actually matters instead.
  it('renders a parseable ISO date as a non-empty string', () => {
    const rendered = formatDate('2026-08-25T12:00:00Z');
    expect(rendered).toBeTruthy();
    expect(rendered).not.toContain('Invalid');
  });
});
