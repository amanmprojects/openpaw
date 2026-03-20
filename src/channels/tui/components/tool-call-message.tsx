import React from 'react';
import { Box, Text } from 'ink';

interface ToolCallMessageProps {
  name: string;
  input?: unknown;
  output?: string;
}

function truncate(str: string | undefined, maxLen: number): string {
  if (!str) return '';
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen) + '...';
}

export function ToolCallMessage({ name, output }: ToolCallMessageProps): React.ReactElement {
  return (
    <Box flexDirection="column" marginLeft={2} marginBottom={1}>
      <Text dimColor>🔧 {name}</Text>
      {output && (
        <Box 
          marginLeft={2} 
          borderStyle="single" 
          borderLeftColor="gray" 
          paddingLeft={1}
        >
          <Text dimColor>{truncate(output, 300)}</Text>
        </Box>
      )}
    </Box>
  );
}
