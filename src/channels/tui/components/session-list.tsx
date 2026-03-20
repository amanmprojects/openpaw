import React from 'react';
import { Box, Text } from 'ink';
import { Select } from '@inkjs/ui';
import type { SessionListItem } from '../../../types/index.js';

interface SessionListProps {
  sessions: SessionListItem[];
  currentSessionId: string;
  onSelect: (sessionId: string) => void;
  onNewChat: () => void;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return date.toLocaleDateString('en-US', { weekday: 'short' });
  } else {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}

export function SessionList({ sessions, currentSessionId, onSelect, onNewChat }: SessionListProps): React.ReactElement {
  const options = [
    { label: '+ New Chat', value: '__new__' },
    ...sessions.map(s => ({
      label: `${s.title} (${formatDate(s.updatedAt || s.createdAt)})`,
      value: s.id,
    })),
  ];

  const currentValue = currentSessionId || (sessions[0]?.id ?? '__new__');

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1} width={30}>
      <Box marginBottom={1}>
        <Text bold color="cyan">Chats</Text>
      </Box>
      
      {sessions.length === 0 ? (
        <Box flexDirection="column">
          <Text dimColor>No previous chats</Text>
          <Text dimColor color="green">Press Ctrl+N</Text>
        </Box>
      ) : (
        <Select
          options={options}
          defaultValue={currentValue}
          onChange={(value) => {
            if (value === '__new__') {
              onNewChat();
            } else {
              onSelect(value);
            }
          }}
        />
      )}
      
      <Box marginTop={1}>
        <Text dimColor>Ctrl+S: close</Text>
      </Box>
    </Box>
  );
}
