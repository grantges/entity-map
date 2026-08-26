import { parseMetadataXml, ParseSuccess } from './metadata-parser.core';

const METADATA = `<?xml version="1.0" encoding="utf-8"?>
<edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx">
  <edmx:DataServices>
    <Schema Namespace="Creatio" xmlns="http://docs.oasis-open.org/odata/ns/edm">
      <EntityType Name="Account">
        <Key><PropertyRef Name="Id" /></Key>
        <Property Name="Id" Type="Edm.Guid" Nullable="false" />
        <Property Name="Name" Type="Edm.String" />
        <NavigationProperty Name="Contacts" Type="Collection(Creatio.Contact)" />
      </EntityType>
      <EntityType Name="Contact">
        <Key><PropertyRef Name="Id" /></Key>
        <Property Name="Id" Type="Edm.Guid" Nullable="false" />
        <Property Name="AccountId" Type="Edm.Guid" />
        <NavigationProperty Name="Account" Type="Creatio.Account" />
        <NavigationProperty Name="Owner" Type="Creatio.Contact" />
      </EntityType>
    </Schema>
  </edmx:DataServices>
</edmx:Edmx>`;

function parsedOk(xml: string): ParseSuccess {
  const outcome = parseMetadataXml(xml);
  if ('error' in outcome) {
    throw new Error(`expected a successful parse, got: ${outcome.error}`);
  }
  return outcome.result;
}

describe('parseMetadataXml rejections', () => {
  it('rejects input that is not OData metadata', () => {
    expect(parseMetadataXml('<html></html>')).toEqual({
      error: 'Not a valid OData metadata XML file',
    });
  });

  it('rejects metadata with no Schema namespace', () => {
    const noNamespace = `<edmx:Edmx Version="4.0"><edmx:DataServices></edmx:DataServices></edmx:Edmx>`;

    expect(parseMetadataXml(noNamespace)).toEqual({
      error: 'No Schema Namespace found in metadata',
    });
  });
});

describe('parseMetadataXml entities', () => {
  it('extracts the schema namespace', () => {
    expect(parsedOk(METADATA).namespace).toBe('Creatio');
  });

  it('extracts every entity type', () => {
    expect(parsedOk(METADATA).entities.map((e) => e.name)).toEqual(['Account', 'Contact']);
  });

  it('parses property name, type and nullability', () => {
    const account = parsedOk(METADATA).entities[0];

    expect(account.properties).toEqual([
      { name: 'Id', type: 'Edm.Guid', nullable: false, isKey: true },
      { name: 'Name', type: 'Edm.String', nullable: true, isKey: false },
    ]);
  });

  it('does not mistake NavigationProperty or PropertyRef for a Property', () => {
    const contact = parsedOk(METADATA).entities[1];

    expect(contact.properties.map((p) => p.name)).toEqual(['Id', 'AccountId']);
  });

  it('records the key property names', () => {
    expect(parsedOk(METADATA).entities[0].keyPropertyNames).toEqual(['Id']);
  });
});

describe('parseMetadataXml navigation properties', () => {
  it('derives the FK column when a matching <Nav>Id property exists', () => {
    const contact = parsedOk(METADATA).entities[1];
    const account = contact.navigationProperties.find((n) => n.name === 'Account')!;

    expect(account.fkPropertyName).toBe('AccountId');
    expect(account.targetEntity).toBe('Account');
    expect(account.isCollection).toBe(false);
  });

  it('leaves the FK undefined when no matching column exists', () => {
    const contact = parsedOk(METADATA).entities[1];
    const owner = contact.navigationProperties.find((n) => n.name === 'Owner')!;

    expect(owner.fkPropertyName).toBeUndefined();
  });

  it('recognises a collection navigation property and strips the wrapper', () => {
    const account = parsedOk(METADATA).entities[0];
    const contacts = account.navigationProperties[0];

    expect(contacts.isCollection).toBe(true);
    expect(contacts.targetEntity).toBe('Contact');
  });

  it('counts only single-valued navigations as related entities in the index', () => {
    const accountIndex = parsedOk(METADATA).entityIndex[0];

    expect(accountIndex.relatedEntityNames).toEqual([]);
  });
});
