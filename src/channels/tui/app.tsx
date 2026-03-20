import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import {
  UserMessage,
  AssistantMessage,
  ToolCallMessage,
  ChatInput,
  SystemMessage,
  SessionList,
} from './components/index.js';
import type { Gateway } from '../../types/index.js';
import type { TUIChannel } from './index.js';
import type { StreamEvent, ToolCall, Message, AssistantMessage as AssistantMessageType, SessionListItem } from '../../types/index.js';

interface AppProps {
  gateway: Gateway;
  tuiChannel: TUIChannel;
}

interface ChatMessage {
  id: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  reasoning?: string;
  toolCalls?: ToolCall[];
}

interface StreamState {
  text: string;
  reasoning: string;
  toolCalls: ToolCall[];
}

function generateTitle(message: string): string {
  const firstLine = message.split('\n')[0]?.trim() || '';
  return firstLine.length > 40 ? firstLine.substring(0, 37) + '...' : firstLine;
}

function convertSessionToMessages(sessionMessages: Message[]): ChatMessage[] {
  const messages: ChatMessage[] = [];
  let id = 0;
  
  for (const msg of sessionMessages) {
    if (msg.role === 'user') {
      messages.push({
        id: id++,
        role: 'user',
        content: typeof msg.content === 'string' ? msg.content : '',
      });
    } else if (msg.role === 'assistant') {
      const assistantMsg = msg as AssistantMessageType;
      messages.push({
        id: id++,
        role: 'assistant',
        content: assistantMsg.content || '',
        reasoning: assistantMsg.reasoning,
        toolCalls: assistantMsg.toolCalls,
      });
    }
  }
  
  return messages;
}

function ChatMessageView({ message }: { message: ChatMessage }): React.ReactElement {
  if (message.role === 'user') {
    return <UserMessage content={message.content} />;
  }
  
  if (message.role === 'assistant') {
    return (
      <Box flexDirection="column" marginBottom={1}>
        {message.reasoning && message.reasoning.length > 0 && (
          <Box marginBottom={1} flexDirection="column">
            <Text color="gray" dimColor italic>{message.reasoning}</Text>
          </Box>
        )}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <Box flexDirection="column" marginBottom={1}>
            {message.toolCalls.map((tc, i) => (
              <ToolCallMessage 
                key={`${tc.name}-${i}`}
                name={tc.name} 
                input={tc.input} 
                output={tc.output} 
              />
            ))}
          </Box>
        )}
        {message.content && <AssistantMessage content={message.content} />}
      </Box>
    );
  }
  
  return <SystemMessage content={message.content} />;
}

function StreamingView({ stream }: { stream: StreamState }): React.ReactElement {
  return (
    <Box flexDirection="column" marginBottom={1}>
      {stream.reasoning && stream.reasoning.length > 0 && (
        <Box marginBottom={1} flexDirection="column">
          <Text color="gray" dimColor italic>{stream.reasoning}</Text>
        </Box>
      )}
      {stream.toolCalls && stream.toolCalls.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          {stream.toolCalls.map((tc, i) => (
            <ToolCallMessage 
              key={`stream-${tc.name}-${i}`}
              name={tc.name} 
              input={tc.input} 
              output={tc.output} 
            />
          ))}
        </Box>
      )}
      {stream.text ? (
        <AssistantMessage content={stream.text} />
      ) : !stream.reasoning && stream.toolCalls.length === 0 ? (
        <Box>
          <Text color="yellow">Thinking...</Text>
        </Box>
      ) : null}
    </Box>
  );
}

