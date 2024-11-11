import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { FileUploader } from '../FileUploader';
import { createImageHandler } from '../../../lib/multimedia/handlers/image-handler';
import { createPDFHandler } from '../../../lib/multimedia/handlers/pdf-handler';

// Extend Vitest matchers
declare module 'vitest' {
  interface Assertion<T = any> {
    toBeInTheDocument(): T;
    toHaveClass(className: string): T;
  }
}

// Mock image and PDF handlers
vi.mock('../../../lib/multimedia/handlers/image-handler', () => ({
  createImageHandler: vi.fn().mockReturnValue({
    isValidImageFile: vi.fn().mockReturnValue(true),
    handleDragAndDrop: vi.fn().mockResolvedValue([{
      buffer: Buffer.from('processed image'),
      metadata: {
        width: 100,
        height: 100,
        format: 'png',
        size: 1000,
        colorSpace: 'rgb'
      },
      originalName: 'test.png',
      processedName: 'processed_test.png'
    }])
  })
}));

vi.mock('../../../lib/multimedia/handlers/pdf-handler', () => ({
  createPDFHandler: vi.fn().mockReturnValue({
    extractImages: vi.fn().mockResolvedValue([{
      buffer: Buffer.from('extracted image'),
      metadata: {
        width: 100,
        height: 100,
        format: 'png',
        size: 1000,
        colorSpace: 'rgb'
      },
      originalName: 'page_1.png',
      processedName: 'processed_page_1.png'
    }])
  })
}));

