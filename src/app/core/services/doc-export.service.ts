import { Injectable, inject } from '@angular/core';
import { MetadataStoreService } from './metadata-store.service';
import { AiService } from './ai.service';
import { SchemaDiff, EntityDiff } from './baseline.service';
import {
  ODataEntityType,
  ODataNavigationProperty,
  EntityMetadata,
  getEdmTypeShort,
} from '../models/entity.model';
import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  TextRun,
  HeadingLevel,
  WidthType,
  AlignmentType,
  Bookmark,
  InternalHyperlink,
  ShadingType,
  PageBreak,
  FileChild,
  BorderStyle,
  Footer,
  Header,
  PageNumber,
  VerticalAlign,
  TableOfContents,
} from 'docx';
import { saveAs } from 'file-saver';

// ── Design tokens ──
const C = {
  heading:     '1A1A2E',
  body:        '374151',
  muted:       '6B7280',
  faint:       '9CA3AF',
  accent:      '4F46E5',
  accentLight: 'EEF2FF',
  link:        '2563EB',
  border:      'E2E8F0',
  tblHeader:   'F1F5F9',
  tblAltRow:   'F8FAFC',
  white:       'FFFFFF',
  pkBg:        'FEF3C7', pkText: '92400E',
  fkBg:        'DBEAFE', fkText: '1E40AF',
  required:    'DC2626',
  reqOff:      'D1D5DB',
  type:        '7C3AED',
};
const FONT = 'Calibri';
const MONO = 'Consolas';
const MARGIN = 1440; // 1 inch in DXA
const PAGE_W = 9360; // 6.5" usable width

// Column widths for properties table
const COL = { name: 1800, type: 1200, req: 600, key: 720, fkRef: 1800, desc: 3240 };

const noBorder = { style: BorderStyle.NONE, size: 0, color: C.white };
const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

@Injectable({ providedIn: 'root' })
export class DocExportService {
  private readonly store = inject(MetadataStoreService);
  private readonly ai = inject(AiService);