export function App({ gateway, tuiChannel }: AppProps): React.ReactElement {
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState<StreamState>({
    text: '',
    reasoning: '',
    toolCalls: [],
  });
  const [nextId, setNextId] = useState(0);
  const [showSidebar, setShowSidebar] = useState(false);
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const messageAddedRef = useRef(false);

  const { exit } = useApp();

  const loadSessions = useCallback(async () => {
    try {
      const sessionList = await gateway.listSessions('tui', 10);
      setSessions(sessionList);
      return sessionList;
    } catch (err) {
      console.error('Failed to load sessions:', err);
      return [];
    }
  }, [gateway]);

  const loadSessionMessages = useCallback(async (sessionId: string) => {
    try {
      const session = await gateway.loadSession(sessionId, 'tui');
      if (session && session.messages.length > 0) {
        const chatMessages = convertSessionToMessages(session.messages as Message[]);
        setMessages(chatMessages);
        setNextId(chatMessages.length);
      } else {
        setMessages([]);
        setNextId(0);
      }
    } catch (err) {
      console.error('Failed to load session:', err);
      setMessages([]);
      setNextId(0);
    }
  }, [gateway]);

  useEffect(() => {
    const init = async () => {
      const sessionList = await loadSessions();
      if (sessionList.length > 0 && sessionList[0]) {
        const lastSessionId = sessionList[0].id;
        setCurrentSessionId(lastSessionId);
        await loadSessionMessages(lastSessionId);
      } else {
        const newSessionId = gateway.createSessionId();
        setCurrentSessionId(newSessionId);
      }
      setIsInitialized(true);
    };
    init();
  }, [loadSessions, loadSessionMessages, gateway]);

  useEffect(() => {
    if (currentSessionId && isInitialized) {
      loadSessionMessages(currentSessionId);
    }
  }, [currentSessionId, isInitialized, loadSessionMessages]);

  useEffect(() => {
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
              toolCalls: [...s.toolCalls, { name: event.toolName ?? '', status: 'running' }],
            }));
          }
          break;

        case 'tool-result':
          if (event.toolName) {
            setStream(s => ({
              ...s,
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
            if (current.text || current.reasoning || current.toolCalls.length > 0) {
              messageAddedRef.current = true;
              setMessages(prev => [...prev, {
                id: nextId,
                role: 'assistant',
                content: current.text,
                reasoning: current.reasoning || undefined,
                toolCalls: current.toolCalls.length > 0 ? current.toolCalls : undefined,
              }]);
              setNextId(prev => prev + 1);
            }
            return { text: '', reasoning: '', toolCalls: [] };
          });
          setIsProcessing(false);
          loadSessions();
          break;
      }
    });

    tuiChannel.setResponseHandler((response: string) => {
      if (messageAddedRef.current) {
        messageAddedRef.current = false;
        return;
      }
      setMessages(prev => [...prev, {
        id: nextId,
        role: 'assistant',
        content: response,
      }]);
      setNextId(prev => prev + 1);
      setIsProcessing(false);
      loadSessions();
    });
  }, [tuiChannel, nextId, loadSessions]);

  useInput((inputChar, key) => {
    if (key.ctrl && inputChar === 'c') exit();
    if (key.ctrl && inputChar === 'l') {
      clearCurrentChat();
    }
    if (key.escape && showSidebar) {
      setShowSidebar(false);
    }
  });

  const createNewChat = useCallback(() => {
    const newSessionId = gateway.createSessionId();
    setCurrentSessionId(newSessionId);
    setMessages([]);
    setNextId(0);
    setShowSidebar(false);
  }, [gateway]);

  const switchSession = useCallback((sessionId: string) => {
    setCurrentSessionId(sessionId);
    setShowSidebar(false);
  }, []);

  const clearCurrentChat = useCallback(() => {
    if (currentSessionId) {
      gateway.clearSession(currentSessionId);
    }
    setMessages([]);
    setNextId(0);
  }, [gateway, currentSessionId]);

  const handleSubmit = useCallback(async (userText: string) => {
    if (isProcessing || !currentSessionId) return;

    setMessages(prev => [...prev, { id: nextId, role: 'user', content: userText }]);
    setNextId(prev => prev + 1);
    setIsProcessing(true);
    setError(null);
    setStream({ text: '', reasoning: '', toolCalls: [] });
    messageAddedRef.current = false;

    if (messages.length === 0) {
      const title = generateTitle(userText);
      await gateway.updateSessionTitle(currentSessionId, 'tui', title);
    }

    tuiChannel.sendMessage(userText, currentSessionId).catch((err) => {
      const errorMsg = (err as Error).message;
      setError(errorMsg);
      setIsProcessing(false);
      setMessages(prev => [...prev, { id: nextId, role: 'system', content: `Error: ${errorMsg}` }]);
      setNextId(prev => prev + 1);
    });
  }, [isProcessing, tuiChannel, nextId, messages.length, gateway, currentSessionId]);

  const currentModel = gateway.getCurrentModel() || 'no model';
  const workspaceName = gateway.getWorkspaceName();

  return (
    <Box flexDirection="column" minHeight={process.stdout.rows || 24}>
      <Box borderStyle="round" borderColor="cyan" paddingX={1} flexShrink={0}>
        <Text bold color="cyan">🐾 OpenPaw</Text>
        <Text dimColor> — {currentModel} | {workspaceName}</Text>
        {isProcessing && <Text color="yellow"> ⏳</Text>}
      </Box>

      <Box flexDirection="row" flexGrow={1}>
        {showSidebar && (
          <SessionList
            sessions={sessions}
            currentSessionId={currentSessionId || ''}
            onSelect={switchSession}
            onNewChat={createNewChat}
          />
        )}

        <Box flexDirection="column" flexGrow={1} paddingX={1} paddingY={1}>
          {messages.map((msg) => (
            <ChatMessageView key={msg.id} message={msg} />
          ))}

          {isProcessing && <StreamingView stream={stream} />}

          {error && <SystemMessage content={`Error: ${error}`} />}
        </Box>
      </Box>

      <Box flexShrink={0} width="100%">
        <ChatInput 
          onSubmit={handleSubmit} 
          isDisabled={isProcessing} 
          onToggleSidebar={() => setShowSidebar(prev => !prev)}
          onNewChat={createNewChat}
        />
      </Box>

      <Box paddingX={1} flexShrink={0}>
        <Text dimColor>Ctrl+C: quit | Ctrl+L: clear | Ctrl+S: sidebar | Ctrl+N: new chat</Text>
      </Box>
    </Box>
  );
}
