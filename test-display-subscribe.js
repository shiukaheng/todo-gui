#!/usr/bin/env node

/**
 * Test file for subscribeToDisplay method
 * Subscribes to display layer and fetches full todo-app view contents
 */

// Polyfill EventSource for Node.js
import { EventSource } from 'eventsource';
if (!globalThis.EventSource) {
    globalThis.EventSource = EventSource;
}

import { subscribeToDisplay, DefaultApi, Configuration } from 'todo-client';

// Configuration - adjust baseUrl as needed
const baseUrl = process.env.BASE_URL || 'http://100.83.86.3/todo';
let resultReceived = false;

console.log(`Connecting to display layer at ${baseUrl}...`);

// Subscribe to display updates
const unsubscribe = subscribeToDisplay(
    async (data) => {
        if (!resultReceived) {
            resultReceived = true;
            console.log('\n✓ First message received from subscribeToDisplay:');

            // Parse and display all view content
            const views = data.views || {};
            const viewIds = Object.keys(views);

            console.log('\n=== All Views ===');
            console.log(JSON.stringify({
                viewCount: viewIds.length,
                viewIds: viewIds
            }, null, 2));

            // Fetch full todo-app view details using REST API
            try {
                const api = new DefaultApi(new Configuration({ basePath: baseUrl }));
                const fullTodoAppView = await api.getViewApiViewsViewIdGet({ viewId: 'todo-app' });

                console.log('\n=== Full todo-app View Contents (from REST API) ===');
                console.log(JSON.stringify(fullTodoAppView, null, 2));
            } catch (error) {
                console.error('❌ Error fetching todo-app view:', error.message);
            }

            // Unsubscribe and exit
            unsubscribe();
            process.exit(0);
        }
    },
    {
        baseUrl,
        onError: (err) => {
            console.error('❌ Error subscribing to display:', err);
            process.exit(1);
        },
    }
);

// Timeout safety - exit if no data after 10 seconds
setTimeout(() => {
    if (!resultReceived) {
        console.error('❌ Timeout: No data received after 10 seconds');
        unsubscribe();
        process.exit(1);
    }
}, 10000);
