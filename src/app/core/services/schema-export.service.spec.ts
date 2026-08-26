import { TestBed } from '@angular/core/testing';
import { SchemaExportService } from './schema-export.service';
import { MetadataStoreService } from './metadata-store.service';
import { FILE_SAVER, FileSaver } from '../platform/platform.model';
import { ODataEntityType } from '../models/entity.model';
import { anEntity, aProperty, FakeMetadataStore } from '../../../testing';

class NoopFileSaver implements FileSaver {
  async save(): Promise<string | null> {
    return null;
  }
}

function exporterOver(entities: ODataEntityType[]): SchemaExportService {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      {
        provide: MetadataStoreService,
        useValue: new FakeMetadataStore(entities) as unknown as MetadataStoreService,
      },
      { provide: FILE_SAVER, useClass: NoopFileSaver },
    ],
  });
  return TestBed.inject(SchemaExportService);
}

const ACCOUNT = anEntity({
  name: 'Account',
  properties: [
    aProperty({ name: 'Id', type: 'Edm.Guid', isKey: true, nullable: false }),
    aProperty({ name: 'Name', type: 'Edm.String' }),
    aProperty({ name: 'UsrRegion', type: 'Edm.String', isCustom: true }),
  ],
});

describe('SchemaExportService.exportCreatioSchema', () => {
  it('names the entity in the generated schema', () => {
    const xml = exporterOver([ACCOUNT]).exportCreatioSchema({
      entities: ['Account'],
      includeCustomOnly: false,
      packageName: 'UsrPackage',
    });

    expect(xml).toContain('Account');
  });

  it('carries the package name into the output', () => {
    const xml = exporterOver([ACCOUNT]).exportCreatioSchema({
      entities: ['Account'],
      includeCustomOnly: false,
      packageName: 'UsrPackage',
    });

    expect(xml).toContain('UsrPackage');
  });

  it('includes every column when includeCustomOnly is false', () => {
    const xml = exporterOver([ACCOUNT]).exportCreatioSchema({
      entities: ['Account'],
      includeCustomOnly: false,
      packageName: 'UsrPackage',
    });

    // `toContain('Name')` alone would also pass on a broken export, since the
    // literal substring "Name" appears in every `Name="..."` attribute
    // (EntitySchema, PackageSchema, every Column) regardless of whether the
    // "Name" property's own column was emitted. Anchor on the actual column
    // the service emits for that property instead.
    expect(xml).toContain('Name="Name"');
    expect(xml).toContain('Name="UsrRegion"');
  });

  it('emits only custom columns when includeCustomOnly is true', () => {
    const xml = exporterOver([ACCOUNT]).exportCreatioSchema({
      entities: ['Account'],
      includeCustomOnly: true,
      packageName: 'UsrPackage',
    });

    expect(xml).toContain('Name="UsrRegion"');
    expect(xml).not.toContain('Name="Name"');
  });

  it('skips entity names the store does not know', () => {
    const xml = exporterOver([ACCOUNT]).exportCreatioSchema({
      entities: ['Account', 'Nonexistent'],
      includeCustomOnly: false,
      packageName: 'UsrPackage',
    });

    // A bare negative here would also pass if a bug dropped every entity
    // (not just the unknown one) -- 'Nonexistent' would still be absent from
    // an empty or malformed document. Pair it with a positive assertion,
    // anchored on the entity's own element rather than the bare name (which
    // could otherwise coincidentally appear in boilerplate), proving the
    // known entity actually survived.
    expect(xml).toContain('Name="Account"');
    expect(xml).not.toContain('Nonexistent');
  });

  it('produces a document even when no entities are selected', () => {
    const xml = exporterOver([ACCOUNT]).exportCreatioSchema({
      entities: [],
      includeCustomOnly: false,
      packageName: 'UsrPackage',
    });

    expect(xml).toContain('UsrPackage');
  });
});
