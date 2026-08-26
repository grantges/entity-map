import { TestBed } from '@angular/core/testing';
import { BaselineService } from './baseline.service';
import { MetadataStoreService } from './metadata-store.service';
import { BaselineSnapshot } from '../models/app.model';
import { ODataEntityType } from '../models/entity.model';
import { anEntity, aProperty, FakeMetadataStore } from '../../../testing';

const LS_KEY = 'em-baselines-index';

function aSnapshot(overrides: Partial<BaselineSnapshot> = {}): BaselineSnapshot {
  return {
    id: 'baseline-1',
    name: 'Before migration',
    environmentId: 'test-env',
    capturedAt: '2026-08-01T00:00:00.000Z',
    entityCount: 1,
    entityProperties: { Account: ['Id', 'Name'] },
    entityNames: ['Account'],
    ...overrides,
  };
}

/** Seeds the baseline index, then builds the service over `current`. */
function serviceWith(
  snapshot: BaselineSnapshot,
  current: ODataEntityType[]
): BaselineService {
  localStorage.setItem(LS_KEY, JSON.stringify([snapshot]));
  TestBed.configureTestingModule({
    providers: [
      {
        provide: MetadataStoreService,
        useValue: new FakeMetadataStore(current) as unknown as MetadataStoreService,
      },
    ],
  });
  return TestBed.inject(BaselineService);
}

describe('BaselineService.diffAgainstBaseline', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    localStorage.removeItem(LS_KEY);
  });

  afterEach(() => localStorage.removeItem(LS_KEY));

  it('returns null for an unknown baseline id', () => {
    const service = serviceWith(aSnapshot(), []);

    expect(service.diffAgainstBaseline('no-such-id')).toBeNull();
  });

  it('reports an entity present now but absent from the baseline as added', () => {
    const service = serviceWith(aSnapshot(), [
      anEntity({ name: 'Account', properties: [aProperty({ name: 'Id' }), aProperty({ name: 'Name' })] }),
      anEntity({ name: 'Opportunity' }),
    ]);

    const diff = service.diffAgainstBaseline('baseline-1')!;

    expect(diff.addedEntities.map((e) => e.name)).toEqual(['Opportunity']);
  });

  it('reports an entity in the baseline but absent now as removed', () => {
    const service = serviceWith(
      aSnapshot({ entityNames: ['Account', 'LegacyThing'] }),
      [anEntity({ name: 'Account', properties: [aProperty({ name: 'Id' }), aProperty({ name: 'Name' })] })]
    );

    const diff = service.diffAgainstBaseline('baseline-1')!;

    expect(diff.removedEntityNames).toEqual(['LegacyThing']);
  });

  it('reports a gained column as a modification', () => {
    const service = serviceWith(aSnapshot(), [
      anEntity({
        name: 'Account',
        properties: [aProperty({ name: 'Id' }), aProperty({ name: 'Name' }), aProperty({ name: 'Website' })],
      }),
    ]);

    const diff = service.diffAgainstBaseline('baseline-1')!;

    expect(diff.modifiedEntities.length).toBe(1);
    expect(diff.modifiedEntities[0].entityName).toBe('Account');
    expect(diff.modifiedEntities[0].addedColumns.map((c) => c.name)).toEqual(['Website']);
    expect(diff.modifiedEntities[0].removedColumnNames).toEqual([]);
  });

  it('reports a lost column as a modification', () => {
    const service = serviceWith(aSnapshot(), [
      anEntity({ name: 'Account', properties: [aProperty({ name: 'Id' })] }),
    ]);

    const diff = service.diffAgainstBaseline('baseline-1')!;

    expect(diff.modifiedEntities[0].removedColumnNames).toEqual(['Name']);
    expect(diff.modifiedEntities[0].addedColumns).toEqual([]);
  });

  it('buckets an untouched entity as unchanged', () => {
    const service = serviceWith(aSnapshot(), [
      anEntity({ name: 'Account', properties: [aProperty({ name: 'Id' }), aProperty({ name: 'Name' })] }),
    ]);

    const diff = service.diffAgainstBaseline('baseline-1')!;

    expect(diff.unchangedEntityNames).toEqual(['Account']);
    expect(diff.modifiedEntities).toEqual([]);
  });

  it('survives a corrupt baseline index rather than throwing', () => {
    localStorage.setItem(LS_KEY, 'not json');
    TestBed.configureTestingModule({
      providers: [
        {
          provide: MetadataStoreService,
          useValue: new FakeMetadataStore([]) as unknown as MetadataStoreService,
        },
      ],
    });

    const service = TestBed.inject(BaselineService);

    expect(service.baselines()).toEqual([]);
  });
});
