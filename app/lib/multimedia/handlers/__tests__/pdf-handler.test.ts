import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PDFHandler, createPDFHandler, type PDFProcessingOptions } from '../pdf-handler';
import { createImageHandler, type ProcessedImage, type ImageProcessingOptions } from '../image-handler';
import { metricsCollector } from '../../../../lib/ml/code-understanding/telemetry/metrics-collector';
import { performanceTracker } from '../../../../lib/ml/code-understanding/telemetry/performance-tracker';

// Mock sharp
vi.mock('sharp', () => ({
  default: vi.fn().mockReturnValue({
    metadata: vi.fn().mockResolvedValue({
      width: 100,
      height: 100,
      format: 'png',
      size: 1000,
      space: 'rgb'
    }),
    resize: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from('processed image'))
  })
}));

// Mock pdf-lib
vi.mock('pdf-lib', () => ({
  PDFDocument: {
    load: vi.fn().mockImplementation(async (buffer) => ({
      getDocumentInfo: () => ({
        title: 'Test PDF',
        author: 'Test Author',
        subject: 'Test Subject',
        keywords: 'test,pdf,images',
        creator: 'Test Creator',
        producer: 'Test Producer',
        creationDate: new Date(),
        modificationDate: new Date()
      }),
      getPageCount: () => 2,
      getPage: (index: number) => ({
        // Mock page implementation
        getOperatorList: async () => ({
          fnArray: [],
          argsArray: []
        })
      })
    }))
  }
}));

// Mock image handler
vi.mock('../image-handler', () => {
  const mockProcessImage = vi.fn().mockImplementation(async (buffer: Buffer | string, fileName: string, options?: ImageProcessingOptions): Promise<ProcessedImage> => ({
    buffer: Buffer.from('processed image'),
    metadata: {
      width: 100,
      height: 100,
      format: 'png',
      size: 1000,
      colorSpace: 'rgb'
    },
    originalName: fileName,
    processedName: `processed_${fileName}`
  }));

  return {
    createImageHandler: vi.fn().mockReturnValue({
      processImage: mockProcessImage,
      handleDragAndDrop: vi.fn().mockResolvedValue([]),
      isValidImageFile: vi.fn().mockReturnValue(true)
    })
  };
});

describe('PDFHandler', () => {
  let pdfHandler: PDFHandler;
  const mockPDFBuffer = Buffer.from('mock pdf content');

  beforeEach(() => {
    // Mock metrics collector
    vi.spyOn(metricsCollector, 'record').mockImplementation(() => {});
    vi.spyOn(metricsCollector, 'registerMetric').mockImplementation(() => {});

    // Mock performance tracker
    vi.spyOn(performanceTracker, 'startOperation').mockReturnValue('test-op');
    vi.spyOn(performanceTracker, 'endOperation').mockImplementation(() => {});

    // Reset mock implementations
    vi.clearAllMocks();

    pdfHandler = createPDFHandler();
  });

  describe('Image Extraction', () => {
    it('should extract images from PDF', async () => {
      const options: PDFProcessingOptions = {
        pageRange: { start: 1, end: 2 },
        imageQuality: 80
      };

      const result = await pdfHandler.extractImages(mockPDFBuffer, options);
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle empty PDFs', async () => {
      const emptyPDFBuffer = Buffer.from('empty pdf');
      const result = await pdfHandler.extractImages(emptyPDFBuffer);
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });

    it('should respect page range options', async () => {
      const options: PDFProcessingOptions = {
        pageRange: { start: 2, end: 2 }
      };

      const result = await pdfHandler.extractImages(mockPDFBuffer, options);
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle image size filters', async () => {
      const options: PDFProcessingOptions = {
        minImageSize: 1000,
        maxImageSize: 10000
      };

      const result = await pdfHandler.extractImages(mockPDFBuffer, options);
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('Metadata Handling', () => {
    it('should extract PDF metadata', async () => {
      const result = await pdfHandler.extractImages(mockPDFBuffer, {
        extractMetadata: true
      });

      expect(metricsCollector.record).toHaveBeenCalledWith(
        'pdf_pages_processed',
        expect.any(Number)
      );
    });

    it('should handle missing metadata fields', async () => {
      // Mock PDFDocument with missing metadata
      vi.mocked(require('pdf-lib').PDFDocument.load).mockImplementationOnce(async () => ({
        getDocumentInfo: () => ({}),
        getPageCount: () => 1,
        getPage: () => ({})
      }));

      const result = await pdfHandler.extractImages(mockPDFBuffer);
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('Image Processing', () => {
    it('should process extracted images', async () => {
      const result = await pdfHandler.extractImages(mockPDFBuffer, {
        imageQuality: 90
      });

      expect(createImageHandler).toHaveBeenCalled();
      const imageHandler = vi.mocked(createImageHandler).mock.results[0].value;
      expect(imageHandler.processImage).toHaveBeenCalled();
    });

    it('should handle image processing errors', async () => {
      // Mock image processing error
      const imageHandler = vi.mocked(createImageHandler).mock.results[0].value;
      vi.mocked(imageHandler.processImage).mockRejectedValueOnce(
        new Error('Processing failed')
      );

      await expect(pdfHandler.extractImages(mockPDFBuffer)).rejects.toThrow();
    });
  });

  describe('Performance Tracking', () => {
    it('should track performance metrics', async () => {
      await pdfHandler.extractImages(mockPDFBuffer);

      expect(performanceTracker.startOperation).toHaveBeenCalledWith({
        component: 'PDFHandler',
        operation: expect.any(String)
      });

      expect(performanceTracker.endOperation).toHaveBeenCalled();
    });

    it('should track image processing metrics', async () => {
      await pdfHandler.extractImages(mockPDFBuffer);

      expect(metricsCollector.record).toHaveBeenCalledWith(
        'pdf_images_processed',
        expect.any(Number)
      );

      expect(metricsCollector.record).toHaveBeenCalledWith(
        'pdf_images_original_size',
        expect.any(Number)
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle PDF loading errors', async () => {
      vi.mocked(require('pdf-lib').PDFDocument.load).mockRejectedValueOnce(
        new Error('Failed to load PDF')
      );

      await expect(pdfHandler.extractImages(mockPDFBuffer)).rejects.toThrow(
        'Failed to load PDF'
      );
    });

    it('should handle invalid page ranges', async () => {
      const options: PDFProcessingOptions = {
        pageRange: { start: 999, end: 1000 }
      };

      const result = await pdfHandler.extractImages(mockPDFBuffer, options);
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });

    it('should handle corrupted PDF data', async () => {
      const corruptedBuffer = Buffer.from('corrupted data');
      await expect(pdfHandler.extractImages(corruptedBuffer)).rejects.toThrow();
    });
  });

  describe('Memory Management', () => {
    it('should clean up resources after processing', async () => {
      const result = await pdfHandler.extractImages(mockPDFBuffer);
      expect(performanceTracker.endOperation).toHaveBeenCalled();
    });

    it('should handle large PDFs efficiently', async () => {
      const largePDFBuffer = Buffer.alloc(1024 * 1024); // 1MB mock PDF
      const result = await pdfHandler.extractImages(largePDFBuffer);
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
