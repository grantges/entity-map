import { Injectable, inject } from '@angular/core';
import { MetadataStoreService } from './metadata-store.service';
import { SchemaExportOptions } from '../models/schema-export.model';
import { ODataEntityType, ODataProperty } from '../models/entity.model';
import { FILE_SAVER } from '../platform/platform.model';

@Injectable({ providedIn: 'root' })
export class SchemaExportService {
  private readonly store = inject(MetadataStoreService);
  private readonly fileSaver = inject(FILE_SAVER);

  exportCreatioSchema(options: SchemaExportOptions): string {
    const entities = options.entities
      .map((name) => this.store.getEntity(name))
      .filter((e): e is ODataEntityType => !!e);

    const schemaEntries = entities.map((entity) => {
      const columns = this.getExportableProperties(entity, options);
      return this.buildEntitySchema(entity, columns, options.packageName);
    });

    return this.wrapInPackageSchema(schemaEntries, options.packageName);
  }

  private getExportableProperties(
    entity: ODataEntityType,
    options: SchemaExportOptions
  ): ODataProperty[] {
    if (options.includeCustomOnly) {
      return entity.properties.filter((p) => p.isCustom);
    }
    return entity.properties;
  }

  private buildEntitySchema(
    entity: ODataEntityType,
    properties: ODataProperty[],
    packageName: string
  ): string {
    const columns = properties
      .map(
        (p) =>
          `      <Column Name="${p.name}" DataValueType="${this.mapEdmToCreatioType(p.type)}" IsRequired="${!p.nullable}" />`
      )
      .join('\n');

    return `    <EntitySchema Name="${entity.name}" Caption="${entity.name}" Package="${packageName}">
      <Columns>
${columns}
      </Columns>
    </EntitySchema>`;
  }

  private wrapInPackageSchema(
    schemas: string[],
    packageName: string
  ): string {
    return `<?xml version="1.0" encoding="utf-8"?>
<PackageSchema Name="${packageName}">
  <EntitySchemaManager>
${schemas.join('\n')}
  </EntitySchemaManager>
</PackageSchema>`;
  }

  private mapEdmToCreatioType(edmType: string): string {
    const map: Record<string, string> = {
      'Edm.Guid': 'Guid',
      'Edm.String': 'MediumText',
      'Edm.DateTimeOffset': 'DateTime',
      'Edm.Int32': 'Integer',
      'Edm.Int64': 'Integer',
      'Edm.Boolean': 'Boolean',
      'Edm.Decimal': 'Float2',
      'Edm.Double': 'Float2',
      'Edm.Stream': 'Binary',
      'Edm.Binary': 'Binary',
    };
    return map[edmType] || 'MediumText';
  }

  async downloadSchema(xml: string, filename: string): Promise<void> {
    const blob = new Blob([xml], { type: 'application/xml' });
    await this.fileSaver.save(blob, filename);
  }
}
