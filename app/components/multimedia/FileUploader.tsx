import React, { useCallback, useState, useRef } from 'react';
import { createImageHandler } from '../../lib/multimedia/handlers/image-handler';
import { createPDFHandler } from '../../lib/multimedia/handlers/pdf-handler';
import type { ProcessedImage } from '../../lib/multimedia/handlers/image-handler';

interface FileUploaderProps {
  onUpload?: (files: ProcessedImage[]) => void;
  onError?: (error: Error) => void;
  maxFiles?: number;
  acceptedTypes?: string[];
  maxSize?: number;
}

// Helper function to convert File array to FileList
const createFileList = (files: File[]): FileList => {
  const dataTransfer = new DataTransfer();
  files.forEach(file => dataTransfer.items.add(file));
  return dataTransfer.files;
};

export const FileUploader: React.FC<FileUploaderProps> = ({
  onUpload,
  onError,
  maxFiles = 10,
  acceptedTypes = ['image/*', 'application/pdf'],
  maxSize = 10 * 1024 * 1024 // 10MB
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const imageHandler = createImageHandler();
  const pdfHandler = createPDFHandler();

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.target === dropZoneRef.current) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const processFiles = async (files: FileList) => {
    try {
      setIsProcessing(true);
      setProgress(0);

      const processedFiles: ProcessedImage[] = [];
      const totalFiles = Math.min(files.length, maxFiles);

      for (let i = 0; i < totalFiles; i++) {
        const file = files[i];
        
        if (file.size > maxSize) {
          throw new Error(`File ${file.name} exceeds maximum size of ${maxSize} bytes`);
        }

        if (!acceptedTypes.some(type => {
          const [category, ext] = type.split('/');
          return ext === '*' ? file.type.startsWith(category) : file.type === type;
        })) {
          continue;
        }

        if (file.type === 'application/pdf') {
          const buffer = await file.arrayBuffer();
          const images = await pdfHandler.extractImages(buffer);
          processedFiles.push(...images);
        } else if (imageHandler.isValidImageFile(file)) {
          const singleFileList = createFileList([file]);
          const images = await imageHandler.handleDragAndDrop(singleFileList);
          processedFiles.push(...images);
        }

        setProgress(((i + 1) / totalFiles) * 100);
      }

      onUpload?.(processedFiles);
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error('Failed to process files'));
    } finally {
      setIsProcessing(false);
      setProgress(0);
      setIsDragging(false);
    }
  };

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const { files } = e.dataTransfer;
    if (files.length > 0) {
      await processFiles(files);
    }
  }, [maxFiles, maxSize, acceptedTypes]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const { files } = e.target;
    if (files && files.length > 0) {
      await processFiles(files);
    }
  }, [maxFiles, maxSize, acceptedTypes]);

  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div
        ref={dropZoneRef}
        onClick={handleClick}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={`
          relative p-8 border-2 border-dashed rounded-lg cursor-pointer
          transition-colors duration-200 ease-in-out
          ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={acceptedTypes.join(',')}
          onChange={handleFileSelect}
          className="hidden"
        />

        <div className="text-center">
          {isProcessing ? (
            <div className="space-y-4">
              <div className="text-gray-600">Processing files...</div>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div
                  className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          ) : (
            <>
              <svg
                className="mx-auto h-12 w-12 text-gray-400"
                stroke="currentColor"
                fill="none"
                viewBox="0 0 48 48"
                aria-hidden="true"
              >
                <path
                  d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <div className="mt-4 flex text-sm text-gray-600">
                <div className="text-center w-full">
                  <span className="relative cursor-pointer rounded-md font-medium text-blue-600 focus-within:outline-none focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-2 hover:text-blue-500">
                    Upload files
                  </span>
                  <p className="pl-1">or drag and drop</p>
                  <p className="text-xs text-gray-500 mt-2">
                    {acceptedTypes.join(', ')} up to {Math.round(maxSize / 1024 / 1024)}MB
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default FileUploader;
