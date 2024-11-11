import React, { useState } from 'react';
import type { ProcessedImage } from '../../lib/multimedia/handlers/image-handler';

interface ImageGalleryProps {
  images: ProcessedImage[];
  onDelete?: (index: number) => void;
  onDownload?: (image: ProcessedImage) => void;
}

interface ImageModalProps {
  image: ProcessedImage;
  onClose: () => void;
  onDownload?: (image: ProcessedImage) => void;
}

const ImageModal: React.FC<ImageModalProps> = ({ image, onClose, onDownload }) => {
  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="relative bg-white p-4 rounded-lg max-w-4xl max-h-[90vh] overflow-auto"
        onClick={e => e.stopPropagation()}
      >
        <button
          className="absolute top-2 right-2 text-gray-500 hover:text-gray-700"
          onClick={onClose}
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
        <img
          src={URL.createObjectURL(new Blob([image.buffer]))}
          alt={image.originalName}
          className="max-w-full max-h-[80vh] object-contain"
        />
        <div className="mt-4 space-y-2">
          <div className="text-sm text-gray-600">
            <p>Original name: {image.originalName}</p>
            <p>Processed name: {image.processedName}</p>
            <p>
              Dimensions: {image.metadata.width}x{image.metadata.height}
            </p>
            <p>Format: {image.metadata.format}</p>
            <p>Size: {(image.metadata.size / 1024).toFixed(2)} KB</p>
          </div>
          {onDownload && (
            <button
              className="w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              onClick={() => onDownload(image)}
            >
              Download
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export const ImageGallery: React.FC<ImageGalleryProps> = ({
  images,
  onDelete,
  onDownload
}) => {
  const [selectedImage, setSelectedImage] = useState<ProcessedImage | null>(null);

  const handleDownload = (image: ProcessedImage) => {
    if (onDownload) {
      onDownload(image);
    } else {
      // Default download behavior
      const blob = new Blob([image.buffer]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = image.processedName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="w-full">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {images.map((image, index) => (
          <div
            key={`${image.originalName}-${index}`}
            className="relative group aspect-square bg-gray-100 rounded-lg overflow-hidden"
          >
            <img
              src={URL.createObjectURL(new Blob([image.buffer]))}
              alt={image.originalName}
              className="w-full h-full object-cover cursor-pointer transition-transform duration-200 group-hover:scale-105"
              onClick={() => setSelectedImage(image)}
            />
            <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-opacity duration-200">
              <div className="absolute bottom-0 left-0 right-0 p-2 flex justify-between items-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                <button
                  className="p-1 text-white hover:text-blue-200 focus:outline-none"
                  onClick={() => handleDownload(image)}
                  title="Download"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                </button>
                {onDelete && (
                  <button
                    className="p-1 text-white hover:text-red-200 focus:outline-none"
                    onClick={() => onDelete(index)}
                    title="Delete"
                  >
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                )}
              </div>
            </div>
            <div className="absolute top-0 left-0 right-0 p-2 bg-gradient-to-b from-black/50 to-transparent">
              <p className="text-xs text-white truncate">
                {image.originalName}
              </p>
            </div>
          </div>
        ))}
      </div>

      {selectedImage && (
        <ImageModal
          image={selectedImage}
          onClose={() => setSelectedImage(null)}
          onDownload={handleDownload}
        />
      )}
    </div>
  );
};

export default ImageGallery;
