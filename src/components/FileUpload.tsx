import React, { useCallback } from 'react';
import { Upload, FileSpreadsheet, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface FileUploadProps {
  onFileUpload: (file: File) => void;
  uploadedFile: File | null;
  isProcessing: boolean;
  onClearFile: () => void;
}

export const FileUpload: React.FC<FileUploadProps> = ({
  onFileUpload,
  uploadedFile,
  isProcessing,
  onClearFile,
}) => {
  const [dragActive, setDragActive] = React.useState(false);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        onFileUpload(file);
      }
    }
  }, [onFileUpload]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      onFileUpload(e.target.files[0]);
    }
  }, [onFileUpload]);

  if (uploadedFile) {
    return (
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="h-8 w-8 text-data-success" />
            <div>
              <p className="font-medium">{uploadedFile.name}</p>
              <p className="text-sm text-muted-foreground">
                {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearFile}
            disabled={isProcessing}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        {isProcessing && (
          <div className="mt-3 text-sm text-muted-foreground">
            Processing file...
          </div>
        )}
      </Card>
    );
  }

  return (
    <Card
      className={cn(
        "p-8 border-2 border-dashed transition-colors cursor-pointer",
        dragActive && "border-primary bg-primary/5"
      )}
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
    >
      <input
        type="file"
        id="file-upload"
        className="hidden"
        accept=".xlsx,.xls"
        onChange={handleChange}
      />
      <label
        htmlFor="file-upload"
        className="flex flex-col items-center gap-4 cursor-pointer"
      >
        <Upload className="h-12 w-12 text-muted-foreground" />
        <div className="text-center">
          <p className="text-lg font-medium">Upload Excel File</p>
          <p className="text-sm text-muted-foreground">
            Drop your .xlsx file here or click to browse
          </p>
        </div>
      </label>
    </Card>
  );
};