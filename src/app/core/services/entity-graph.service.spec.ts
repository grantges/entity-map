import { TestBed } from '@angular/core/testing';
import { EntityGraphService } from './entity-graph.service';
import { MetadataStoreService } from './metadata-store.service';
import { VISIBLE_PROP_LIMIT } from '../utils/entity-utils';
import { ODataEntityType } from '../models/entity.model';
import { anEntity, aNavProperty, aProperty, properties, FakeMetadataStore } from '../../../testing';

function graphOver(entities: ODataEntityType[]): EntityGraphService {
  const fake = new FakeMetadataStore(entities);
  TestBed.configureTestingModule({
    providers: [
      { provide: MetadataStoreService, useValue: fake as unknown as MetadataStoreService },
    ],
  });
  return TestBed.inject(EntityGraphService);
}

/** A -> B via a visible FK column. */
function linkedTo(target: string, fk = `${target}Id`) {
  return aNavProperty({ name: target, targetEntity: target, fkPropertyName: fk });
}

function entityLinkedTo(name: string, targets: string[]): ODataEntityType {
  return anEntity({
    name,
    properties: [
      aProperty({ name: 'Id', type: 'Edm.Guid', isKey: true, nullable: false }),
      ...targets.map((t) => aProperty({ name: `${t}Id`, type: 'Edm.Guid' })),
    ],
    navigationProperties: targets.map((t) => linkedTo(t)),
  });
}

beforeEach(() => TestBed.resetTestingModule());

describe('EntityGraphService depth', () => {
  const chain = () => [
    entityLinkedTo('A', ['B']),
    entityLinkedTo('B', ['C']),
    anEntity({ name: 'C' }),
  ];

  it('returns only the root at depth 0', () => {
    const result = graphOver(chain()).buildGraph('A', 0);

    expect(result.nodes.map((n) => n.entityName)).toEqual(['A']);
    expect(result.connections).toEqual([]);
  });

  it('reaches one hop at depth 1', () => {
    const result = graphOver(chain()).buildGraph('A', 1);

    expect(result.nodes.map((n) => n.entityName)).toEqual(['A', 'B']);
    expect(result.connections.length).toBe(1);
  });

  it('reaches two hops at depth 2', () => {
    const result = graphOver(chain()).buildGraph('A', 2);

    expect(result.nodes.map((n) => n.entityName)).toEqual(['A', 'B', 'C']);
    expect(result.connections.length).toBe(2);
  });

  it('records the hop count on each node', () => {
    const result = graphOver(chain()).buildGraph('A', 2);

    expect(result.nodes.map((n) => n.depth)).toEqual([0, 1, 2]);
  });

  it('returns an empty graph for an unknown root', () => {
    const result = graphOver(chain()).buildGraph('Nonexistent', 2);

    expect(result.nodes).toEqual([]);
    expect(result.connections).toEqual([]);
  });
});

describe('EntityGraphService cycles and caps', () => {
  it('terminates on a cycle and visits each entity once', () => {
    const result = graphOver([
      entityLinkedTo('A', ['B']),
      entityLinkedTo('B', ['A']),
    ]).buildGraph('A', 5);

    expect(result.nodes.map((n) => n.entityName)).toEqual(['A', 'B']);
    expect(result.connections.length).toBe(2);
  });

  it('stops adding nodes once maxNodes is reached', () => {
    const hub = entityLinkedTo('Hub', ['L1', 'L2', 'L3', 'L4', 'L5']);
    const leaves = ['L1', 'L2', 'L3', 'L4', 'L5'].map((n) => anEntity({ name: n }));

    const result = graphOver([hub, ...leaves]).buildGraph('Hub', 1, { maxNodes: 3 });

    expect(result.nodes.length).toBe(3);
  });

  it('drops connections whose target was cut by maxNodes', () => {
    const hub = entityLinkedTo('Hub', ['L1', 'L2', 'L3', 'L4', 'L5']);
    const leaves = ['L1', 'L2', 'L3', 'L4', 'L5'].map((n) => anEntity({ name: n }));

    const result = graphOver([hub, ...leaves]).buildGraph('Hub', 1, { maxNodes: 3 });
    const names = new Set(result.nodes.map((n) => n.entityName));

    for (const c of result.connections) {
      expect(names.has(c.sourceEntity)).toBe(true);
      expect(names.has(c.targetEntity)).toBe(true);
    }
  });

  it('drops self-referencing connections but keeps the node', () => {
    const selfRef = anEntity({
      name: 'Folder',
      properties: [
        aProperty({ name: 'Id', type: 'Edm.Guid', isKey: true }),
        aProperty({ name: 'ParentId', type: 'Edm.Guid' }),
      ],
      navigationProperties: [
        aNavProperty({ name: 'Parent', targetEntity: 'Folder', fkPropertyName: 'ParentId' }),
      ],
    });

    const result = graphOver([selfRef]).buildGraph('Folder', 2);

    expect(result.nodes.map((n) => n.entityName)).toEqual(['Folder']);
    expect(result.connections).toEqual([]);
  });

  it('deduplicates connections that resolve to the same id', () => {
    const dup = anEntity({
      name: 'Case',
      properties: [
        aProperty({ name: 'Id', type: 'Edm.Guid', isKey: true }),
        aProperty({ name: 'AccountId', type: 'Edm.Guid' }),
      ],
      navigationProperties: [
        aNavProperty({ name: 'Account', targetEntity: 'Account', fkPropertyName: 'AccountId' }),
        aNavProperty({ name: 'Customer', targetEntity: 'Account', fkPropertyName: 'AccountId' }),
      ],
    });

    const result = graphOver([dup, anEntity({ name: 'Account' })]).buildGraph('Case', 1);

    expect(result.connections.length).toBe(1);
  });
});

