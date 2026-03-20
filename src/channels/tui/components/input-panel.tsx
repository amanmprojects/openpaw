import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { TextInput } from '@inkjs/ui';

interface InputPanelProps {
  onSubmit: (value: string) => void;
  isDisabled?: boolean;
  onToggleSidebar?: () => void;
  onNewChat?: () => void;
}

export function InputPanel({ onSubmit, isDisabled = false, onToggleSidebar, onNewChat }: InputPanelProps): React.ReactElement {
  const [inputKey, setInputKey] = useState(0);
  
  useInput((input, key) => {
    if (key.ctrl && input === 's') {
      onToggleSidebar?.();
    }
    if (key.ctrl && input === 'n') {
      onNewChat?.();
    }
  }, { isActive: true });
  
  const handleSubmit = (value: string) => {
    if (!value.trim()) return;
    onSubmit(value.trim());
    setInputKey(k => k + 1);
  };
  
  return (
    <Box borderStyle="round" borderColor="gray" paddingX={1} width="100%">
      <Text color="blue">&gt; </Text>
      <Box flexGrow={1}>
        <TextInput
          key={inputKey}
          placeholder="Type a message..."
          onSubmit={handleSubmit}
          isDisabled={isDisabled}
        />
      </Box>
    </Box>
  );
}
