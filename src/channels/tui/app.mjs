import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import TextInput from 'ink-text-input';

export function App({ runtime, tuiChannel }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const { exit } = useApp();

  const addMessage = useCallback((role, content) => {
    setMessages(prev => [...prev, { role, content, timestamp: new Date().toISOString() }]);
  }, []);

  // Set up response handler from the channel
  useEffect(() => {
    tuiChannel.setResponseHandler((response) => {
      addMessage('assistant', response);
      setIsProcessing(false);
    });
  }, [tuiChannel, addMessage]);

  // Handle keyboard input
  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      exit();
    }
    if (key.ctrl && input === 'l') {
      setMessages([]);
    }
  });

  const handleSubmit = useCallback(async () => {
    if (!input.trim() || isProcessing) return;

    const userText = input.trim();
    setInput('');
    addMessage('user', userText);
    setIsProcessing(true);
    setError(null);

    try {
      await tuiChannel.sendMessage(userText);
    } catch (err) {
      setError(err.message);
      setIsProcessing(false);
      addMessage('system', `Error: ${err.message}`);
    }
  }, [input, isProcessing, tuiChannel, addMessage]);

  return React.createElement(Box, { flexDirection: 'column', height: '100%' },
    // Header
    React.createElement(Box, { borderStyle: 'round', borderColor: 'cyan', paddingX: 1 },
      React.createElement(Text, { bold: true, color: 'cyan' }, '🐾 OpenPaw TUI'),
      React.createElement(Text, { dimColor: true }, ' — '),
      React.createElement(Text, { dimColor: true },
        (runtime.getCurrentModel() || 'no model') + ' | ' + runtime.getWorkspaceName()
      ),
      isProcessing && React.createElement(Text, { color: 'yellow' }, ' ⏳')
    ),

    // Messages
    React.createElement(Box, { flexDirection: 'column', flexGrow: 1, paddingX: 1, paddingBottom: 1 },
      messages.map((msg, i) =>
        React.createElement(Box, { key: i, flexDirection: 'column', marginBottom: 1 },
          React.createElement(Box, null,
            React.createElement(Text, {
              bold: true,
              color: msg.role === 'user' ? 'blue' : msg.role === 'assistant' ? 'green' : 'yellow'
            },
              (msg.role === 'user' ? 'You' : msg.role === 'assistant' ? 'Psi' : 'System') + ':'
            )
          ),
          React.createElement(Box, { paddingLeft: 2 },
            React.createElement(Text, null, msg.content)
          )
        )
      ),
      isProcessing && React.createElement(Box, { key: 'processing' },
        React.createElement(Text, { color: 'yellow' }, 'Psi is thinking...')
      ),
      error && React.createElement(Box, { key: 'error' },
        React.createElement(Text, { color: 'red' }, 'Error: ' + error)
      )
    ),

    // Input
    React.createElement(Box, { borderStyle: 'round', borderColor: 'gray', paddingX: 1 },
      React.createElement(Text, { color: 'blue' }, '> '),
      React.createElement(TextInput, {
        value: input,
        onChange: setInput,
        onSubmit: handleSubmit,
        placeholder: 'Type a message...'
      })
    ),

    // Status bar
    React.createElement(Box, { paddingX: 1 },
      React.createElement(Text, { dimColor: true }, 'Ctrl+C: quit | Ctrl+L: clear | Enter: send')
    )
  );
}
