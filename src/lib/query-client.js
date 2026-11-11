import { QueryClient } from '@tanstack/react-query';


export const queryClientInstance = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: false,
			retry: 1,
			// Data fetched in the last 30 seconds is reused, so moving between pages does not ask the server again.
			// Saving something, or a live update from the server, still refreshes it straight away.
			staleTime: 30 * 1000,
		},
	},
});