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
    <Card className="p-2">
      <div className="flex">
        <Button
          variant={mode === 'student' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => onChange('student')}
          className={cn(
            "flex-1 gap-2",
            mode === 'student' && "bg-primary text-primary-foreground"
          )}
        >
          <Users className="h-4 w-4" />
          Student Mode
        </Button>
        <Button
          variant={mode === 'assignment' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => onChange('assignment')}
          className={cn(
            "flex-1 gap-2",
            mode === 'assignment' && "bg-primary text-primary-foreground"
          )}
        >
          <BookOpen className="h-4 w-4" />
          Assignment Mode
        </Button>
      </div>
    </Card>
  );
};