import React, { useState } from 'react';
import {Box, Text, useInput} from 'ink';
import os from 'os';
type Props = {
	name: string | undefined;
};

// Get default user name from home directory
const userName = os.homedir().split('/').pop();

// Capitalize the first letter of the user name
const capitalizedUserName = userName ? userName.charAt(0).toUpperCase() + userName.slice(1) : 'Stranger';

export default function App({name = capitalizedUserName}: Props) {
	const [counter, setCounter] = useState(0);

	useInput((input, key) => {
		if (key.ctrl && input === 'c') {
			process.exit(0);
		} else if (input === 'k') {
			setCounter(counter + 1);
		} else if (input === 'j') {
			setCounter(counter - 1);
		}
	});
	return (
		<Box borderStyle="round" flexDirection="column" paddingLeft={1}>
			<Text>
				<Text>Hello</Text> <Text color="green">{name}</Text>
			</Text>
			<Text>Welcome to Openpaw! Here's a fun counter: <Text color="green">{counter}</Text>.</Text>
		</Box>
	);
}
