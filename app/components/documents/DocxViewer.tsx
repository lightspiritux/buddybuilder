import React from 'react';
import { DocxParser, DocxContent } from '../../lib/documents/docx-parser';

interface DocxViewerProps {
  file?: File;
  onLoad?: (content: DocxContent) => void;
  onError?: (error: Error) => void;
  className?: string;
}

export const DocxViewer: React.FC<DocxViewerProps> = ({
  file,
  onLoad,
  onError,
  className = ''
}) => {
  const [content, setContent] = React.useState<DocxContent | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string>('');
  const parser = DocxParser.getInstance();

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
      const result = await parser.parse(buffer);
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
    <div data-testid="docx-viewer" className={`space-y-6 ${className}`}>
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
          {metadata.created && (
            <>
              <dt className="font-medium">Created</dt>
              <dd>{metadata.created.toLocaleDateString()}</dd>
            </>
          )}
          {metadata.modified && (
            <>
              <dt className="font-medium">Modified</dt>
              <dd>{metadata.modified.toLocaleDateString()}</dd>
            </>
          )}
          {metadata.category && (
            <>
              <dt className="font-medium">Category</dt>
              <dd>{metadata.category}</dd>
            </>
          )}
          {metadata.keywords && metadata.keywords.length > 0 && (
            <>
              <dt className="font-medium">Keywords</dt>
              <dd>{metadata.keywords.join(', ')}</dd>
            </>
          )}
        </dl>
      </div>

      {/* Document Content */}
      <div className="space-y-4">
        {content.structure.paragraphs.map((paragraph, index) => (
          <div key={index} className={`${paragraph.isHeading ? 'font-bold text-lg' : ''}`}>
            {paragraph.text}
          </div>
        ))}

        {content.structure.tables.map((table, tableIndex) => (
          <div key={tableIndex} className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <tbody className="bg-white divide-y divide-gray-200">
                {table.rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {row.cells.map((cell, cellIndex) => (
                      <td
                        key={cellIndex}
                        className="px-6 py-4 whitespace-nowrap text-sm"
                        rowSpan={cell.rowSpan}
                        colSpan={cell.colSpan}
                      >
                        {cell.text}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      {/* Document Images */}
      {content.structure.images.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {content.structure.images.map((image, index) => {
            const blobUrl = URL.createObjectURL(new Blob([image.data], { type: image.contentType }));
            React.useEffect(() => {
              return () => URL.revokeObjectURL(blobUrl);
            }, [blobUrl]);

            return (
              <div key={index} className="aspect-w-16 aspect-h-9">
                <img
                  src={blobUrl}
                  alt={image.name}
                  className="object-contain w-full h-full"
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
