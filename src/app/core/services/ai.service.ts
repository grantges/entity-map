import { Injectable, inject, signal } from '@angular/core';
import { ODataEntityType, ODataProperty, EntityMetadata, getEdmTypeShort } from '../models/entity.model';
import { AiDescriptionResult } from '../models/app.model';
import { SECRET_STORE } from '../platform/platform.model';

export type { AiDescriptionResult } from '../models/app.model';

const LS_KEY_OPENAI_KEY = 'em-openai-api-key-enc';
const LS_KEY_OPENAI_MODEL = 'em-openai-model';

@Injectable({ providedIn: 'root' })
export class AiService {
  private readonly secrets = inject(SECRET_STORE);
  private _apiKey = signal<string>('');
  private _model = signal<string>(localStorage.getItem(LS_KEY_OPENAI_MODEL) || 'gpt-4o-mini');
  private _generating = signal<boolean>(false);
  private _progress = signal<string>('');
  private _ready = false;

  /** Masked key for display (shows last 4 chars) */
  readonly apiKey = this._apiKey.asReadonly();
  readonly model = this._model.asReadonly();
  readonly generating = this._generating.asReadonly();
  readonly progress = this._progress.asReadonly();
  readonly isConfigured = () => this._apiKey().length > 0;

  constructor() {
    // Load encrypted key on startup
    this.loadKey();
  }

  private async loadKey(): Promise<void> {
    const key = await this.secrets.get(LS_KEY_OPENAI_KEY);
    if (key) this._apiKey.set(key);
    this._ready = true;
  }

  async setApiKey(key: string): Promise<void> {
    this._apiKey.set(key);
    await this.secrets.set(LS_KEY_OPENAI_KEY, key);
  }

  setModel(model: string): void {
    this._model.set(model);
    localStorage.setItem(LS_KEY_OPENAI_MODEL, model);
  }

  /**
   * Generate descriptions for a single entity and all its columns.
   */
  async describeEntity(
    entity: ODataEntityType,
    existingMeta?: EntityMetadata
  ): Promise<AiDescriptionResult> {
    if (!this.isConfigured()) {
      throw new Error('OpenAI API key not configured');
    }

    this._generating.set(true);
    this._progress.set(`Describing ${entity.name}...`);

    try {
      const prompt = this.buildEntityPrompt(entity, existingMeta);
      const response = await this.callOpenAI(prompt);
      return this.parseEntityResponse(response, entity);
    } finally {
      this._generating.set(false);
      this._progress.set('');
    }
  }

