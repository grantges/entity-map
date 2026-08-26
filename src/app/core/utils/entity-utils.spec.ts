import {
  getFkPropertyNames,
  getVisibleProperties,
  VISIBLE_PROP_LIMIT,
} from './entity-utils';
import { anEntity, aNavProperty, aProperty, properties } from '../../../testing';

describe('getVisibleProperties', () => {
  it('hides system properties by default', () => {
    const entity = anEntity({
      properties: [
        aProperty({ name: 'Name' }),
        aProperty({ name: 'CreatedOn' }),
        aProperty({ name: 'ModifiedById' }),
      ],
    });

    expect(getVisibleProperties(entity, false).map((p) => p.name)).toEqual(['Name']);
  });

  it('includes system properties when asked', () => {
    const entity = anEntity({
      properties: [aProperty({ name: 'Name' }), aProperty({ name: 'CreatedOn' })],
    });

    expect(getVisibleProperties(entity, true).map((p) => p.name)).toEqual([
      'Name',
      'CreatedOn',
    ]);
  });

  it('caps at VISIBLE_PROP_LIMIT', () => {
    const entity = anEntity({ properties: properties(VISIBLE_PROP_LIMIT + 5) });

    expect(getVisibleProperties(entity, false).length).toBe(VISIBLE_PROP_LIMIT);
  });

  it('keeps everything when the count is exactly the limit', () => {
    const entity = anEntity({ properties: properties(VISIBLE_PROP_LIMIT) });

    expect(getVisibleProperties(entity, false).length).toBe(VISIBLE_PROP_LIMIT);
  });
});

describe('getFkPropertyNames', () => {
  it('collects FK names from single-valued navigation properties', () => {
    const entity = anEntity({
      navigationProperties: [
        aNavProperty({ name: 'Account', fkPropertyName: 'AccountId' }),
        aNavProperty({ name: 'Owner', fkPropertyName: 'OwnerId' }),
      ],
    });

    expect(getFkPropertyNames(entity)).toEqual(new Set(['AccountId', 'OwnerId']));
  });

  it('ignores collection navigation properties', () => {
    const entity = anEntity({
      navigationProperties: [
        aNavProperty({ name: 'Contacts', isCollection: true, fkPropertyName: 'Nope' }),
      ],
    });

    expect(getFkPropertyNames(entity).size).toBe(0);
  });

  it('ignores navigation properties with no FK column', () => {
    const entity = anEntity({
      navigationProperties: [aNavProperty({ name: 'Account', fkPropertyName: undefined })],
    });

    expect(getFkPropertyNames(entity).size).toBe(0);
  });
});
