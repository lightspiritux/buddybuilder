/**
 * Image Handler
 * 
 * Handles image processing and management:
 * 1. Image upload and storage
 * 2. Drag and drop functionality
 * 3. Image optimization
 * 4. Format conversion
 * 5. Metadata extraction
 */

import sharp from 'sharp';
import { metricsCollector, MetricType, MetricCategory } from '../../code-understanding/telemetry/metrics-collector';
import { performanceTracker, OperationType } from '../../code-understanding/telemetry/performance-tracker';

export interface ImageMetadata {
  width: number;
  height: number;
  format: string;
  size: number;
  colorSpace?: string;
  hasAlpha?: boolean;
  orientation?: number;
  exif?: Record<string, any>;
}

export interface ImageProcessingOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  format?: 'jpeg' | 'png' | 'webp' | 'avif';
  preserveMetadata?: boolean;
  stripExif?: boolean;
}

export interface ProcessedImage {
  buffer: Buffer;
  metadata: ImageMetadata;
  originalName: string;
  processedName: string;
}

export class ImageHandler {
  private static instance: ImageHandler;
  private supportedFormats = new Set(['jpeg', 'jpg', 'png', 'webp', 'avif', 'gif', 'svg']);
  private maxFileSize = 10 * 1024 * 1024; // 10MB

  private constructor() {
    this.initializeMetrics();
  }

  static getInstance(): ImageHandler {
    if (!ImageHandler.instance) {
      ImageHandler.instance = new ImageHandler();
    }
    return ImageHandler.instance;
  }

  /**
   * Process uploaded image
   */
  async processImage(
    input: Buffer | string,
    fileName: string,
    options: ImageProcessingOptions = {}
  ): Promise<ProcessedImage> {
    const operationId = performanceTracker.startOperation({
      component: 'ImageHandler',
      operation: OperationType.RESOURCE_CLEANUP
    });

    try {
      const image = sharp(input);
      const metadata = await image.metadata();

      // Validate image
      await this.validateImage(metadata, fileName);

      // Process image
      const processedImage = await this.applyProcessing(image, options);
      const processedMetadata = await processedImage.metadata();

      const result: ProcessedImage = {
        buffer: await processedImage.toBuffer(),
        metadata: this.extractMetadata(processedMetadata),
        originalName: fileName,
        processedName: this.generateProcessedName(fileName, options)
      };

      // Record metrics
      this.recordMetrics(result);

      return result;
    } finally {
      performanceTracker.endOperation(operationId, {
        component: 'ImageHandler',
        operation: OperationType.RESOURCE_CLEANUP
      });
    }
  }

  /**
   * Handle drag and drop upload
   */
  async handleDragAndDrop(files: FileList): Promise<ProcessedImage[]> {
    const images: ProcessedImage[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (this.isValidImageFile(file)) {
        const buffer = await this.fileToBuffer(file);
        const processed = await this.processImage(buffer, file.name);
        images.push(processed);
      }
    }

    return images;
  }

  /**
   * Validate file type
   */
  isValidImageFile(file: File): boolean {
    const extension = file.name.split('.').pop()?.toLowerCase();
    return extension ? this.supportedFormats.has(extension) : false;
  }

  private async validateImage(metadata: sharp.Metadata, fileName: string): Promise<void> {
    if (!metadata.format || !this.supportedFormats.has(metadata.format)) {
      throw new Error(`Unsupported image format: ${metadata.format}`);
    }

    if (metadata.size && metadata.size > this.maxFileSize) {
      throw new Error(`File size exceeds maximum allowed size of ${this.maxFileSize} bytes`);
    }

    if (!metadata.width || !metadata.height) {
      throw new Error('Invalid image dimensions');
    }
  }

  private async applyProcessing(
    image: sharp.Sharp,
    options: ImageProcessingOptions
  ): Promise<sharp.Sharp> {
    let processed = image;

    // Resize if needed
    if (options.maxWidth || options.maxHeight) {
      processed = processed.resize(options.maxWidth, options.maxHeight, {
        fit: 'inside',
        withoutEnlargement: true
      });
    }

    // Convert format if specified
    if (options.format) {
      processed = processed[options.format]({
        quality: options.quality || 80
      });
    }

    // Strip metadata if requested
    if (options.stripExif) {
      processed = processed.withMetadata({ stripExif: true });
    }

    return processed;
  }

  private extractMetadata(metadata: sharp.Metadata): ImageMetadata {
    return {
      width: metadata.width || 0,
      height: metadata.height || 0,
      format: metadata.format || 'unknown',
      size: metadata.size || 0,
      colorSpace: metadata.space,
      hasAlpha: metadata.hasAlpha,
      orientation: metadata.orientation,
      exif: metadata.exif ? this.parseExif(metadata.exif) : undefined
    };
  }

  private parseExif(exif: Buffer): Record<string, any> {
    try {
      // Implementation would parse EXIF data
      return {};
    } catch (error) {
      console.warn('Failed to parse EXIF data:', error);
      return {};
    }
  }

  private generateProcessedName(originalName: string, options: ImageProcessingOptions): string {
    const parts = originalName.split('.');
    const extension = options.format || parts.pop();
    const baseName = parts.join('.');
    
    const suffix = [
      options.maxWidth && `w${options.maxWidth}`,
      options.maxHeight && `h${options.maxHeight}`,
      options.quality && `q${options.quality}`
    ].filter(Boolean).join('_');

    return suffix ? `${baseName}_${suffix}.${extension}` : `${baseName}.${extension}`;
  }

  private async fileToBuffer(file: File): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (reader.result instanceof ArrayBuffer) {
          resolve(Buffer.from(reader.result));
        } else {
          reject(new Error('Failed to read file'));
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  }

  private recordMetrics(image: ProcessedImage): void {
    metricsCollector.record('image_processing_total', 1);
    metricsCollector.record('image_size_original', image.metadata.size);
    metricsCollector.record('image_width', image.metadata.width);
    metricsCollector.record('image_height', image.metadata.height);
  }

  private initializeMetrics(): void {
    metricsCollector.registerMetric({
      name: 'image_processing_total',
      type: MetricType.COUNTER,
      category: MetricCategory.SYSTEM,
      description: 'Total number of processed images'
    });

    metricsCollector.registerMetric({
      name: 'image_size_original',
      type: MetricType.GAUGE,
      category: MetricCategory.SYSTEM,
      description: 'Original image size in bytes'
    });

    metricsCollector.registerMetric({
      name: 'image_width',
      type: MetricType.GAUGE,
      category: MetricCategory.SYSTEM,
      description: 'Image width in pixels'
    });

    metricsCollector.registerMetric({
      name: 'image_height',
      type: MetricType.GAUGE,
      category: MetricCategory.SYSTEM,
      description: 'Image height in pixels'
    });
  }
}

// Export factory function
export function createImageHandler(): ImageHandler {
  return ImageHandler.getInstance();
}
