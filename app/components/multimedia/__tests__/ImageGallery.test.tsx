import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ImageGallery } from '../ImageGallery';
import type { ProcessedImage, ImageMetadata } from '../../../lib/multimedia/handlers/image-handler';

// Add custom matchers
declare module 'vitest' {
  interface Assertion<T = any> extends jest.Matchers<void, T> {
    toHaveAttribute(attr: string, value?: string): T;
    toHaveFocus(): T;
  }
}

// Create a type that makes all properties optional for testing
type PartialProcessedImage = Partial<ProcessedImage> & Pick<ProcessedImage, 'originalName' | 'processedName'>;

// Mock URL.createObjectURL and URL.revokeObjectURL
const mockObjectUrl = 'blob:mock-url';
global.URL.createObjectURL = vi.fn(() => mockObjectUrl);
global.URL.revokeObjectURL = vi.fn();

// Mock document.createElement for download functionality
const mockAnchor = {
  href: '',
  download: '',
  click: vi.fn(),
};
global.document.createElement = vi.fn((tag: string) => {
  if (tag === 'a') return mockAnchor as any;
  return document.createElement(tag);
});

describe('ImageGallery', () => {
  const mockImages: ProcessedImage[] = [
    {
      buffer: Buffer.from('test image 1'),
      metadata: {
        width: 100,
        height: 100,
        format: 'png',
        size: 1024,
        colorSpace: 'rgb'
      },
      originalName: 'test1.png',
      processedName: 'processed_test1.png'
    },
    {
      buffer: Buffer.from('test image 2'),
      metadata: {
        width: 200,
        height: 200,
        format: 'jpeg',
        size: 2048,
        colorSpace: 'rgb'
      },
      originalName: 'test2.jpg',
      processedName: 'processed_test2.jpg'
    }
  ];

  const mockOnDelete = vi.fn();
  const mockOnDownload = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render all images', () => {
      render(<ImageGallery images={mockImages} />);
      
      const images = screen.getAllByRole('img');
      expect(images).toHaveLength(mockImages.length);
      
      images.forEach((img: HTMLImageElement, index: number) => {
        expect(img).toHaveAttribute('alt', mockImages[index].originalName);
        expect(img).toHaveAttribute('src', mockObjectUrl);
      });
    });

    it('should display image names', () => {
      render(<ImageGallery images={mockImages} />);
      
      mockImages.forEach(image => {
        expect(screen.getByText(image.originalName)).toBeTruthy();
      });
    });

    it('should render delete buttons when onDelete is provided', () => {
      render(<ImageGallery images={mockImages} onDelete={mockOnDelete} />);
      
      const deleteButtons = screen.getAllByTitle('Delete');
      expect(deleteButtons).toHaveLength(mockImages.length);
    });

    it('should not render delete buttons when onDelete is not provided', () => {
      render(<ImageGallery images={mockImages} />);
      
      const deleteButtons = screen.queryAllByTitle('Delete');
      expect(deleteButtons).toHaveLength(0);
    });
  });

  describe('Image Modal', () => {
    it('should open modal when clicking an image', async () => {
      render(<ImageGallery images={mockImages} />);
      
      const firstImage = screen.getAllByRole('img')[0];
      fireEvent.click(firstImage);

      const modal = screen.getByRole('dialog', { hidden: true });
      expect(modal).toBeTruthy();
      
      expect(screen.getByText(`Original name: ${mockImages[0].originalName}`)).toBeTruthy();
      expect(screen.getByText(`Processed name: ${mockImages[0].processedName}`)).toBeTruthy();
      expect(screen.getByText(`Dimensions: ${mockImages[0].metadata.width}x${mockImages[0].metadata.height}`)).toBeTruthy();
    });

    it('should close modal when clicking close button', async () => {
      render(<ImageGallery images={mockImages} />);
      
      // Open modal
      const firstImage = screen.getAllByRole('img')[0];
      fireEvent.click(firstImage);
      
      // Click close button
      const closeButton = screen.getByTitle('Close');
      fireEvent.click(closeButton);
      
      // Modal should be closed
      await waitFor(() => {
        expect(screen.queryByRole('dialog', { hidden: true })).toBeNull();
      });
    });

    it('should close modal when clicking outside', async () => {
      render(<ImageGallery images={mockImages} />);
      
      // Open modal
      const firstImage = screen.getAllByRole('img')[0];
      fireEvent.click(firstImage);
      
      // Click modal backdrop
      const modal = screen.getByRole('dialog', { hidden: true });
      fireEvent.click(modal);
      
      // Modal should be closed
      await waitFor(() => {
        expect(screen.queryByRole('dialog', { hidden: true })).toBeNull();
      });
    });
  });

  describe('Interactions', () => {
    it('should call onDelete when delete button is clicked', () => {
      render(<ImageGallery images={mockImages} onDelete={mockOnDelete} />);
      
      const deleteButtons = screen.getAllByTitle('Delete');
      fireEvent.click(deleteButtons[0]);
      
      expect(mockOnDelete).toHaveBeenCalledWith(0);
    });

    it('should call onDownload when download button is clicked', () => {
      render(<ImageGallery images={mockImages} onDownload={mockOnDownload} />);
      
      const downloadButtons = screen.getAllByTitle('Download');
      fireEvent.click(downloadButtons[0]);
      
      expect(mockOnDownload).toHaveBeenCalledWith(mockImages[0]);
    });

    it('should handle default download behavior when onDownload is not provided', () => {
      render(<ImageGallery images={mockImages} />);
      
      const downloadButtons = screen.getAllByTitle('Download');
      fireEvent.click(downloadButtons[0]);
      
      expect(global.URL.createObjectURL).toHaveBeenCalled();
      expect(mockAnchor.download).toBe(mockImages[0].processedName);
      expect(mockAnchor.click).toHaveBeenCalled();
      expect(global.URL.revokeObjectURL).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle missing image buffers', () => {
      const imagesWithMissingBuffer: PartialProcessedImage[] = [{
        metadata: mockImages[0].metadata,
        originalName: mockImages[0].originalName,
        processedName: mockImages[0].processedName
      }];

      render(<ImageGallery images={imagesWithMissingBuffer as ProcessedImage[]} />);
      
      expect(screen.getByText(mockImages[0].originalName)).toBeTruthy();
    });

    it('should handle missing metadata', () => {
      const imagesWithMissingMetadata: PartialProcessedImage[] = [{
        buffer: mockImages[0].buffer,
        originalName: mockImages[0].originalName,
        processedName: mockImages[0].processedName
      }];

      render(<ImageGallery images={imagesWithMissingMetadata as ProcessedImage[]} />);
      
      expect(screen.getByText(mockImages[0].originalName)).toBeTruthy();
    });
  });

  describe('Accessibility', () => {
    it('should have accessible image names', () => {
      render(<ImageGallery images={mockImages} />);
      
      mockImages.forEach(image => {
        expect(screen.getByAltText(image.originalName)).toBeTruthy();
      });
    });

    it('should have accessible button labels', () => {
      render(<ImageGallery images={mockImages} onDelete={mockOnDelete} />);
      
      expect(screen.getAllByTitle('Download')).toBeTruthy();
      expect(screen.getAllByTitle('Delete')).toBeTruthy();
    });

    it('should maintain focus when modal is open', () => {
      render(<ImageGallery images={mockImages} />);
      
      const firstImage = screen.getAllByRole('img')[0];
      fireEvent.click(firstImage);
      
      const modal = screen.getByRole('dialog', { hidden: true });
      expect(document.activeElement).toBe(modal);
    });
  });
});
