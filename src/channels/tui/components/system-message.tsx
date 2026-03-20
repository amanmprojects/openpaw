import React from 'react';
import { Box, Text } from 'ink';

interface SystemMessageProps {
  content: string;
}

export function SystemMessage({ content }: SystemMessageProps): React.ReactElement {
  return (
    <Box marginBottom={1}>
      <Text color="yellow" dimColor>{content}</Text>
    </Box>
  );
}