  /**
   * Generate descriptions for multiple entities (batch).
   */
  async describeEntities(
    entities: ODataEntityType[],
    existingMeta: Map<string, EntityMetadata>
  ): Promise<Map<string, AiDescriptionResult>> {
    if (!this.isConfigured()) {
      throw new Error('OpenAI API key not configured');
    }

    this._generating.set(true);
    const results = new Map<string, AiDescriptionResult>();

    for (let i = 0; i < entities.length; i++) {
      const entity = entities[i];
      this._progress.set(`Describing ${entity.name} (${i + 1}/${entities.length})...`);

      try {
        const result = await this.describeEntity(entity, existingMeta.get(entity.name));
        results.set(entity.name, result);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        console.error(`Failed to describe ${entity.name}:`, msg);
      }

      // Small delay to avoid rate limiting
      if (i < entities.length - 1) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    this._generating.set(false);
    this._progress.set('');
    return results;
  }

  /**
   * Generate an overview/introduction paragraph for a set of entities
   * (used during documentation export).
   */
  async generateDocumentOverview(
    entities: ODataEntityType[],
    entityMeta: Map<string, EntityMetadata>
  ): Promise<string> {
    if (!this.isConfigured()) return '';

    this._generating.set(true);
    this._progress.set('Generating document overview...');

    try {
      const entitySummaries = entities.map((e) => {
        const meta = entityMeta.get(e.name);
        const desc = meta?.description || '';
        const fkCount = e.navigationProperties.filter((n) => !n.isCollection).length;
        return `- ${e.name}: ${e.properties.length} columns, ${fkCount} FK relationships${desc ? '. ' + desc : ''}`;
      }).join('\n');

      const prompt = `You are a technical writer documenting a Creatio CRM system's data model.

Given the following entities being documented:
${entitySummaries}

Write a concise professional overview paragraph (3-5 sentences) that:
1. Summarizes the scope of this documentation
2. Describes how these entities relate to each other at a high level
3. Notes any key patterns (e.g., lookup tables, core business entities, audit fields)

Write in third person, professional tone. Do not use markdown. Output ONLY the overview paragraph.`;

      return await this.callOpenAI(prompt);
    } finally {
      this._generating.set(false);
      this._progress.set('');
    }
  }

  /**
   * Generate a per-entity introduction for documentation export.
   */
  async generateEntityIntro(
    entity: ODataEntityType,
    meta?: EntityMetadata
  ): Promise<string> {
    if (!this.isConfigured()) return '';

    const fkNavs = entity.navigationProperties.filter((n) => !n.isCollection);
    const collNavs = entity.navigationProperties.filter((n) => n.isCollection);

    const prompt = `You are a technical writer documenting a Creatio CRM data entity.

Entity: ${entity.name}
${meta?.description ? 'Description: ' + meta.description : ''}
${entity.baseType ? 'Inherits from: ' + entity.baseType : ''}
Columns: ${entity.properties.map((p) => `${p.name} (${getEdmTypeShort(p.type)})`).join(', ')}
FK Relationships: ${fkNavs.map((n) => `${n.name} → ${n.targetEntity}`).join(', ') || 'None'}
Collections: ${collNavs.length} child collections

Write a brief (2-3 sentence) professional introduction for this entity's documentation section.
Explain what this entity represents in a CRM context and its key purpose.
Output ONLY the introduction text, no markdown.`;

    return await this.callOpenAI(prompt);
  }

  /**
   * Generate NEW properties for an entity based on its description.
   * Returns an array of suggested property definitions.
   */
  async generateProperties(
    entityName: string,
    description: string,
    baseType?: string,
  ): Promise<{ name: string; type: string; creatioType: string; description: string; linkedEntity?: string }[]> {
    if (!this.isConfigured()) {
      throw new Error('OpenAI API key not configured');
    }

    this._generating.set(true);
    this._progress.set(`Generating properties for ${entityName}...`);

    try {
      const prompt = `You are a Creatio CRM data architect designing a new entity.

Entity name: ${entityName}
Description: ${description}
${baseType ? 'Inherits from: ' + baseType + ' (which already provides base fields like Id, CreatedOn, etc.)' : ''}

Generate the columns/properties this entity should have. Do NOT include system columns (Id, CreatedOn, CreatedById, ModifiedOn, ModifiedById, ProcessListeners) — those are inherited automatically.

Use Creatio data types:
- "Text (50)", "Text (250)", "Text (500)", "Text (unlimited)" → Edm.String
- "Integer" → Edm.Int32
- "Float", "Money" → Edm.Decimal
- "Date/Time", "Date", "Time" → Edm.DateTimeOffset
- "Boolean" → Edm.Boolean
- "Lookup" → Edm.Guid (requires a linkedEntity name — the target entity to reference)
- "Unique identifier" → Edm.Guid
- "Image" → Edm.Stream

Respond in this exact JSON format (no markdown, no code fences):
{
  "properties": [
    {
      "name": "PropertyName",
      "creatioType": "Text (250)",
      "edmType": "Edm.String",
      "description": "Brief description",
      "linkedEntity": null
    }
  ]
}

Rules:
- Use PascalCase for property names
- For Lookup types, set linkedEntity to the name of the referenced entity (e.g., "Contact", "Account")
- Include 5-12 properties that make sense for a "${entityName}" in a CRM context
- Keep descriptions concise (one sentence)
- Make the properties practical and domain-appropriate`;

      const response = await this.callOpenAI(prompt);
      return this.parsePropertiesResponse(response);
    } finally {
      this._generating.set(false);
      this._progress.set('');
    }
  }

  private parsePropertiesResponse(
    response: string,
  ): { name: string; type: string; creatioType: string; description: string; linkedEntity?: string }[] {
    try {
      let json = response;
      const fenceMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenceMatch) json = fenceMatch[1];
      json = json.trim();

      const parsed = JSON.parse(json);
      if (!parsed.properties || !Array.isArray(parsed.properties)) return [];

      return parsed.properties.map((p: Record<string, unknown>) => ({
        name: String(p['name'] || ''),
        type: String(p['edmType'] || 'Edm.String'),
        creatioType: String(p['creatioType'] || 'Text (250)'),
        description: String(p['description'] || ''),
        linkedEntity: p['linkedEntity'] ? String(p['linkedEntity']) : undefined,
      })).filter((p: { name: string }) => p.name.length > 0);
    } catch {
      return [];
    }
  }