describe('EntityGraphService system and collection filtering', () => {
  const withSystemNav = () => [
    anEntity({
      name: 'Lead',
      properties: [
        aProperty({ name: 'Id', type: 'Edm.Guid', isKey: true }),
        aProperty({ name: 'CreatedById', type: 'Edm.Guid' }),
      ],
      navigationProperties: [
        aNavProperty({ name: 'CreatedBy', targetEntity: 'Contact', fkPropertyName: 'CreatedById' }),
      ],
    }),
    anEntity({ name: 'Contact' }),
  ];

  it('skips system navigation properties by default', () => {
    const result = graphOver(withSystemNav()).buildGraph('Lead', 1);

    expect(result.nodes.map((n) => n.entityName)).toEqual(['Lead']);
  });

  it('follows system navigation properties when system props are shown', () => {
    const result = graphOver(withSystemNav()).buildGraph('Lead', 1, {
      showSystemProperties: true,
    });

    expect(result.nodes.map((n) => n.entityName)).toEqual(['Lead', 'Contact']);
  });

  const withCollection = () => [
    anEntity({
      name: 'Account',
      navigationProperties: [
        aNavProperty({ name: 'Contacts', targetEntity: 'Contact', isCollection: true }),
      ],
    }),
    anEntity({ name: 'Contact' }),
  ];

  it('ignores collection relationships by default', () => {
    const result = graphOver(withCollection()).buildGraph('Account', 1);

    expect(result.connections).toEqual([]);
  });

  it('emits a one-to-many connection when collections are shown', () => {
    const result = graphOver(withCollection()).buildGraph('Account', 1, {
      showCollections: true,
    });

    expect(result.connections.length).toBe(1);
    expect(result.connections[0].type).toBe('one-to-many');
  });
});

describe('EntityGraphService visible-FK coupling', () => {
  // entity-graph.service.ts comments this as "Must match the canvas rendering
  // logic". Nothing enforces it. An FK column pushed past VISIBLE_PROP_LIMIT
  // stops producing an edge, and the diagram silently loses a relationship.

  function accountLinkAt(position: 'early' | 'late'): ODataEntityType {
    const filler = properties(VISIBLE_PROP_LIMIT - 1);
    const fk = aProperty({ name: 'AccountId', type: 'Edm.Guid' });
    const id = aProperty({ name: 'Id', type: 'Edm.Guid', isKey: true, nullable: false });

    return anEntity({
      name: 'Opportunity',
      properties: position === 'early' ? [id, fk, ...filler] : [id, ...filler, fk],
      navigationProperties: [
        aNavProperty({ name: 'Account', targetEntity: 'Account', fkPropertyName: 'AccountId' }),
      ],
    });
  }

  it('creates an edge when the FK column is within the visible window', () => {
    const result = graphOver([
      accountLinkAt('early'),
      anEntity({ name: 'Account' }),
    ]).buildGraph('Opportunity', 1);

    expect(result.connections.length).toBe(1);
    expect(result.nodes.map((n) => n.entityName)).toEqual(['Opportunity', 'Account']);
  });

  it('creates no edge when the FK column falls past the visible window', () => {
    const result = graphOver([
      accountLinkAt('late'),
      anEntity({ name: 'Account' }),
    ]).buildGraph('Opportunity', 1);

    expect(result.connections).toEqual([]);
    expect(result.nodes.map((n) => n.entityName)).toEqual(['Opportunity']);
  });
});

describe('EntityGraphService connection identity', () => {
  // The canvas binds to these exact strings. Change the format and rendering
  // breaks with nothing failing to compile.
  it('shapes a many-to-one connection as Source.Fk->Target.Id', () => {
    const result = graphOver([
      entityLinkedTo('Opportunity', ['Account']),
      anEntity({ name: 'Account' }),
    ]).buildGraph('Opportunity', 1);

    expect(result.connections[0]).toEqual({
      id: 'Opportunity.AccountId->Account.Id',
      sourceEntity: 'Opportunity',
      sourceProperty: 'AccountId',
      targetEntity: 'Account',
      targetProperty: 'Id',
      type: 'many-to-one',
      outputId: 'Opportunity.AccountId',
      inputId: 'Account.Id',
    });
  });
});
