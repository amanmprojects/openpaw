import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';

interface ChatInputProps {
  onSubmit: (value: string) => void;
  isDisabled?: boolean;
  onToggleSidebar?: () => void;
  onNewChat?: () => void;
}

export function ChatInput({ onSubmit, isDisabled = false, onToggleSidebar, onNewChat }: ChatInputProps): React.ReactElement {
  const [value, setValue] = useState('');
  
  useInput(useCallback((input, key) => {
    if (key.ctrl) {
      if (input === 's') {
        onToggleSidebar?.();
        return;
      }
      if (input === 'n') {
        onNewChat?.();
        return;
      }
      return;
    }
    
    if (key.return) {
      if (value.trim() && !isDisabled) {
        onSubmit(value.trim());
        setValue('');
      }
      return;
    }
    
    if (key.backspace || key.delete) {
      setValue(prev => prev.slice(0, -1));
      return;
    }
    
    if (input && !key.ctrl && !key.meta) {
      setValue(prev => prev + input);
    }
  }, [value, isDisabled, onSubmit, onToggleSidebar, onNewChat]));
  
  const displayValue = value || '';
  const placeholder = isDisabled ? 'Processing...' : 'Type a message...';
  
  return (
    <Box borderStyle="round" borderColor="gray" paddingX={1} width="100%">
      <Text color="blue">&gt; </Text>
      <Box flexGrow={1}>
        {displayValue ? (
          <Text>{displayValue}</Text>
        ) : (
          <Text dimColor>{placeholder}</Text>
        )}
      </Box>
    </Box>
  );
}
