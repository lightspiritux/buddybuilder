import { PDFDocument } from 'pdf-lib';
import pdfParse from 'pdf-parse';
import { metricsCollector, MetricType, MetricCategory } from '../../ml/code-understanding/telemetry/metrics-collector';
import { performanceTracker, OperationType } from '../../ml/code-understanding/telemetry/performance-tracker';

export interface PDFContent {
  text: string;
  structure: {
    pages: PDFPageContent[];
    toc: TableOfContents[];
  };
  metadata: PDFMetadata;
}

interface PDFPageContent {
  number: number;
  text: string;
  sections: PDFSection[];
  images: PDFImage[];
}

interface PDFSection {
  text: string;
  level: number;
  isHeading: boolean;
}

interface PDFImage {
  data: Uint8Array;
  type: string;
  width: number;
  height: number;
}

interface TableOfContents {
  title: string;
  page: number;
  level: number;
  children: TableOfContents[];
}

interface PDFMetadata {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string[];
  creator?: string;
  producer?: string;
  creationDate?: Date;
  modificationDate?: Date;
  pageCount: number;
}

interface PDFParseResult {
  text: string;
  numpages: number;
  info: {
    Title?: string;
    Author?: string;
    Subject?: string;
    Keywords?: string;
    Creator?: string;
    Producer?: string;
    CreationDate?: string;
    ModDate?: string;
  };
}

export class PDFHandler {
  private static instance: PDFHandler;

  private constructor() {
    this.initializeMetrics();
  }

  static getInstance(): PDFHandler {
    if (!PDFHandler.instance) {
      PDFHandler.instance = new PDFHandler();
    }
    return PDFHandler.instance;
  }

  async extractContent(buffer: ArrayBuffer): Promise<PDFContent> {
    const operationId = performanceTracker.startOperation({
      component: 'PDFHandler',
      operation: OperationType.WORKER_TASK
    });

    try {
      const data = (await pdfParse(buffer)) as PDFParseResult;
      const pdfDoc = await PDFDocument.load(buffer);
      const pages = pdfDoc.getPages();

      const pageContents = await Promise.all(
        data.text.split(/\f/).map((pageText: string, index: number) => {
          const page = pages[index];
          return {
            number: index + 1,
            text: pageText.trim(),
            sections: this.analyzeSections(pageText),
            images: [] // Images are handled separately if needed
          };
        })
      );

      const metadata: PDFMetadata = {
        title: data.info.Title,
        author: data.info.Author,
        subject: data.info.Subject,
        keywords: data.info.Keywords?.split(',').map((k: string) => k.trim()),
        creator: data.info.Creator,
        producer: data.info.Producer,
        creationDate: data.info.CreationDate ? new Date(data.info.CreationDate) : undefined,
        modificationDate: data.info.ModDate ? new Date(data.info.ModDate) : undefined,
        pageCount: data.numpages
      };

      const toc = this.generateTableOfContents(pageContents);

      metricsCollector.record('pdf_extract_success', 1, {
        category: MetricCategory.SYSTEM
      });

      return {
        text: data.text,
        structure: {
          pages: pageContents,
          toc
        },
        metadata
      };
    } catch (error) {
      metricsCollector.record('pdf_extract_failed', 1, {
        category: MetricCategory.SYSTEM
      });
      throw error;
    } finally {
      performanceTracker.endOperation(operationId, {
        component: 'PDFHandler',
        operation: OperationType.WORKER_TASK
      });
    }
  }

  private analyzeSections(text: string): PDFSection[] {
    const sections: PDFSection[] = [];
    const lines = text.split('\n');

    let currentLevel = 0;
    for (const line of lines) {
      // Analyze line characteristics to determine if it's a heading
      const { isHeading, level } = this.analyzeHeading(line);
      
      if (isHeading) {
        currentLevel = level;
      }

      sections.push({
        text: line,
        level: currentLevel,
        isHeading
      });
    }

    return sections;
  }

  private analyzeHeading(line: string): { isHeading: boolean; level: number } {
    // Simple heuristics for heading detection:
    // 1. Line length (headings tend to be shorter)
    // 2. Capitalization patterns
    // 3. Numbering patterns (e.g., "1.2.3")
    const trimmedLine = line.trim();
    
    if (!trimmedLine) {
      return { isHeading: false, level: 0 };
    }

    // Check for numbered sections (e.g., "1.", "1.1", "1.1.1")
    const numberMatch = trimmedLine.match(/^(\d+\.)+\s/);
    if (numberMatch) {
      const level = numberMatch[0].split('.').length - 1;
      return { isHeading: true, level };
    }

    // Check for all caps lines (common in headings)
    if (trimmedLine === trimmedLine.toUpperCase() && trimmedLine.length < 100) {
      return { isHeading: true, level: 1 };
    }

    // Check for short lines that start with capital letter
    if (trimmedLine.length < 60 && /^[A-Z]/.test(trimmedLine)) {
      return { isHeading: true, level: 2 };
    }

    return { isHeading: false, level: 0 };
  }

  private generateTableOfContents(pages: PDFPageContent[]): TableOfContents[] {
    const toc: TableOfContents[] = [];
    const stack: TableOfContents[] = [];

    for (const page of pages) {
      for (const section of page.sections) {
        if (section.isHeading) {
          const entry: TableOfContents = {
            title: section.text,
            page: page.number,
            level: section.level,
            children: []
          };

          while (stack.length > 0 && stack[stack.length - 1].level >= section.level) {
            stack.pop();
          }

          if (stack.length === 0) {
            toc.push(entry);
          } else {
            stack[stack.length - 1].children.push(entry);
          }

          stack.push(entry);
        }
      }
    }

    return toc;
  }

  private initializeMetrics(): void {
    metricsCollector.registerMetric({
      name: 'pdf_extract_success',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of successful PDF extractions'
    });

    metricsCollector.registerMetric({
      name: 'pdf_extract_failed',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Number of failed PDF extractions'
    });
  }
}