  // === Private helpers ===

  private buildEntityPrompt(entity: ODataEntityType, existingMeta?: EntityMetadata): string {
    const columns = entity.properties.map((p) => {
      const fkNav = entity.navigationProperties.find(
        (n) => !n.isCollection && n.fkPropertyName === p.name
      );
      const existingDesc = existingMeta?.columnDescriptions[p.name];
      return {
        name: p.name,
        type: getEdmTypeShort(p.type),
        isKey: p.isKey,
        isFk: !!fkNav,
        fkTarget: fkNav?.targetEntity,
        existingDesc,
      };
    });

    const columnList = columns.map((c) => {
      let line = `  - ${c.name} (${c.type})`;
      if (c.isKey) line += ' [PK]';
      if (c.isFk) line += ` [FK → ${c.fkTarget}]`;
      if (c.existingDesc) line += ` — existing description: "${c.existingDesc}"`;
      return line;
    }).join('\n');

    return `You are a technical writer documenting a Creatio CRM data model.

Describe the following entity and each of its columns. This is part of a Creatio (BPM platform) environment.

Entity: ${entity.name}
${entity.baseType ? 'Inherits from: ' + entity.baseType : ''}
Columns:
${columnList}

Respond in this exact JSON format (no markdown, no code fences):
{
  "entityDescription": "Brief description of what this entity represents (1-2 sentences)",
  "columns": {
    "ColumnName": "Brief description of this column's purpose (1 sentence)"
  }
}

Rules:
- For FK columns (marked [FK → Target]), explain what the relationship represents
- For PK columns, note they are the primary identifier
- Keep descriptions concise and professional
- If an existing description is provided, improve it or keep it if already good
- Use Creatio/CRM domain terminology where appropriate`;
  }

  private parseEntityResponse(response: string, entity: ODataEntityType): AiDescriptionResult {
    try {
      // Try to extract JSON from the response (handle markdown fences)
      let json = response;
      const fenceMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenceMatch) json = fenceMatch[1];
      json = json.trim();

      const parsed = JSON.parse(json);
      const columnDescriptions: Record<string, string> = {};

      // Map columns back, only include ones that exist on the entity
      const propNames = new Set(entity.properties.map((p) => p.name));
      if (parsed.columns) {
        for (const [key, value] of Object.entries(parsed.columns)) {
          if (propNames.has(key) && typeof value === 'string') {
            columnDescriptions[key] = value;
          }
        }
      }

      return {
        entityDescription: parsed.entityDescription || '',
        columnDescriptions,
      };
    } catch {
      // If JSON parsing fails, use the whole response as entity description
      return {
        entityDescription: response.slice(0, 500),
        columnDescriptions: {},
      };
    }
  }

  private async callOpenAI(prompt: string): Promise<string> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this._apiKey()}`,
      },
      body: JSON.stringify({
        model: this._model(),
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || '';
  }
}
