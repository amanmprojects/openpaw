import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import TextInput from 'ink-text-input';
import type { Gateway } from '../../types/index.js';
import type { TUIChannel } from './index.js';
import type { StreamEvent, ToolCall } from '../../types/index.js';

interface AppProps {
  gateway: Gateway;
  tuiChannel: TUIChannel;
}

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  reasoning?: string;
  toolCalls?: ToolCall[];
}

interface StreamState {
  text: string;
  reasoning: string;
  toolName: string | null;
  toolCalls: ToolCall[];
}

export function App({ gateway, tuiChannel }: AppProps): React.ReactElement {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState<StreamState>({
    text: '',
    reasoning: '',
    toolName: null,
    toolCalls: [],
  });

  const { exit } = useApp();

  const addMessage = useCallback((role: 'user' | 'assistant' | 'system', content: string, extra?: Partial<Message>) => {
    setMessages(prev => [...prev, {
      role,
      content,
      timestamp: new Date().toISOString(),
      ...extra,
    }]);
  }, []);

  useEffect(() => {
    // Primary: handle stream events for real-time updates
    tuiChannel.setStreamEventHandler((event: StreamEvent) => {
      switch (event.type) {
        case 'text-delta':
          if (event.full !== undefined) {
            setStream(s => ({ ...s, text: event.full ?? '' }));
          }
          break;

        case 'reasoning-delta':
          if (event.full !== undefined) {
            setStream(s => ({ ...s, reasoning: event.full ?? '' }));
          }
          break;

        case 'tool-start':
          if (event.toolName) {
            setStream(s => ({
              ...s,
              toolName: event.toolName ?? null,
              toolCalls: [...s.toolCalls, { name: event.toolName ?? '', status: 'running' }],
            }));
          }
          break;

        case 'tool-call':
          if (event.toolName) {
            setStream(s => ({
              ...s,
              toolCalls: s.toolCalls.map(t =>
                t.name === event.toolName && t.status === 'running'
                  ? { ...t, input: event.input }
                  : t
              ),
            }));
          }
          break;

        case 'tool-result':
          if (event.toolName) {
            setStream(s => ({
              ...s,
              toolName: null,
              toolCalls: s.toolCalls.map(t =>
                t.name === event.toolName && t.status === 'running'
                  ? { ...t, status: 'done' as const, output: event.output }
                  : t
              ),
            }));
          }
          break;

        case 'finish':
          setStream(current => {
            if (current.text) {
              setMessages(prev => [...prev, {
                role: 'assistant',
                content: current.text,
                timestamp: new Date().toISOString(),
                reasoning: current.reasoning || undefined,
                toolCalls: current.toolCalls.length > 0 ? current.toolCalls : undefined,
              }]);
            }
            return { text: '', reasoning: '', toolName: null, toolCalls: [] };
          });
          setIsProcessing(false);
          break;
      }
    });

    // Backup: handle non-streaming responses (fallback)
    tuiChannel.setResponseHandler((response: string) => {
      // Only handle if not already handled by streaming
      setStream(current => {
        if (!current.text) {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: response,
            timestamp: new Date().toISOString(),
          }]);
          setIsProcessing(false);
        }
        return current;
      });
    });
  }, [tuiChannel]);

  useInput((inputChar, key) => {
    if (key.ctrl && inputChar === 'c') exit();
    if (key.ctrl && inputChar === 'l') setMessages([]);
  });

  const handleSubmit = useCallback(() => {
    if (!input.trim() || isProcessing) return;

    const userText = input.trim();
    setInput('');
    addMessage('user', userText);
    setIsProcessing(true);
    setError(null);
    setStream({ text: '', reasoning: '', toolName: null, toolCalls: [] });

    tuiChannel.sendMessage(userText).catch((err) => {
      const error = err as Error;
      setError(error.message);
      setIsProcessing(false);
      addMessage('system', `Error: ${error.message}`);
    });
  }, [input, isProcessing, tuiChannel, addMessage]);

  const hasStreamContent = stream.text || stream.reasoning || stream.toolName || stream.toolCalls.length > 0;

  const currentModel = gateway.getCurrentModel() || 'no model';
  const workspaceName = gateway.getWorkspaceName();

  return (
    <Box flexDirection="column" height="100%">
      <Box borderStyle="round" borderColor="cyan" paddingX={1}>
        <Text bold color="cyan">🐾 OpenPaw TUI</Text>
        <Text dimColor> — </Text>
        <Text dimColor>{currentModel} | {workspaceName}</Text>
        {isProcessing && <Text color="yellow"> ⏳</Text>}
      </Box>

      <Box flexDirection="column" flexGrow={1} paddingX={1} paddingBottom={1}>
        {messages.map((msg, i) => (
          <Box key={i} flexDirection="column" marginBottom={1}>
            {msg.reasoning && (
              <Box paddingLeft={2}>
                <Text dimColor italic>🧠 {truncate(msg.reasoning, 200)}</Text>
              </Box>
            )}
            {msg.toolCalls && msg.toolCalls.length > 0 && (
              <Box paddingLeft={2}>
                <Text dimColor>🔧 {msg.toolCalls.map(t => t.name).join(', ')}</Text>
              </Box>
            )}
            <Box>
              <Text bold color={msg.role === 'user' ? 'blue' : msg.role === 'assistant' ? 'green' : 'yellow'}>
                {(msg.role === 'user' ? 'You' : msg.role === 'assistant' ? 'Psi' : 'System')}: 
              </Text>
              <Text> {msg.content}</Text>
            </Box>
          </Box>
        ))}

        {isProcessing && hasStreamContent && (
          <Box key="streaming" flexDirection="column" marginTop={1} borderStyle="single" borderColor="gray" paddingX={1} paddingTop={0} paddingBottom={0}>
            {stream.reasoning && (
              <Box>
                <Text dimColor italic>🧠 {truncate(stream.reasoning, 300)}</Text>
              </Box>
            )}
            {stream.toolName && (
              <Box>
                <Text color="yellow">⟳ {stream.toolName}...</Text>
              </Box>
            )}
            {stream.toolCalls.filter(t => t.status === 'done').map((tc, i) => (
              <Box key={`tc-${i}`}>
                <Text dimColor>✓ {tc.name}</Text>
              </Box>
            ))}
            {stream.text && (
              <Box flexDirection="column">
                <Text bold color="green">Psi:</Text>
                <Text>{stream.text}</Text>
              </Box>
            )}
            {!stream.text && !stream.reasoning && !stream.toolName && (
              <Box>
                <Text color="yellow">Thinking...</Text>
              </Box>
            )}
          </Box>
        )}

        {isProcessing && !hasStreamContent && (
          <Box key="waiting" paddingLeft={2} marginTop={1}>
            <Text color="yellow">Thinking...</Text>
          </Box>
        )}

        {error && (
          <Box key="error" marginTop={1}>
            <Text color="red">Error: {error}</Text>
          </Box>
        )}
      </Box>

      <Box borderStyle="round" borderColor="gray" paddingX={1}>
        <Text color="blue">&gt; </Text>
        <TextInput
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          placeholder="Type a message..."
        />
      </Box>

      <Box paddingX={1}>
        <Text dimColor>Ctrl+C: quit | Ctrl+L: clear | Enter: send</Text>
      </Box>
    </Box>
  );
}

function truncate(str: string | undefined, maxLen: number): string {
  if (!str) return '';
  return str.length > maxLen ? str.substring(0, maxLen) + '...' : str;
}
