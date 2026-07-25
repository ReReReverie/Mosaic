"use client";

import React, { useRef, useState } from "react";

interface FolderUploadProps {
  onFilesSelected: (files: File[]) => void;
  selectedCount: number;
  isLoading: boolean;
}

export function FolderUpload({ onFilesSelected, selectedCount, isLoading }: FolderUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  function handleFiles(fileList: FileList | null) {
    if (!fileList) return;
    const files = Array.from(fileList);
    onFilesSelected(files);
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-semibold text-gray-700">Reference Folder</label>
      <div
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed p-6 text-center transition-colors ${
          isDragging
            ? "border-blue-400 bg-blue-50"
            : "border-gray-300 hover:border-gray-400"
        }`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
      >
        <svg className="h-8 w-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M3 7a2 2 0 012-2h3l2 2h7a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
        </svg>
        {selectedCount > 0 ? (
          <p className="text-sm text-gray-700">
            <span className="font-semibold">{selectedCount}</span> file{selectedCount !== 1 ? "s" : ""} selected
          </p>
        ) : (
          <p className="text-sm text-gray-500">Drop a folder here or click to browse</p>
        )}
        <p className="text-xs text-gray-400">Images, PDFs, SVGs, and text files up to 50 MB each</p>
      </div>

      {/* Hidden folder input */}
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        // @ts-expect-error — webkitdirectory is not in the standard types
        webkitdirectory=""
        multiple
        onChange={(e) => handleFiles(e.target.files)}
        disabled={isLoading}
      />
    </div>
  );
}