  async exportToWord(
    entityNames: string[],
    aiEnhanced = false,
    aiDescriptionMode: 'fill-missing' | 'override-all' = 'fill-missing',
    diff?: SchemaDiff,
    environmentName?: string,
  ): Promise<void> {
    const entities = entityNames
      .map((name) => this.store.getEntity(name))
      .filter((e): e is ODataEntityType => !!e)
      .sort((a, b) => a.name.localeCompare(b.name));

    if (entities.length === 0 && !diff) return;

    // Build lookup maps from diff
    const isDelta = !!diff;
    const addedEntityNames = new Set(diff?.addedEntities.map((e) => e.name) || []);
    const modifiedEntityMap = new Map<string, EntityDiff>();
    for (const mod of diff?.modifiedEntities || []) {
      modifiedEntityMap.set(mod.entityName, mod);
    }
    const removedEntityNames = diff?.removedEntityNames || [];

    // FK lookup
    const fkMap = new Map<string, Map<string, string>>();
    for (const entity of entities) {
      const fks = new Map<string, string>();
      for (const nav of entity.navigationProperties) {
        if (!nav.isCollection && nav.fkPropertyName) {
          fks.set(nav.fkPropertyName, nav.targetEntity);
        }
      }
      fkMap.set(entity.name, fks);
    }

    const entityNameSet = new Set(entityNames);
    const totalRels = entities.reduce(
      (sum, e) => sum + e.navigationProperties.filter((n) => !n.isCollection).length, 0
    );

    // ── Cover page ──
    const coverChildren: FileChild[] = this.buildCoverPage(
      entities.length, totalRels, environmentName || 'Entity Reference',
      isDelta, addedEntityNames.size, modifiedEntityMap.size, removedEntityNames.length,
    );

    // ── Content pages ──
    const contentChildren: FileChild[] = [];

    // TOC
    contentChildren.push(
      new Paragraph({
        children: [new TextRun({ text: 'Contents', bold: true, size: 48, font: FONT, color: C.heading })],
        spacing: { after: 240 },
      }),
      new TableOfContents('Table of Contents', {
        hyperlink: true,
        headingStyleRange: '1-2',
      }),
      new Paragraph({ children: [new PageBreak()] }),
    );

    // AI overview
    if (aiEnhanced) {
      try {
        const metaMap = new Map<string, EntityMetadata>();
        for (const e of entities) metaMap.set(e.name, this.store.getMetadata(e.name));
        const overview = await this.ai.generateDocumentOverview(entities, metaMap);
        if (overview) {
          contentChildren.push(
            new Paragraph({
              children: [new TextRun({ text: 'Overview', bold: true, size: 48, font: FONT, color: C.heading })],
              heading: HeadingLevel.HEADING_1,
              spacing: { before: 0, after: 120 },
            }),
            new Paragraph({
              children: [new TextRun({ text: overview, size: 22, font: FONT, color: C.body })],
              spacing: { after: 400 },
            }),
            new Paragraph({ children: [new PageBreak()] }),
          );
        }
      } catch { /* continue */ }
    }

    // Delta summary section (if delta mode)
    if (isDelta) {
      contentChildren.push(
        new Paragraph({
          children: [new TextRun({ text: 'Change Summary', bold: true, size: 48, font: FONT, color: C.heading })],
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 0, after: 160 },
        }),
        new Paragraph({
          children: [new TextRun({
            text: 'This document captures only the changes made since the baseline snapshot. Existing properties that were not modified are omitted for brevity.',
            size: 22, font: FONT, color: C.muted, italics: true,
          })],
          spacing: { after: 200 },
        }),
      );

      const summaryLines: string[] = [];
      if (addedEntityNames.size > 0) summaryLines.push(`${addedEntityNames.size} new entit${addedEntityNames.size === 1 ? 'y' : 'ies'}`);
      if (modifiedEntityMap.size > 0) summaryLines.push(`${modifiedEntityMap.size} modified entit${modifiedEntityMap.size === 1 ? 'y' : 'ies'}`);
      if (removedEntityNames.length > 0) summaryLines.push(`${removedEntityNames.length} removed entit${removedEntityNames.length === 1 ? 'y' : 'ies'}`);

      contentChildren.push(new Paragraph({
        children: [new TextRun({ text: summaryLines.join('  ·  '), size: 22, font: FONT, color: C.body })],
        spacing: { after: 200 },
      }));

      // List removed entities
      if (removedEntityNames.length > 0) {
        contentChildren.push(new Paragraph({
          children: [new TextRun({ text: 'Removed Entities', bold: true, size: 32, font: FONT, color: C.heading })],
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 120 },
        }));
        for (const name of removedEntityNames) {
          contentChildren.push(new Paragraph({
            children: [
              new TextRun({ text: '✕  ', font: FONT, size: 22, color: C.required }),
              new TextRun({ text: name, font: FONT, size: 22, color: C.body, strike: true }),
            ],
            spacing: { after: 60 },
            indent: { left: 360 },
          }));
        }
      }

