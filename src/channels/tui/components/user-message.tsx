import React from 'react';
import { Box, Text } from 'ink';

interface UserMessageProps {
  content: string;
}

export function UserMessage({ content }: UserMessageProps): React.ReactElement {
  const lines = content.split('\n');
  
  return (
    <Box marginBottom={1} width="100%">
      <Box borderStyle="single" borderColor="cyan" paddingX={1} width="100%">
        <Box flexDirection="column" width="100%">
          {lines.map((line, i) => (
            <Text key={i} color="cyan">{line}</Text>
          ))}
        </Box>
      </Box>
    </Box>
  );
}
