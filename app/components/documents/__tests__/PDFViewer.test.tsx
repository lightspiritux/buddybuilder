import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { PDFViewer } from '../PDFViewer';
import { PDFHandler, PDFContent } from '../../../lib/multimedia/handlers/pdf-handler';

// Mock PDFHandler
vi.mock('../../../lib/multimedia/handlers/pdf-handler', () => ({
  PDFHandler: {
    getInstance: vi.fn(() => ({
      extractContent: vi.fn()
    }))
  }
}));

describe('PDFViewer', () => {
  const mockContent: PDFContent = {
    text: 'Test content',
    structure: {
      pages: [
        {
          number: 1,
          text: 'Page 1 content',
          sections: [
            { text: 'Heading 1', level: 1, isHeading: true },
            { text: 'Regular text', level: 1, isHeading: false }
          ],
          images: []
        },
        {
          number: 2,
          text: 'Page 2 content',
          sections: [
            { text: 'Heading 2', level: 1, isHeading: true },
            { text: 'More text', level: 1, isHeading: false }
          ],
          images: []
        }
      ],
      toc: [
        {
          title: 'Heading 1',
          page: 1,
          level: 1,
          children: []
        },
        {
          title: 'Heading 2',
          page: 2,
          level: 1,
          children: []
        }
      ]
    },
    metadata: {
      title: 'Test PDF',
      author: 'Test Author',
      subject: 'Test Subject',
      keywords: ['test', 'pdf'],
      creator: 'Test Creator',
      producer: 'Test Producer',
      creationDate: new Date('2024-01-01'),
      modificationDate: new Date('2024-01-02'),
      pageCount: 2
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state while processing file', async () => {
    const handler = PDFHandler.getInstance();
    vi.mocked(handler.extractContent).mockImplementationOnce(() => new Promise(() => {}));

    const file = new File([''], 'test.pdf', { type: 'application/pdf' });
    render(<PDFViewer file={file} />);

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByLabelText('Loading document')).toBeInTheDocument();
  });

  it('displays PDF content after successful loading', async () => {
    const handler = PDFHandler.getInstance();
    vi.mocked(handler.extractContent).mockResolvedValueOnce(mockContent);

    const file = new File([''], 'test.pdf', { type: 'application/pdf' });
    render(<PDFViewer file={file} />);

    await waitFor(() => {
      expect(screen.getByText('Test PDF')).toBeInTheDocument();
      expect(screen.getByText('Test Author')).toBeInTheDocument();
      expect(screen.getByText('Test Subject')).toBeInTheDocument();
      expect(screen.getByText('Page 1 content')).toBeInTheDocument();
      expect(screen.getByText('Page 2 content')).toBeInTheDocument();
    });
  });

  it('displays error message on loading failure', async () => {
    const handler = PDFHandler.getInstance();
    vi.mocked(handler.extractContent).mockRejectedValueOnce(new Error('Failed to load PDF'));

    const file = new File([''], 'test.pdf', { type: 'application/pdf' });
    render(<PDFViewer file={file} />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load PDF')).toBeInTheDocument();
    });
  });

  it('calls onLoad callback with parsed content', async () => {
    const handler = PDFHandler.getInstance();
    vi.mocked(handler.extractContent).mockResolvedValueOnce(mockContent);

    const onLoad = vi.fn();
    const file = new File([''], 'test.pdf', { type: 'application/pdf' });
    render(<PDFViewer file={file} onLoad={onLoad} />);

    await waitFor(() => {
      expect(onLoad).toHaveBeenCalledWith(mockContent);
    });
  });

  it('calls onError callback on loading failure', async () => {
    const handler = PDFHandler.getInstance();
    const error = new Error('Failed to load PDF');
    vi.mocked(handler.extractContent).mockRejectedValueOnce(error);

    const onError = vi.fn();
    const file = new File([''], 'test.pdf', { type: 'application/pdf' });
    render(<PDFViewer file={file} onError={onError} />);

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith(error);
    });
  });

  it('displays table of contents when available', async () => {
    const handler = PDFHandler.getInstance();
    vi.mocked(handler.extractContent).mockResolvedValueOnce(mockContent);

    const file = new File([''], 'test.pdf', { type: 'application/pdf' });
    render(<PDFViewer file={file} />);

    await waitFor(() => {
      expect(screen.getByText('Table of Contents')).toBeInTheDocument();
      expect(screen.getByText('Heading 1')).toBeInTheDocument();
      expect(screen.getByText('Heading 2')).toBeInTheDocument();
    });
  });

  it('handles missing metadata fields gracefully', async () => {
    const handler = PDFHandler.getInstance();
    const contentWithMinimalMetadata: PDFContent = {
      ...mockContent,
      metadata: {
        pageCount: 2
      }
    };

    vi.mocked(handler.extractContent).mockResolvedValueOnce(contentWithMinimalMetadata);

    const file = new File([''], 'test.pdf', { type: 'application/pdf' });
    render(<PDFViewer file={file} />);

    await waitFor(() => {
      expect(screen.queryByText('Title')).not.toBeInTheDocument();
      expect(screen.queryByText('Author')).not.toBeInTheDocument();
      expect(screen.getByText('Pages')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
    });
  });

  it('applies custom className', async () => {
    const handler = PDFHandler.getInstance();
    vi.mocked(handler.extractContent).mockResolvedValueOnce(mockContent);

    const file = new File([''], 'test.pdf', { type: 'application/pdf' });
    render(<PDFViewer file={file} className="custom-class" />);

    await waitFor(() => {
      expect(screen.getByTestId('pdf-viewer')).toHaveClass('custom-class');
    });
  });

  it('renders nothing when no file is provided', () => {
    render(<PDFViewer />);
    expect(screen.queryByTestId('pdf-viewer')).not.toBeInTheDocument();
  });

  it('handles file changes', async () => {
    const handler = PDFHandler.getInstance();
    vi.mocked(handler.extractContent)
      .mockResolvedValueOnce({
        ...mockContent,
        metadata: { ...mockContent.metadata, title: 'First PDF' }
      })
      .mockResolvedValueOnce({
        ...mockContent,
        metadata: { ...mockContent.metadata, title: 'Second PDF' }
      });

    const { rerender } = render(<PDFViewer file={new File([''], 'first.pdf', { type: 'application/pdf' })} />);

    await waitFor(() => {
      expect(screen.getByText('First PDF')).toBeInTheDocument();
    });

    rerender(<PDFViewer file={new File([''], 'second.pdf', { type: 'application/pdf' })} />);

    await waitFor(() => {
      expect(screen.getByText('Second PDF')).toBeInTheDocument();
    });
  });
});
