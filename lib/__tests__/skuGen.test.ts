import { describe, it, expect } from 'vitest';
import { colorCode, suggestPartSku, suggestSetSku } from '../utils/skuGen';

describe('colorCode — fixed two-letter codes', () => {
  it('maps single colours', () => {
    expect(colorCode('red')).toBe('RD');
    expect(colorCode('blue')).toBe('BL');
    expect(colorCode('green')).toBe('GN');
    expect(colorCode('pink')).toBe('PK');
  });

  it('keeps lookalike colours distinct', () => {
    // The whole reason for a fixed table rather than "first letter".
    expect(colorCode('black')).not.toBe(colorCode('blue'));
    expect(colorCode('green')).not.toBe(colorCode('grey'));
    expect(colorCode('black')).toBe('BK');
    expect(colorCode('blue')).toBe('BL');
    expect(colorCode('green')).toBe('GN');
    expect(colorCode('grey')).toBe('GY');
  });

  it('treats grey and gray the same', () => {
    expect(colorCode('gray')).toBe(colorCode('grey'));
  });

  it('is case-insensitive', () => {
    expect(colorCode('RED')).toBe('RD');
    expect(colorCode('Blue')).toBe('BL');
  });

  it('returns empty for nothing usable — so no trailing separator is appended', () => {
    expect(colorCode('')).toBe('');
    expect(colorCode(null)).toBe('');
    expect(colorCode(undefined)).toBe('');
    expect(colorCode('   ')).toBe('');
    expect(colorCode('///')).toBe('');
    expect(colorCode('and')).toBe('');
  });

  it('falls back to the first two letters for an unknown colour', () => {
    expect(colorCode('teal')).toBe('TL');   // in the table
    expect(colorCode('mauve')).toBe('MA');  // not in the table
  });

  it('de-duplicates repeats', () => {
    expect(colorCode('red red')).toBe('RD');
  });

  it('caps at two colours to keep the SKU short', () => {
    expect(colorCode('red green blue yellow')).toBe('RDGN');
  });
});

describe('colorCode — real values from this catalog', () => {
  const cases: [string, string][] = [
    ['red', 'RD'],
    ['red and green', 'RDGN'],
    ['pink/green', 'PKGN'],
    ['green/pink', 'GNPK'],
    ['Blue/Red', 'BLRD'],
  ];

  for (const [input, expected] of cases) {
    it(`${JSON.stringify(input)} -> ${expected}`, () => {
      expect(colorCode(input)).toBe(expected);
    });
  }

  it('drops joining words rather than coding them', () => {
    expect(colorCode('red and green')).toBe(colorCode('red/green'));
    expect(colorCode('black n white')).toBe('BKWH');
  });

  it('preserves the order typed', () => {
    // Deliberate: the code mirrors the text rather than silently reordering it.
    expect(colorCode('pink/green')).not.toBe(colorCode('green/pink'));
  });
});

describe('suggestPartSku', () => {
  it('is unchanged when no colour is given', () => {
    expect(suggestPartSku('Honda', 'PSX 2026', 2026, 'Tank Left')).toBe('HND-PSX202626-TL');
    expect(suggestPartSku('Honda', 'PSX 2026', 2026, 'Tank Left', '')).toBe('HND-PSX202626-TL');
    expect(suggestPartSku('Honda', 'PSX 2026', 2026, 'Tank Left', null)).toBe('HND-PSX202626-TL');
  });

  it('appends the colour code when given', () => {
    expect(suggestPartSku('Honda', 'PSX 2026', 2026, 'Tank Left', 'Blue/Red'))
      .toBe('HND-PSX202626-TL-BLRD');
  });

  it('distinguishes two colourways of the same part', () => {
    const red = suggestPartSku('Honda', 'PSX 2026', 2026, 'Tank Left', 'red');
    const blue = suggestPartSku('Honda', 'PSX 2026', 2026, 'Tank Left', 'blue');
    expect(red).not.toBe(blue);
  });
});

describe('suggestSetSku', () => {
  it('is unchanged when no colour is given', () => {
    expect(suggestSetSku('PSX 2026', 2026, 'Full Sticker Kit')).toBe('SET-PSX202626-FSK');
  });

  it('appends the colour code when given', () => {
    expect(suggestSetSku('PSX 2026', 2026, 'Full Sticker Kit', 'blue'))
      .toBe('SET-PSX202626-FSK-BL');
  });

  it('distinguishes two colourways of the same kit — the reported bug', () => {
    const red = suggestSetSku('PSX 2026', 2026, 'Full Sticker Kit', 'red');
    const blue = suggestSetSku('PSX 2026', 2026, 'Full Sticker Kit', 'blue');
    expect(red).not.toBe(blue);
    expect(red).toBe('SET-PSX202626-FSK-RD');
    expect(blue).toBe('SET-PSX202626-FSK-BL');
  });
});

describe('parts and sets share one colour scheme', () => {
  it('the same colour yields the same suffix on both', () => {
    for (const color of ['red', 'red and green', 'pink/green', 'Blue/Red', 'teal']) {
      const part = suggestPartSku('Honda', 'PSX 2026', 2026, 'Tank Left', color);
      const set = suggestSetSku('PSX 2026', 2026, 'Full Sticker Kit', color);
      const suffix = (s: string) => s.slice(s.lastIndexOf('-') + 1);
      expect(suffix(part)).toBe(suffix(set));
      expect(suffix(part)).toBe(colorCode(color));
    }
  });
});

describe('the pre-filled Set Name feeds the SKU suggestion', () => {
  // SetModal pre-fills "Full Sticker Kit" for new sets. The name's initials
  // become the SKU's last segment, so the two are coupled — this pins the link
  // rather than letting a reworded default silently change suggested SKUs.
  const DEFAULT_SET_NAME = 'Full Sticker Kit';

  it('produces the FSK segment, not an empty one', () => {
    const sku = suggestSetSku('PSX 2026', 2026, DEFAULT_SET_NAME);
    expect(sku).toBe('SET-PSX202626-FSK');
    expect(sku.endsWith('-')).toBe(false);
  });

  it('still appends the colour code on top of the default name', () => {
    expect(suggestSetSku('PSX 2026', 2026, DEFAULT_SET_NAME, 'blue'))
      .toBe('SET-PSX202626-FSK-BL');
  });

  it('falls back to SET only when the name is genuinely empty', () => {
    expect(suggestSetSku('PSX 2026', 2026, '')).toBe('SET-PSX202626-SET');
  });
});

describe('same model + name + colour still collides', () => {
  // The suggestion reduces how often "SKU already exists" fires; it does not
  // replace the unique constraint. Identical inputs must still produce an
  // identical SKU so the real guard can catch it.
  it('produces an identical SKU for identical input', () => {
    expect(suggestSetSku('PSX 2026', 2026, 'Full Sticker Kit', 'red'))
      .toBe(suggestSetSku('PSX 2026', 2026, 'Full Sticker Kit', 'red'));
  });
});
