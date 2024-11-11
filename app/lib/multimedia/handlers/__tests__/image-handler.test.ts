import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createImageHandler, type ImageProcessingOptions } from '../image-handler';
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
      space: 'rgb',
      hasAlpha: false,
      orientation: 1
    }),
    resize: vi.fn().mockReturnThis(),
    png: vi.fn().mockReturnThis(),
    jpeg: vi.fn().mockReturnThis(),
    webp: vi.fn().mockReturnThis(),
    avif: vi.fn().mockReturnThis(),
    withMetadata: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from('processed image'))
  })
}));

// Helper to create mock File objects
const createMockFile = (name: string, type: string, size: number): File => {
  return new File(['mock content'], name, { type });
};

// Helper to create mock FileList
const createMockFileList = (files: File[]): FileList => {
  const fileList: Partial<FileList> = {
    length: files.length,
    item: (index: number) => files[index] || null,
    [Symbol.iterator]: function* () {
      for (let i = 0; i < files.length; i++) {
        yield files[i];
      }
    }
  };

  // Add array-like indexing
  files.forEach((file, index) => {
    fileList[index] = file;
  });

  return fileList as FileList;
};

describe('ImageHandler', () => {
  let imageHandler: ReturnType<typeof createImageHandler>;
  const mockImageBuffer = Buffer.from('mock image content');

  beforeEach(() => {
    // Mock metrics collector
    vi.spyOn(metricsCollector, 'record').mockImplementation(() => {});
    vi.spyOn(metricsCollector, 'registerMetric').mockImplementation(() => {});

    // Mock performance tracker
    vi.spyOn(performanceTracker, 'startOperation').mockReturnValue('test-op');
    vi.spyOn(performanceTracker, 'endOperation').mockImplementation(() => {});

    // Reset mock implementations
    vi.clearAllMocks();

    imageHandler = createImageHandler();
  });

  describe('Image Processing', () => {
    it('should process images with default options', async () => {
      const result = await imageHandler.processImage(mockImageBuffer, 'test.png');

      expect(result).toEqual(expect.objectContaining({
        buffer: expect.any(Buffer),
        metadata: expect.objectContaining({
          width: expect.any(Number),
          height: expect.any(Number),
          format: expect.any(String),
          size: expect.any(Number)
        }),
        originalName: 'test.png',
        processedName: expect.stringContaining('test')
      }));
    });

    it('should handle image resizing', async () => {
      const options: ImageProcessingOptions = {
        maxWidth: 800,
        maxHeight: 600,
        quality: 80
      };

      const result = await imageHandler.processImage(mockImageBuffer, 'test.jpg', options);
      const sharp = require('sharp').default;
      
      expect(sharp).toHaveBeenCalled();
      expect(sharp().resize).toHaveBeenCalledWith(
        expect.objectContaining({
          width: 800,
          height: 600,
          fit: 'inside',
          withoutEnlargement: true
        })
      );
    });

    it('should handle format conversion', async () => {
      const options: ImageProcessingOptions = {
        format: 'webp',
        quality: 85
      };

      const result = await imageHandler.processImage(mockImageBuffer, 'test.png', options);
      const sharp = require('sharp').default;
      
      expect(sharp().webp).toHaveBeenCalledWith({ quality: 85 });
    });

    it('should preserve metadata when requested', async () => {
      const options: ImageProcessingOptions = {
        preserveMetadata: true
      };

      const result = await imageHandler.processImage(mockImageBuffer, 'test.jpg', options);
      const sharp = require('sharp').default;
      
      expect(sharp().withMetadata).toHaveBeenCalled();
    });
  });

  describe('Drag and Drop', () => {
    it('should handle drag and drop uploads', async () => {
      const mockFiles = createMockFileList([
        createMockFile('test1.jpg', 'image/jpeg', 1024),
        createMockFile('test2.jpg', 'image/jpeg', 1024)
      ]);

      const result = await imageHandler.handleDragAndDrop(mockFiles);
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
    });

    it('should filter out invalid files', async () => {
      const mockFiles = createMockFileList([
        createMockFile('test1.jpg', 'image/jpeg', 1024),
        createMockFile('invalid.txt', 'text/plain', 1024),
        createMockFile('test2.jpg', 'image/jpeg', 1024)
      ]);

      const result = await imageHandler.handleDragAndDrop(mockFiles);
      expect(result.length).toBe(2);
    });
  });

  describe('Validation', () => {
    it('should validate image files', () => {
      const validFile = createMockFile('test.jpg', 'image/jpeg', 1024);
      const invalidFile = createMockFile('test.txt', 'text/plain', 1024);

      expect(imageHandler.isValidImageFile(validFile)).toBe(true);
      expect(imageHandler.isValidImageFile(invalidFile)).toBe(false);
    });

    it('should enforce file size limits', async () => {
      const largeBuffer = Buffer.alloc(15 * 1024 * 1024); // 15MB
      await expect(
        imageHandler.processImage(largeBuffer, 'large.jpg')
      ).rejects.toThrow();
    });

    it('should validate image dimensions', async () => {
      vi.mocked(require('sharp').default).mockReturnValueOnce({
        metadata: vi.fn().mockResolvedValue({
          width: 10000,
          height: 10000,
          format: 'png'
        })
      });

      await expect(
        imageHandler.processImage(mockImageBuffer, 'huge.png')
      ).rejects.toThrow();
    });
  });

  describe('Performance Tracking', () => {
    it('should track processing metrics', async () => {
      await imageHandler.processImage(mockImageBuffer, 'test.png');

      expect(performanceTracker.startOperation).toHaveBeenCalledWith({
        component: 'ImageHandler',
        operation: expect.any(String)
      });

      expect(performanceTracker.endOperation).toHaveBeenCalled();
    });

    it('should record image metrics', async () => {
      await imageHandler.processImage(mockImageBuffer, 'test.png');

      expect(metricsCollector.record).toHaveBeenCalledWith(
        'image_processing_total',
        expect.any(Number)
      );

      expect(metricsCollector.record).toHaveBeenCalledWith(
        'image_size_original',
        expect.any(Number)
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle processing errors', async () => {
      vi.mocked(require('sharp').default).mockReturnValueOnce({
        metadata: vi.fn().mockRejectedValue(new Error('Processing failed'))
      });

      await expect(
        imageHandler.processImage(mockImageBuffer, 'test.png')
      ).rejects.toThrow('Processing failed');
    });

    it('should handle invalid image data', async () => {
      const invalidBuffer = Buffer.from('invalid image data');
      await expect(
        imageHandler.processImage(invalidBuffer, 'invalid.jpg')
      ).rejects.toThrow();
    });

    it('should handle metadata extraction errors', async () => {
      vi.mocked(require('sharp').default).mockReturnValueOnce({
        metadata: vi.fn().mockRejectedValue(new Error('Metadata extraction failed'))
      });

      await expect(
        imageHandler.processImage(mockImageBuffer, 'test.png')
      ).rejects.toThrow();
    });
  });

  describe('Memory Management', () => {
    it('should clean up resources after processing', async () => {
      await imageHandler.processImage(mockImageBuffer, 'test.png');
      expect(performanceTracker.endOperation).toHaveBeenCalled();
    });

    it('should handle batch processing efficiently', async () => {
      const mockFiles = createMockFileList(
        Array.from({ length: 5 }, (_, i) => 
          createMockFile(`test${i + 1}.jpg`, 'image/jpeg', 1024)
        )
      );

      const result = await imageHandler.handleDragAndDrop(mockFiles);
      expect(result.length).toBe(5);
      expect(performanceTracker.endOperation).toHaveBeenCalledTimes(5);
    });
  });
});
