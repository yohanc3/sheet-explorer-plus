import React from 'react';
import { Card } from '@/components/ui/card';
import { ExternalLink, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ParsedData } from '@/types/data';
import { format } from 'date-fns';

interface IframeContainerProps {
  selectedData: ParsedData | null;
}

export const IframeContainer: React.FC<IframeContainerProps> = ({ selectedData }) => {
  if (!selectedData) {
    return (
      <Card className="h-full p-8 flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <ExternalLink className="h-16 w-16 mx-auto mb-4 opacity-50" />
          <h3 className="text-xl font-semibold mb-2">Assignment Viewer</h3>
          <p>Select an item from the sidebar to view the assignment content</p>
        </div>
      </Card>
    );
  }

  const isValidUrl = selectedData.share && 
    selectedData.share !== 'N/A' && 
    selectedData.share !== '' &&
    (selectedData.share.startsWith('http://') || selectedData.share.startsWith('https://'));

  if (!isValidUrl) {
    return (
      <Card className="h-full p-8">
        <div className="h-full flex items-center justify-center">
          <div className="max-w-md w-full space-y-6">
            <div className="text-center">
              <AlertTriangle className="h-16 w-16 mx-auto text-data-warning mb-4" />
              <h3 className="text-xl font-semibold mb-2">Invalid or Missing URL</h3>
              <p className="text-muted-foreground mb-6">
                This assignment doesn't have a valid share link
              </p>
            </div>
            
            <Card className="p-6 space-y-4 bg-muted/30">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium text-muted-foreground">Student:</span>
                  <p className="font-semibold">{selectedData.fullName}</p>
                </div>
                <div>
                  <span className="font-medium text-muted-foreground">Date:</span>
                  <p>{format(selectedData.timestamp, 'PPP')}</p>
                </div>
              </div>
              
              <div>
                <span className="font-medium text-muted-foreground">Assignment:</span>
                <p className="font-semibold">{selectedData.title}</p>
              </div>
              
              <div>
                <span className="font-medium text-muted-foreground">Share URL:</span>
                <p className="text-destructive font-mono text-xs break-all bg-destructive/10 p-2 rounded">
                  {selectedData.share || 'No URL provided'}
                </p>
              </div>
              
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium text-muted-foreground">Time:</span>
                  <p>{selectedData.time}</p>
                </div>
                <div>
                  <span className="font-medium text-muted-foreground">Difficulty:</span>
                  <p>{selectedData.difficulty}</p>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="h-full overflow-hidden">
      <div className="h-12 px-4 border-b flex items-center justify-between bg-sidebar-bg">
        <div className="flex items-center gap-2 min-w-0">
          <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium truncate">
            {selectedData.fullName} - {selectedData.title}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => window.open(selectedData.share, '_blank')}
        >
          Open in New Tab
        </Button>
      </div>
      
      <div className="h-[calc(100%-48px)]">
        <iframe
          src={selectedData.share}
          className="w-full h-full border-0"
          title={`${selectedData.fullName} - ${selectedData.title}`}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        />
      </div>
    </Card>
  );
};