describe('FileUploader', () => {
  const mockOnUpload = vi.fn();
  const mockOnError = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render upload area', () => {
      render(<FileUploader onUpload={mockOnUpload} onError={mockOnError} />);
      
      expect(screen.getByText(/Upload files/i)).toBeTruthy();
      expect(screen.getByText(/or drag and drop/i)).toBeTruthy();
    });

    it('should show accepted file types', () => {
      const acceptedTypes = ['image/png', 'image/jpeg'];
      render(
        <FileUploader
          onUpload={mockOnUpload}
          onError={mockOnError}
          acceptedTypes={acceptedTypes}
        />
      );

      expect(screen.getByText(acceptedTypes.join(', '))).toBeTruthy();
    });

    it('should show max file size', () => {
      const maxSize = 5 * 1024 * 1024; // 5MB
      render(
        <FileUploader
          onUpload={mockOnUpload}
          onError={mockOnError}
          maxSize={maxSize}
        />
      );

      expect(screen.getByText(/5MB/)).toBeTruthy();
    });
  });

  describe('File Selection', () => {
    it('should handle file input change', async () => {
      render(<FileUploader onUpload={mockOnUpload} onError={mockOnError} />);

      const file = new File(['test image'], 'test.png', { type: 'image/png' });
      const input = screen.getByRole('button').querySelector('input[type="file"]')!;

      Object.defineProperty(input, 'files', {
        value: [file]
      });

      fireEvent.change(input);

      await waitFor(() => {
        expect(mockOnUpload).toHaveBeenCalled();
      });
    });

    it('should handle multiple files', async () => {
      render(<FileUploader onUpload={mockOnUpload} onError={mockOnError} />);

      const files = [
        new File(['test image 1'], 'test1.png', { type: 'image/png' }),
        new File(['test image 2'], 'test2.png', { type: 'image/png' })
      ];

      const input = screen.getByRole('button').querySelector('input[type="file"]')!;

      Object.defineProperty(input, 'files', {
        value: files
      });

      fireEvent.change(input);

      await waitFor(() => {
        expect(mockOnUpload).toHaveBeenCalled();
      });
    });
  });

  describe('Drag and Drop', () => {
    it('should handle file drop', async () => {
      render(<FileUploader onUpload={mockOnUpload} onError={mockOnError} />);

      const file = new File(['test image'], 'test.png', { type: 'image/png' });
      const dropZone = screen.getByRole('button');

      fireEvent.dragEnter(dropZone, {
        dataTransfer: {
          files: [file]
        }
      });

      expect(dropZone.className).toContain('border-blue-500');

      fireEvent.drop(dropZone, {
        dataTransfer: {
          files: [file]
        }
      });

      await waitFor(() => {
        expect(mockOnUpload).toHaveBeenCalled();
      });
    });

    it('should handle PDF drop', async () => {
      render(<FileUploader onUpload={mockOnUpload} onError={mockOnError} />);

      const file = new File(['test pdf'], 'test.pdf', { type: 'application/pdf' });
      const dropZone = screen.getByRole('button');

      fireEvent.drop(dropZone, {
        dataTransfer: {
          files: [file]
        }
      });

      await waitFor(() => {
        expect(mockOnUpload).toHaveBeenCalled();
      });
    });
  });

  describe('Validation', () => {
    it('should reject files exceeding max size', async () => {
      const maxSize = 1024; // 1KB
      render(
        <FileUploader
          onUpload={mockOnUpload}
          onError={mockOnError}
          maxSize={maxSize}
        />
      );

      const file = new File(['x'.repeat(maxSize + 1)], 'large.png', { type: 'image/png' });
      const dropZone = screen.getByRole('button');

      fireEvent.drop(dropZone, {
        dataTransfer: {
          files: [file]
        }
      });

      await waitFor(() => {
        expect(mockOnError).toHaveBeenCalledWith(expect.any(Error));
      });
    });

    it('should filter invalid file types', async () => {
      const acceptedTypes = ['image/png'];
      render(
        <FileUploader
          onUpload={mockOnUpload}
          onError={mockOnError}
          acceptedTypes={acceptedTypes}
        />
      );

      const files = [
        new File(['valid'], 'test.png', { type: 'image/png' }),
        new File(['invalid'], 'test.txt', { type: 'text/plain' })
      ];

      const dropZone = screen.getByRole('button');

      fireEvent.drop(dropZone, {
        dataTransfer: {
          files
        }
      });

      await waitFor(() => {
        expect(mockOnUpload).toHaveBeenCalledWith(expect.arrayContaining([
          expect.objectContaining({ originalName: 'test.png' })
        ]));
      });
    });
  });

  describe('Progress Indication', () => {
    it('should show progress during processing', async () => {
      render(<FileUploader onUpload={mockOnUpload} onError={mockOnError} />);

      const files = Array.from({ length: 3 }, (_, i) => 
        new File(['test'], `test${i}.png`, { type: 'image/png' })
      );

      const dropZone = screen.getByRole('button');

      fireEvent.drop(dropZone, {
        dataTransfer: {
          files
        }
      });

      expect(screen.getByText(/Processing files/i)).toBeTruthy();
      expect(screen.getByRole('progressbar')).toBeTruthy();

      await waitFor(() => {
        expect(mockOnUpload).toHaveBeenCalled();
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle processing errors', async () => {
      vi.mocked(createImageHandler().handleDragAndDrop).mockRejectedValueOnce(
        new Error('Processing failed')
      );

      render(<FileUploader onUpload={mockOnUpload} onError={mockOnError} />);

      const file = new File(['test'], 'test.png', { type: 'image/png' });
      const dropZone = screen.getByRole('button');

      fireEvent.drop(dropZone, {
        dataTransfer: {
          files: [file]
        }
      });

      await waitFor(() => {
        expect(mockOnError).toHaveBeenCalledWith(expect.any(Error));
      });
    });

    it('should handle PDF extraction errors', async () => {
      vi.mocked(createPDFHandler().extractImages).mockRejectedValueOnce(
        new Error('Extraction failed')
      );

      render(<FileUploader onUpload={mockOnUpload} onError={mockOnError} />);

      const file = new File(['test'], 'test.pdf', { type: 'application/pdf' });
      const dropZone = screen.getByRole('button');

      fireEvent.drop(dropZone, {
        dataTransfer: {
          files: [file]
        }
      });

      await waitFor(() => {
        expect(mockOnError).toHaveBeenCalledWith(expect.any(Error));
      });
    });
  });
});