      contentChildren.push(new Paragraph({ children: [new PageBreak()] }));
    }

    // AI: Pre-fill descriptions if enabled (before building sections)
    if (aiEnhanced) {
      for (const entity of entities) {
        const meta = this.store.getMetadata(entity.name);
        const needsEntityDesc = aiDescriptionMode === 'override-all' || !meta.description;
        const missingColDescs = entity.properties.filter(
          (p) => aiDescriptionMode === 'override-all' || !meta.columnDescriptions[p.name]
        );

        if (needsEntityDesc || missingColDescs.length > 0) {
          try {
            const result = await this.ai.describeEntity(entity, meta);

            // Apply entity description
            if (needsEntityDesc && result.entityDescription) {
              this.store.setEntityDescription(entity.name, result.entityDescription);
            }

            // Apply column descriptions
            for (const [col, desc] of Object.entries(result.columnDescriptions)) {
              if (!desc) continue;
              const shouldApply = aiDescriptionMode === 'override-all' || !meta.columnDescriptions[col];
              if (shouldApply) {
                this.store.setColumnDescription(entity.name, col, desc);
              }
            }
          } catch { /* continue if AI fails for one entity */ }
        }
      }
    }

    // Entity sections
    for (let i = 0; i < entities.length; i++) {
      const entity = entities[i];
      const fks = fkMap.get(entity.name) || new Map();

      // AI intro for the doc (separate from stored description)
      let entityIntro = '';
      if (aiEnhanced) {
        try {
          entityIntro = await this.ai.generateEntityIntro(entity, this.store.getMetadata(entity.name));
        } catch { /* continue */ }
      }

      // Determine delta context for this entity
      const isNewEntity = addedEntityNames.has(entity.name);
      const entityDiff = modifiedEntityMap.get(entity.name);

      contentChildren.push(...this.buildEntitySection(
        entity, fks, entityNameSet, entityIntro, i > 0, isDelta, isNewEntity, entityDiff
      ));
    }

    const doc = new Document({
      features: { updateFields: true },
      styles: {
        default: {
          document: { run: { font: FONT, size: 22, color: C.body } },
          heading1: {
            run: { font: FONT, size: 48, bold: true, color: C.heading },
            paragraph: { spacing: { before: 0, after: 120 } },
          },
          heading2: {
            run: { font: FONT, size: 32, bold: true, color: C.heading },
            paragraph: { spacing: { before: 360, after: 80 } },
          },
        },
      },
      sections: [
        // Cover page (no header/footer)
        {
          properties: {
            page: { margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } },
          },
          children: coverChildren,
        },
        // Content pages
        {
          properties: {
            page: { margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } },
          },
          headers: {
            default: new Header({
              children: [new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [new TextRun({ text: 'Entity Reference Documentation', font: FONT, size: 16, color: C.faint })],
                border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: C.border, space: 4 } },
              })],
            }),
          },
          footers: {
            default: new Footer({
              children: [new Paragraph({
                alignment: AlignmentType.RIGHT,
                border: { top: { style: BorderStyle.SINGLE, size: 4, color: C.border, space: 4 } },
                children: [
                  new TextRun({ text: 'Page ', font: FONT, size: 16, color: C.faint }),
                  new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: C.faint }),
                  new TextRun({ text: ' of ', font: FONT, size: 16, color: C.faint }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 16, color: C.faint }),
                ],
              })],
            }),
          },
          children: contentChildren,
        },
      ],
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, 'entity-documentation.docx');
  }

  // ── Cover page ──

  private buildCoverPage(
    entityCount: number, relCount: number, envName: string,
    isDelta = false, added = 0, modified = 0, removed = 0,
  ): FileChild[] {
    const children: FileChild[] = [
      new Paragraph({ spacing: { before: 4800 }, children: [] }),
      new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 24, color: C.accent, space: 8 } },
        spacing: { after: 400 },
        children: [],
      }),
      new Paragraph({
        children: [new TextRun({ text: envName, bold: true, size: 72, font: FONT, color: C.heading })],
        spacing: { after: 0 },
      }),
      new Paragraph({
        children: [new TextRun({
          text: isDelta ? 'Entity Reference — Change Report' : 'Entity Reference',
          size: 48, font: FONT, color: C.muted,
        })],
        spacing: { after: 200 },
      }),
      new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: C.accent, space: 4 } },
        spacing: { after: 240 },
        children: [new TextRun({ text: '                    ', size: 8 })],
      }),
      new Paragraph({
        children: [new TextRun({
          text: `Generated on ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`,
          size: 24, font: FONT, color: C.muted,
        })],
        spacing: { after: 60 },
      }),
    ];

    if (isDelta) {
      const parts: string[] = [];
      if (added > 0) parts.push(`${added} new`);
      if (modified > 0) parts.push(`${modified} modified`);
      if (removed > 0) parts.push(`${removed} removed`);
      children.push(new Paragraph({
        children: [new TextRun({ text: parts.join('  ·  ') + ' entities', size: 22, font: FONT, color: C.faint })],
        spacing: { after: 0 },
      }));
    } else {
      children.push(new Paragraph({
        children: [new TextRun({
          text: `${entityCount} entities  ·  ${relCount} relationships`,
          size: 22, font: FONT, color: C.faint,
        })],
        spacing: { after: 0 },
      }));
    }

    children.push(new Paragraph({ children: [new PageBreak()] }));
    return children;
  }

  // ── Entity section ──

  private buildEntitySection(
    entity: ODataEntityType,
    fks: Map<string, string>,
    allEntityNames: Set<string>,
    aiIntro: string,
    addPageBreak: boolean,
    isDelta = false,
    isNewEntity = false,
    entityDiff?: EntityDiff,
  ): FileChild[] {
    const bm = this.bm(entity.name);
    const meta = this.store.getMetadata(entity.name);
    const children: FileChild[] = [];
    const fkNavs = entity.navigationProperties.filter((n) => !n.isCollection);

    // For delta mode on modified entities, only show added/removed columns
    const addedColumnNames = entityDiff ? new Set(entityDiff.addedColumns.map((c) => c.name)) : null;
    const removedColumnNames = entityDiff ? new Set(entityDiff.removedColumnNames) : null;

    // Page break before entity (except first)
    if (addPageBreak) {
      children.push(new Paragraph({ children: [new PageBreak()] }));
    }

    // Entity heading with bookmark + delta badge
    const headingRuns: (TextRun | Bookmark)[] = [];
    if (isDelta) {
      const badge = isNewEntity ? ' NEW ' : ' MODIFIED ';
      const badgeColor = isNewEntity ? '059669' : 'D97706';
      const badgeBg = isNewEntity ? 'ECFDF5' : 'FFFBEB';
      headingRuns.push(new TextRun({
        text: badge, font: FONT, size: 20, bold: true, color: badgeColor,
        shading: { type: ShadingType.SOLID, color: badgeBg, fill: badgeBg },
      }));
      headingRuns.push(new TextRun({ text: '  ', size: 20 }));
    }
    headingRuns.push(new Bookmark({
      id: bm,
      children: [new TextRun({ text: entity.name, bold: true, size: 48, font: FONT, color: C.heading })],
    }));

    children.push(new Paragraph({
      children: headingRuns,
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 0, after: 120 },
    }));

    // Delta context note for modified entities
    if (isDelta && !isNewEntity && entityDiff) {
      const notes: string[] = [];
      if (entityDiff.addedColumns.length > 0) {
        notes.push(`${entityDiff.addedColumns.length} propert${entityDiff.addedColumns.length === 1 ? 'y' : 'ies'} added`);
      }
      if (entityDiff.removedColumnNames.length > 0) {
        notes.push(`${entityDiff.removedColumnNames.length} propert${entityDiff.removedColumnNames.length === 1 ? 'y' : 'ies'} removed`);
      }
      children.push(new Paragraph({
        children: [new TextRun({
          text: `This entity has been modified since baseline. Only changed properties are documented below. ${notes.join(', ')}.`,
          size: 22, font: FONT, color: C.muted, italics: true,
        })],
        spacing: { after: 160 },
      }));
    }

    // AI intro
    if (aiIntro) {
      children.push(new Paragraph({
        children: [new TextRun({ text: aiIntro, size: 22, font: FONT, color: C.body, italics: true })],
        spacing: { after: 160 },
      }));
    }

    // Entity description
    if (meta.description) {
      children.push(new Paragraph({
        children: [new TextRun({ text: meta.description, size: 22, font: FONT, color: C.body })],
        spacing: { after: 160 },
      }));
    }

    // Summary line
    const summaryParts: TextRun[] = [
      new TextRun({ text: `${entity.properties.length} total columns`, font: FONT, size: 21, color: C.muted }),
    ];
    if (fkNavs.length > 0) {
      summaryParts.push(new TextRun({ text: '  ·  ', font: FONT, size: 21, color: C.faint }));
      summaryParts.push(new TextRun({ text: `${fkNavs.length} relationships`, font: FONT, size: 21, color: C.muted }));
    }
    if (entity.baseType) {
      summaryParts.push(new TextRun({ text: '  ·  Inherits from ', font: FONT, size: 21, color: C.muted }));
      summaryParts.push(new TextRun({ text: entity.baseType, bold: true, font: FONT, size: 21, color: C.accent }));
    }
    children.push(new Paragraph({ children: summaryParts, spacing: { after: 200 } }));

    // Properties heading
    if (isDelta && !isNewEntity) {
      children.push(new Paragraph({
        children: [new TextRun({ text: 'Changed Properties', bold: true, size: 32, font: FONT, color: C.heading })],
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 360, after: 160 },
      }));
    } else {
      children.push(new Paragraph({
        children: [new TextRun({ text: 'Properties', bold: true, size: 32, font: FONT, color: C.heading })],
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 360, after: 160 },
      }));
    }

    // Properties table — filter to changed-only for modified entities in delta mode
    let propsToShow = entity.properties;
    if (isDelta && !isNewEntity && addedColumnNames) {
      propsToShow = entity.properties.filter((p) => addedColumnNames.has(p.name));
    }

    if (propsToShow.length > 0) {
      children.push(this.buildPropertiesTable(
        { ...entity, properties: propsToShow }, fks, allEntityNames, meta
      ));
    }

    // Show removed columns in delta mode
    if (isDelta && removedColumnNames && removedColumnNames.size > 0) {
      children.push(new Paragraph({
        children: [new TextRun({ text: 'Removed Properties', bold: true, size: 32, font: FONT, color: C.heading })],
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 300, after: 120 },
      }));
      for (const colName of removedColumnNames) {
        children.push(new Paragraph({
          children: [
            new TextRun({ text: '✕  ', font: FONT, size: 22, color: C.required }),
            new TextRun({ text: colName, font: MONO, size: 22, color: C.body, strike: true }),
          ],
          spacing: { after: 60 },
          indent: { left: 360 },
        }));
      }
    }

    // Relationships — for modified entities, only show navs for added FK columns
    let navsToShow = fkNavs;
    if (isDelta && !isNewEntity && addedColumnNames) {
      navsToShow = fkNavs.filter((n) => n.fkPropertyName && addedColumnNames.has(n.fkPropertyName));
    }

    if (navsToShow.length > 0) {
      children.push(new Paragraph({
        children: [new TextRun({
          text: isDelta && !isNewEntity ? 'New Relationships' : 'Relationships',
          bold: true, size: 32, font: FONT, color: C.heading,
        })],
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 400, after: 160 },
      }));
      children.push(...this.buildRelationshipRows(navsToShow, allEntityNames));
    }

    return children;
  }

  // ── Properties table ──

  private buildPropertiesTable(
    entity: ODataEntityType,
    fks: Map<string, string>,
    allEntityNames: Set<string>,
    meta: EntityMetadata
  ): Table {
    const headerRow = new TableRow({
      tableHeader: true,
      cantSplit: true,
      children: [
        this.hCell('COLUMN', COL.name),
        this.hCell('TYPE', COL.type),
        this.hCell('REQ', COL.req, AlignmentType.CENTER),
        this.hCell('KEY', COL.key, AlignmentType.CENTER),
        this.hCell('FK REFERENCE', COL.fkRef),
        this.hCell('DESCRIPTION', COL.desc),
      ],
    });

    const dataRows = entity.properties.map((prop, i) => {
      const fkTarget = fks.get(prop.name);
      const isAlt = i % 2 === 1;
      const rowBg = isAlt ? C.tblAltRow : C.white;
      const colDesc = meta.columnDescriptions[prop.name] || '';

      return new TableRow({
        cantSplit: true,
        children: [
          // Column name
          this.dCell(COL.name, rowBg, [
            new TextRun({
              text: prop.name,
              font: MONO, size: 20,
              bold: prop.isKey,
              color: prop.isKey ? C.heading : C.body,
            }),
          ]),

          // Type
          this.dCell(COL.type, rowBg, [
            new TextRun({
              text: prop.creatioType || getEdmTypeShort(prop.type),
              font: MONO, size: 19, color: C.type,
            }),
          ]),

          // Required
          this.dCell(COL.req, rowBg, [
            new TextRun({
              text: prop.nullable ? '○' : '●',
              font: FONT, size: 18,
              color: prop.nullable ? C.reqOff : C.required,
            }),
          ], AlignmentType.CENTER),

          // Key badge
          this.dCell(COL.key, rowBg, this.buildKeyBadge(prop.isKey, !!fkTarget), AlignmentType.CENTER),

          // FK reference
          this.dCell(COL.fkRef, rowBg, this.buildFkRef(fkTarget, allEntityNames)),

          // Description
          this.dCell(COL.desc, rowBg, [
            new TextRun({
              text: colDesc || '—',
              font: FONT, size: 20,
              color: colDesc ? C.body : C.faint,
              italics: !colDesc,
            }),
          ]),
        ],
      });
    });

    return new Table({
      width: { size: PAGE_W, type: WidthType.DXA },
      rows: [headerRow, ...dataRows],
    });
  }

  // ── Relationship rows (arrow style, not table) ──

  private buildRelationshipRows(
    navs: ODataNavigationProperty[],
    allEntityNames: Set<string>,
  ): FileChild[] {
    return navs.map((nav) => {
      const parts: (TextRun | InternalHyperlink)[] = [
        new TextRun({ text: '→  ', font: FONT, size: 22, bold: true, color: C.accent }),
        new TextRun({ text: nav.name, font: FONT, size: 22, color: C.muted, italics: true }),
        new TextRun({ text: '   ', size: 22 }),
      ];

      // Target entity (hyperlink if in doc)
      if (allEntityNames.has(nav.targetEntity)) {
        parts.push(new InternalHyperlink({
          anchor: this.bm(nav.targetEntity),
          children: [new TextRun({ text: nav.targetEntity, font: FONT, size: 22, bold: true, color: C.link })],
        }));
      } else {
        parts.push(new TextRun({ text: nav.targetEntity, font: FONT, size: 22, bold: true, color: C.link }));
      }

      // via clause
      if (nav.fkPropertyName) {
        parts.push(new TextRun({ text: '  via  ', font: FONT, size: 20, color: C.faint }));
        parts.push(new TextRun({ text: `${nav.fkPropertyName} → ${nav.targetEntity}.Id`, font: MONO, size: 19, color: C.muted }));
      }

      return new Paragraph({
        children: parts,
        spacing: { after: 80 },
        indent: { left: 360 },
      });
    });
  }

  // ── Table helpers ──

  private hCell(text: string, width: number, align?: (typeof AlignmentType)[keyof typeof AlignmentType]): TableCell {
    return new TableCell({
      width: { size: width, type: WidthType.DXA },
      shading: { type: ShadingType.SOLID, color: C.tblHeader, fill: C.tblHeader },
      verticalAlign: VerticalAlign.CENTER,
      margins: { top: 60, bottom: 60, left: 120, right: 120 },
      borders: {
        top: noBorder,
        left: noBorder,
        right: noBorder,
        bottom: { style: BorderStyle.SINGLE, size: 12, color: C.border },
      },
      children: [new Paragraph({
        alignment: align,
        children: [new TextRun({
          text,
          bold: true, font: FONT, size: 18, color: C.heading,
          characterSpacing: 40, // wider letter spacing for headers
        })],
      })],
    });
  }

  private dCell(
    width: number,
    bg: string,
    children: (TextRun | InternalHyperlink)[],
    align?: (typeof AlignmentType)[keyof typeof AlignmentType],
  ): TableCell {
    return new TableCell({
      width: { size: width, type: WidthType.DXA },
      shading: { type: ShadingType.SOLID, color: bg, fill: bg },
      verticalAlign: VerticalAlign.CENTER,
      margins: { top: 50, bottom: 50, left: 120, right: 120 },
      borders: {
        top: noBorder,
        left: noBorder,
        right: noBorder,
        bottom: { style: BorderStyle.SINGLE, size: 4, color: C.tblHeader },
      },
      children: [new Paragraph({
        alignment: align,
        children: children.length > 0 ? children : [new TextRun({ text: '', size: 20 })],
      })],
    });
  }

  private buildKeyBadge(isKey: boolean, isFk: boolean): TextRun[] {
    const runs: TextRun[] = [];
    if (isKey) {
      runs.push(new TextRun({
        text: ' PK ',
        font: FONT, size: 16, bold: true,
        color: C.pkText,
        shading: { type: ShadingType.SOLID, color: C.pkBg, fill: C.pkBg },
      }));
    }
    if (isFk) {
      if (runs.length > 0) runs.push(new TextRun({ text: ' ', size: 12 }));
      runs.push(new TextRun({
        text: ' FK ',
        font: FONT, size: 16, bold: true,
        color: C.fkText,
        shading: { type: ShadingType.SOLID, color: C.fkBg, fill: C.fkBg },
      }));
    }
    return runs;
  }

  private buildFkRef(
    fkTarget: string | undefined,
    allEntityNames: Set<string>,
  ): (TextRun | InternalHyperlink)[] {
    if (!fkTarget) return [];
    if (allEntityNames.has(fkTarget)) {
      return [new InternalHyperlink({
        anchor: this.bm(fkTarget),
        children: [new TextRun({ text: fkTarget, font: FONT, size: 20, color: C.link })],
      })];
    }
    return [new TextRun({ text: fkTarget, font: FONT, size: 20, color: C.link })];
  }

  private bm(name: string): string {
    return name.replace(/[^a-zA-Z0-9_]/g, '_');
  }
}
