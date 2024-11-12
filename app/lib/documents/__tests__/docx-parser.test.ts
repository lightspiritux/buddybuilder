import { describe, it, expect, beforeEach, vi } from 'vitest';
import JSZip from 'jszip';
import { DocxParser, DocxContent } from '../docx-parser';

// Mock the metrics collector
vi.mock('../../../ml/code-understanding/telemetry/metrics-collector', () => ({
  metricsCollector: {
    record: vi.fn(),
    registerMetric: vi.fn()
  },
  MetricType: {
    COUNTER: 'counter'
  },
  MetricCategory: {
    SYSTEM: 'system'
  }
}));

// Mock the performance tracker
vi.mock('../../../ml/code-understanding/telemetry/performance-tracker', () => ({
  performanceTracker: {
    startOperation: vi.fn(() => 'operation-id'),
    endOperation: vi.fn()
  },
  OperationType: {
    WORKER_TASK: 'worker_task'
  }
}));

describe('DocxParser', () => {
  let parser: DocxParser;
  let zip: JSZip;

  beforeEach(async () => {
    parser = DocxParser.getInstance();
    zip = new JSZip();

    // Create a minimal valid DOCX structure
    const documentXml = `
      <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body>
          <w:p>
            <w:r>
              <w:t>Hello World</w:t>
            </w:r>
          </w:p>
          <w:p>
            <w:pPr>
              <w:pStyle w:val="Heading1"/>
              <w:outlineLvl w:val="0"/>
            </w:pPr>
            <w:r>
              <w:t>Test Heading</w:t>
            </w:r>
          </w:p>
          <w:tbl>
            <w:tr>
              <w:tc>
                <w:p>
                  <w:r>
                    <w:t>Cell 1</w:t>
                  </w:r>
                </w:p>
              </w:tc>
              <w:tc>
                <w:p>
                  <w:r>
                    <w:t>Cell 2</w:t>
                  </w:r>
                </w:p>
              </w:tc>
            </w:tr>
          </w:tbl>
        </w:body>
      </w:document>
    `;

    const corePropsXml = `
      <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <cp:coreProperties
        xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
        xmlns:dc="http://purl.org/dc/elements/1.1/"
        xmlns:dcterms="http://purl.org/dc/terms/"
        xmlns:dcmitype="http://purl.org/dc/dcmitype/"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <dc:title>Test Document</dc:title>
        <dc:creator>Test Author</dc:creator>
        <cp:lastModifiedBy>Test Editor</cp:lastModifiedBy>
        <cp:revision>1</cp:revision>
        <dcterms:created xsi:type="dcterms:W3CDTF">2024-01-01T00:00:00Z</dcterms:created>
        <dcterms:modified xsi:type="dcterms:W3CDTF">2024-01-02T00:00:00Z</dcterms:modified>
        <cp:category>Test Category</cp:category>
        <cp:keywords>test, docx, parser</cp:keywords>
      </cp:coreProperties>
    `;

    zip.file('word/document.xml', documentXml);
    zip.file('docProps/core.xml', corePropsXml);
  });

  describe('Document Parsing', () => {
    it('parses basic document content', async () => {
      const buffer = await zip.generateAsync({ type: 'arraybuffer' });
      const result = await parser.parse(buffer);

      expect(result.text).toContain('Hello World');
      expect(result.text).toContain('Test Heading');
      expect(result.structure.paragraphs).toHaveLength(2);
      expect(result.structure.tables).toHaveLength(1);
    });

    it('correctly identifies headings', async () => {
      const buffer = await zip.generateAsync({ type: 'arraybuffer' });
      const result = await parser.parse(buffer);

      const heading = result.structure.paragraphs.find(p => p.isHeading);
      expect(heading).toBeDefined();
      expect(heading?.text).toBe('Test Heading');
      expect(heading?.level).toBe(0);
    });

    it('parses table structure', async () => {
      const buffer = await zip.generateAsync({ type: 'arraybuffer' });
      const result = await parser.parse(buffer);

      expect(result.structure.tables[0].rows).toHaveLength(1);
      expect(result.structure.tables[0].rows[0].cells).toHaveLength(2);
      expect(result.structure.tables[0].rows[0].cells[0].text).toBe('Cell 1');
      expect(result.structure.tables[0].rows[0].cells[1].text).toBe('Cell 2');
    });
  });

  describe('Metadata Parsing', () => {
    it('extracts document metadata', async () => {
      const buffer = await zip.generateAsync({ type: 'arraybuffer' });
      const result = await parser.parse(buffer);

      expect(result.metadata).toEqual({
        title: 'Test Document',
        author: 'Test Author',
        lastModifiedBy: 'Test Editor',
        revision: 1,
        category: 'Test Category',
        keywords: ['test', 'docx', 'parser'],
        created: new Date('2024-01-01T00:00:00Z'),
        modified: new Date('2024-01-02T00:00:00Z')
      });
    });
  });

  describe('Error Handling', () => {
    it('handles missing document.xml', async () => {
      zip.remove('word/document.xml');
      const buffer = await zip.generateAsync({ type: 'arraybuffer' });

      await expect(parser.parse(buffer)).rejects.toThrow('missing document.xml');
    });

    it('handles missing core.xml', async () => {
      zip.remove('docProps/core.xml');
      const buffer = await zip.generateAsync({ type: 'arraybuffer' });

      await expect(parser.parse(buffer)).rejects.toThrow('missing core.xml');
    });

    it('handles invalid ZIP file', async () => {
      const invalidBuffer = new ArrayBuffer(10);
      await expect(parser.parse(invalidBuffer)).rejects.toThrow();
    });
  });

  describe('Complex Document Features', () => {
    it('handles merged table cells', async () => {
      const complexTableXml = `
        <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
          <w:body>
            <w:tbl>
              <w:tr>
                <w:tc>
                  <w:tcPr>
                    <w:gridSpan w:val="2"/>
                  </w:tcPr>
                  <w:p>
                    <w:r>
                      <w:t>Merged Cell</w:t>
                    </w:r>
                  </w:p>
                </w:tc>
              </w:tr>
            </w:tbl>
          </w:body>
        </w:document>
      `;

      zip.file('word/document.xml', complexTableXml);
      const buffer = await zip.generateAsync({ type: 'arraybuffer' });
      const result = await parser.parse(buffer);

      expect(result.structure.tables[0].rows[0].cells[0].colSpan).toBe(2);
    });
  });

  describe('Singleton Pattern', () => {
    it('returns the same instance', () => {
      const instance1 = DocxParser.getInstance();
      const instance2 = DocxParser.getInstance();
      expect(instance1).toBe(instance2);
    });
  });
});
