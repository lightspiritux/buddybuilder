import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { DocxViewer } from '../DocxViewer';
import { DocxParser, DocxContent } from '../../../lib/documents/docx-parser';

// Mock DocxParser
vi.mock('../../../lib/documents/docx-parser', () => ({
  DocxParser: {
    getInstance: vi.fn(() => ({
      parse: vi.fn()
    }))
  }
}));

describe('DocxViewer', () => {
  const mockContent: DocxContent = {
    text: 'Test content',
    metadata: {
      title: 'Test Document',
      author: 'Test Author',
      created: new Date('2024-01-01'),
      modified: new Date('2024-01-02'),
      category: 'Test Category',
      keywords: ['test', 'document']
    },
    structure: {
      paragraphs: [
        { text: 'Test paragraph 1' },
        { text: 'Test heading', isHeading: true, level: 1 }
      ],
      tables: [
        {
          rows: [
            {
              cells: [
                { text: 'Cell 1' },
                { text: 'Cell 2' }
              ]
            }
          ]
        }
      ],
      images: [
        {
          name: 'test.png',
          contentType: 'image/png',
          data: new Uint8Array([1, 2, 3])
        }
      ]
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
    URL.createObjectURL = vi.fn(() => 'blob:test');
    URL.revokeObjectURL = vi.fn();
  });

  it('renders loading state while processing file', async () => {
    const parser = DocxParser.getInstance();
    vi.mocked(parser.parse).mockImplementationOnce(() => new Promise(() => {}));

    const file = new File([''], 'test.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    render(<DocxViewer file={file} />);

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('displays document content after successful parsing', async () => {
    const parser = DocxParser.getInstance();
    vi.mocked(parser.parse).mockResolvedValueOnce(mockContent);

    const file = new File([''], 'test.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    render(<DocxViewer file={file} />);

    await waitFor(() => {
      expect(screen.getByText('Test Document')).toBeInTheDocument();
      expect(screen.getByText('Test Author')).toBeInTheDocument();
      expect(screen.getByText('Test paragraph 1')).toBeInTheDocument();
      expect(screen.getByText('Test heading')).toBeInTheDocument();
      expect(screen.getByText('Cell 1')).toBeInTheDocument();
      expect(screen.getByText('Cell 2')).toBeInTheDocument();
    });
  });

  it('displays error message on parsing failure', async () => {
    const parser = DocxParser.getInstance();
    vi.mocked(parser.parse).mockRejectedValueOnce(new Error('Failed to parse document'));

    const file = new File([''], 'test.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    render(<DocxViewer file={file} />);

    await waitFor(() => {
      expect(screen.getByText('Failed to parse document')).toBeInTheDocument();
    });
  });

  it('calls onLoad callback with parsed content', async () => {
    const parser = DocxParser.getInstance();
    vi.mocked(parser.parse).mockResolvedValueOnce(mockContent);

    const onLoad = vi.fn();
    const file = new File([''], 'test.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    render(<DocxViewer file={file} onLoad={onLoad} />);

    await waitFor(() => {
      expect(onLoad).toHaveBeenCalledWith(mockContent);
    });
  });

  it('calls onError callback on parsing failure', async () => {
    const parser = DocxParser.getInstance();
    const error = new Error('Failed to parse document');
    vi.mocked(parser.parse).mockRejectedValueOnce(error);

    const onError = vi.fn();
    const file = new File([''], 'test.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    render(<DocxViewer file={file} onError={onError} />);

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith(error);
    });
  });

  it('handles missing metadata fields gracefully', async () => {
    const parser = DocxParser.getInstance();
    const contentWithMinimalMetadata: DocxContent = {
      text: 'Test content',
      metadata: {},
      structure: {
        paragraphs: [],
        tables: [],
        images: []
      }
    };

    vi.mocked(parser.parse).mockResolvedValueOnce(contentWithMinimalMetadata);

    const file = new File([''], 'test.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    render(<DocxViewer file={file} />);

    await waitFor(() => {
      expect(screen.queryByText('Title')).not.toBeInTheDocument();
      expect(screen.queryByText('Author')).not.toBeInTheDocument();
    });
  });

  it('applies custom className', () => {
    render(<DocxViewer className="custom-class" />);
    expect(screen.getByTestId('docx-viewer')).toHaveClass('custom-class');
  });

  it('cleans up image blobs on unmount', async () => {
    const parser = DocxParser.getInstance();
    vi.mocked(parser.parse).mockResolvedValueOnce(mockContent);

    const file = new File([''], 'test.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    const { unmount } = render(<DocxViewer file={file} />);

    await waitFor(() => {
      expect(URL.createObjectURL).toHaveBeenCalled();
    });

    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');
  });
});
