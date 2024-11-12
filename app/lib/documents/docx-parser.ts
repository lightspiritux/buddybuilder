import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';
import xpath from 'xpath';
import { metricsCollector, MetricType, MetricCategory } from '../ml/code-understanding/telemetry/metrics-collector';
import { performanceTracker, OperationType } from '../ml/code-understanding/telemetry/performance-tracker';

export interface DocxMetadata {
  title?: string;
  author?: string;
  created?: Date;
  modified?: Date;
  lastModifiedBy?: string;
  revision?: number;
  category?: string;
  keywords?: string[];
}

export interface DocxContent {
  text: string;
  metadata: DocxMetadata;
  structure: {
    paragraphs: DocxParagraph[];
    tables: DocxTable[];
    images: DocxImage[];
  };
}

interface DocxParagraph {
  text: string;
  style?: string;
  level?: number;
  isHeading?: boolean;
}

interface DocxTable {
  rows: DocxTableRow[];
}

interface DocxTableRow {
  cells: DocxTableCell[];
}

interface DocxTableCell {
  text: string;
  rowSpan?: number;
  colSpan?: number;
}

interface DocxImage {
  name: string;
  contentType: string;
  data: Uint8Array;
}

export class DocxParser {
  private static instance: DocxParser;
  private domParser: DOMParser;

  private constructor() {
    this.domParser = new DOMParser();
    this.initializeMetrics();
  }

  static getInstance(): DocxParser {
    if (!DocxParser.instance) {
      DocxParser.instance = new DocxParser();
    }
    return DocxParser.instance;
  }

  async parse(buffer: ArrayBuffer): Promise<DocxContent> {
    const operationId = performanceTracker.startOperation({
      component: 'DocxParser',
      operation: OperationType.WORKER_TASK
    });

    try {
      const zip = await JSZip.loadAsync(buffer);
      
      const [document, coreProps] = await Promise.all([
        this.loadDocumentXml(zip),
        this.loadCoreProperties(zip)
      ]);

      const content = await this.parseDocument(document);
      const metadata = await this.parseMetadata(coreProps);

      metricsCollector.record('docx_parse_success', 1, {
        category: MetricCategory.SYSTEM
      });

      return {
        text: content.text,
        metadata,
        structure: content.structure
      };
    } catch (error) {
      metricsCollector.record('docx_parse_failed', 1, {
        category: MetricCategory.SYSTEM
      });
      throw error;
    } finally {
      performanceTracker.endOperation(operationId, {
        component: 'DocxParser',
        operation: OperationType.WORKER_TASK
      });
    }
  }

  private async loadDocumentXml(zip: JSZip): Promise<Document> {
    const documentXml = await zip.file('word/document.xml')?.async('text');
    if (!documentXml) {
      throw new Error('Invalid DOCX file: missing document.xml');
    }
    return this.domParser.parseFromString(documentXml, 'text/xml');
  }

  private async loadCoreProperties(zip: JSZip): Promise<Document> {
    const propsXml = await zip.file('docProps/core.xml')?.async('text');
    if (!propsXml) {
      throw new Error('Invalid DOCX file: missing core.xml');
    }
    return this.domParser.parseFromString(propsXml, 'text/xml');
  }

  private async parseDocument(doc: Document): Promise<{ text: string; structure: DocxContent['structure'] }> {
    const paragraphs: DocxParagraph[] = [];
    const tables: DocxTable[] = [];
    const images: DocxImage[] = [];
    let fullText = '';

    // Parse paragraphs
    const paragraphNodes = xpath.select('//w:p', doc) as Node[];
    for (const node of paragraphNodes) {
      const paragraph = await this.parseParagraph(node);
      paragraphs.push(paragraph);
      fullText += paragraph.text + '\n';
    }

    // Parse tables
    const tableNodes = xpath.select('//w:tbl', doc) as Node[];
    for (const node of tableNodes) {
      const table = await this.parseTable(node);
      tables.push(table);
      // Add table text to full text
      table.rows.forEach(row => {
        row.cells.forEach(cell => {
          fullText += cell.text + '\t';
        });
        fullText += '\n';
      });
    }

    return {
      text: fullText.trim(),
      structure: { paragraphs, tables, images }
    };
  }

  private async parseParagraph(node: Node): Promise<DocxParagraph> {
    const textNodes = xpath.select('.//w:t/text()', node) as Node[];
    const text = textNodes.map(node => node.nodeValue).join('');

    const styleNode = xpath.select1('.//w:pStyle/@w:val', node) as Attr | null;
    const style = styleNode?.value;

    const levelNode = xpath.select1('.//w:outlineLvl/@w:val', node) as Attr | null;
    const level = levelNode ? parseInt(levelNode.value, 10) : undefined;

    const isHeading = style?.startsWith('Heading');

    return { text, style, level, isHeading };
  }

  private async parseTable(node: Node): Promise<DocxTable> {
    const rows: DocxTableRow[] = [];
    const rowNodes = xpath.select('.//w:tr', node) as Node[];

    for (const rowNode of rowNodes) {
      const cells: DocxTableCell[] = [];
      const cellNodes = xpath.select('.//w:tc', rowNode) as Node[];

      for (const cellNode of cellNodes) {
        const textNodes = xpath.select('.//w:t/text()', cellNode) as Node[];
        const text = textNodes.map(node => node.nodeValue).join('');

        const rowSpanNode = xpath.select1('.//w:vMerge/@w:val', cellNode) as Attr | null;
        const rowSpan = rowSpanNode ? parseInt(rowSpanNode.value, 10) : undefined;

        const colSpanNode = xpath.select1('.//w:gridSpan/@w:val', cellNode) as Attr | null;
        const colSpan = colSpanNode ? parseInt(colSpanNode.value, 10) : undefined;

        cells.push({ text, rowSpan, colSpan });
      }

      rows.push({ cells });
    }

    return { rows };
  }

  private async parseMetadata(doc: Document): Promise<DocxMetadata> {
    const metadata: DocxMetadata = {};

    const select = (path: string): string | undefined => {
      const node = xpath.select1(path, doc) as Node | null;
      return node?.textContent?.trim();
    };

    metadata.title = select('//dc:title');
    metadata.author = select('//dc:creator');
    metadata.category = select('//cp:category');
    metadata.lastModifiedBy = select('//cp:lastModifiedBy');

    const created = select('//dcterms:created');
    if (created) {
      metadata.created = new Date(created);
    }

    const modified = select('//dcterms:modified');
    if (modified) {
      metadata.modified = new Date(modified);
    }

    const revision = select('//cp:revision');
    if (revision) {
      metadata.revision = parseInt(revision, 10);
    }

    const keywords = select('//cp:keywords');
    if (keywords) {
      metadata.keywords = keywords.split(',').map(k => k.trim());
    }

    return metadata;
  }

  private initializeMetrics(): void {
    metricsCollector.registerMetric({
      name: 'docx_parse_success',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of successful DOCX parse operations'
    });

    metricsCollector.registerMetric({
      name: 'docx_parse_failed',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of failed DOCX parse operations'
    });
  }
}
