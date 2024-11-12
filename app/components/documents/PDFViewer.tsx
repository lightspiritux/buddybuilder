import React from 'react';
import { PDFHandler, PDFContent } from '../../lib/multimedia/handlers/pdf-handler';

interface PDFViewerProps {
  file?: File;
  onLoad?: (content: PDFContent) => void;
  onError?: (error: Error) => void;
  className?: string;
}

export const PDFViewer: React.FC<PDFViewerProps> = ({
  file,
  onLoad,
  onError,
  className = ''
}) => {
  const [content, setContent] = React.useState<PDFContent | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string>('');
  const handler = PDFHandler.getInstance();

  React.useEffect(() => {
    if (file) {
      loadDocument(file);
    }
  }, [file]);

  const loadDocument = async (file: File) => {
    setLoading(true);
    setError('');

    try {
      const buffer = await file.arrayBuffer();
      const result = await handler.extractContent(buffer);
      setContent(result);
      onLoad?.(result);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to load document');
      setError(error.message);
      onError?.(error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4">
        <div 
          role="status"
          aria-label="Loading document"
          className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" 
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 text-red-500 p-4 rounded-md">
        {error}
      </div>
    );
  }

  if (!content) {
    return null;
  }

  const { metadata } = content;

  return (
    <div data-testid="pdf-viewer" className={`space-y-6 ${className}`}>
      {/* Document Metadata */}
      <div className="bg-gray-50 p-4 rounded-md">
        <h2 className="text-lg font-medium mb-2">Document Information</h2>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          {metadata.title && (
            <>
              <dt className="font-medium">Title</dt>
              <dd>{metadata.title}</dd>
            </>
          )}
          {metadata.author && (
            <>
              <dt className="font-medium">Author</dt>
              <dd>{metadata.author}</dd>
            </>
          )}
          {metadata.subject && (
            <>
              <dt className="font-medium">Subject</dt>
              <dd>{metadata.subject}</dd>
            </>
          )}
          {metadata.creationDate && (
            <>
              <dt className="font-medium">Created</dt>
              <dd>{metadata.creationDate.toLocaleDateString()}</dd>
            </>
          )}
          {metadata.modificationDate && (
            <>
              <dt className="font-medium">Modified</dt>
              <dd>{metadata.modificationDate.toLocaleDateString()}</dd>
            </>
          )}
          {metadata.keywords && metadata.keywords.length > 0 && (
            <>
              <dt className="font-medium">Keywords</dt>
              <dd>{metadata.keywords.join(', ')}</dd>
            </>
          )}
          <dt className="font-medium">Pages</dt>
          <dd>{metadata.pageCount}</dd>
        </dl>
      </div>

      {/* Table of Contents */}
      {content.structure.toc.length > 0 && (
        <div className="bg-gray-50 p-4 rounded-md">
          <h2 className="text-lg font-medium mb-2">Table of Contents</h2>
          <nav className="space-y-1">
            {content.structure.toc.map((entry, index) => (
              <div
                key={index}
                className="flex items-baseline"
                style={{ marginLeft: `${entry.level * 1}rem` }}
              >
                <span className="text-sm text-gray-600">{entry.page}.</span>
                <span className="ml-2">{entry.title}</span>
              </div>
            ))}
          </nav>
        </div>
      )}

      {/* Document Content */}
      <div className="space-y-4">
        {content.structure.pages.map((page, pageIndex) => (
          <div key={pageIndex} className="border rounded-lg p-4">
            <div className="text-sm text-gray-500 mb-2">Page {page.number}</div>
            <div className="space-y-4">
              {page.sections.map((section, sectionIndex) => (
                <div
                  key={sectionIndex}
                  className={`${
                    section.isHeading
                      ? 'font-bold text-lg'
                      : ''
                  }`}
                  style={{
                    marginLeft: `${section.level * 0.5}rem`
                  }}
                >
                  {section.text}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
