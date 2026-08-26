import { filterForFilename } from './platform.model';

describe('filterForFilename', () => {
  it('maps a known extension to its named filter, with an All Files fallback', () => {
    expect(filterForFilename('schema.docx')).toEqual([
      { name: 'Word Document', extensions: ['docx'] },
      { name: 'All Files', extensions: ['*'] },
    ]);
  });

  it('lowercases the extension before matching', () => {
    expect(filterForFilename('SCHEMA.XML')[0]).toEqual({
      name: 'XML File',
      extensions: ['xml'],
    });
  });

  it('falls back to All Files for an unknown extension', () => {
    expect(filterForFilename('notes.taxt')).toEqual([
      { name: 'All Files', extensions: ['*'] },
    ]);
  });

  it('falls back to All Files when the name has no extension', () => {
    expect(filterForFilename('README')).toEqual([
      { name: 'All Files', extensions: ['*'] },
    ]);
  });
});
