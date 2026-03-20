import React from 'react';
import { Box, Text } from 'ink';

interface AssistantMessageProps {
  content: string;
}

export function AssistantMessage({ content }: AssistantMessageProps): React.ReactElement {
  const lines = content.split('\n');
  
  return (
    <Box flexDirection="column">
      {lines.map((line, i) => (
        <Text key={i}>{line || ' '}</Text>
      ))}
    </Box>
  );
}
