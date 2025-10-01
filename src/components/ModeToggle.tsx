import React from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Users, BookOpen } from 'lucide-react';
import { SearchMode } from '@/types/data';
import { cn } from '@/lib/utils';

interface ModeToggleProps {
  mode: SearchMode;
  onChange: (mode: SearchMode) => void;
}

export const ModeToggle: React.FC<ModeToggleProps> = ({ mode, onChange }) => {
  return (
    <Card className="p-4 flex flex-col h-full">
      <div className="flex items-center gap-2 mb-3">
        <div className="h-2 w-2 rounded-full bg-accent"></div>
        <label className="text-sm font-medium">View Mode</label>
      </div>
      <div className="flex flex-1 items-center">
        <div className="grid grid-cols-1 gap-2 w-full lg:grid-cols-2">
          <Button
            variant={mode === 'student' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => onChange('student')}
            className={cn(
              "gap-2 justify-start lg:justify-center",
              mode === 'student' && "bg-accent text-accent-foreground hover:bg-accent/90"
            )}
          >
            <Users className="h-4 w-4" />
            <span className="lg:hidden xl:inline">Student Mode</span>
            <span className="hidden lg:inline xl:hidden">Student</span>
          </Button>
          <Button
            variant={mode === 'assignment' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => onChange('assignment')}
            className={cn(
              "gap-2 justify-start lg:justify-center",
              mode === 'assignment' && "bg-accent text-accent-foreground hover:bg-accent/90"
            )}
          >
            <BookOpen className="h-4 w-4" />
            <span className="lg:hidden xl:inline">Assignment Mode</span>
            <span className="hidden lg:inline xl:hidden">Assignment</span>
          </Button>
        </div>
      </div>
    </Card>
  );
};