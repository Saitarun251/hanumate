/**
 * Type declarations for the 'ws' WebSocket library
 */

declare module 'ws' {
	import type { IncomingMessage } from 'http';
	import type { Duplex, DuplexOptions } from 'stream';

	export type WebSocketType = 'server' | 'client';

	export type OpCode = 0x0 | 0x1 | 0x2 | 0x8 | 0x9 | 0xA;

	export type CloseCode =
		| 1000
		| 1001
		| 1002
		| 1003
		| 1004
		| 1005
		| 1006
		| 1007
		| 1008
		| 1009
		| 1010
		| 1011
		| 1015;

	export interface WebSocketPingData {
		[F: symbol]: unknown;
	}

	export type WebSocketData = string | Buffer | ArrayBuffer | Buffer[];

	export interface WebSocketEventMap {
		close: CloseEvent;
		error: Error;
		message: MessageEvent;
		open: OpenEvent;
	}

	export interface WebSocket extends Duplex {
		readonly bufferedAmount: number;
		readonly extensions: string;
		readonly protocol: string;
		readonly readyState: number;
		readonly url: string;
		BinaryType: string;
		CloseEvent: typeof CloseEvent;
		OPEN: 1;
		CLOSED: 3;
		CLOSING: 2;
		CONNECTING: 0;
		onclose: ((event: WebSocketEventMap['close']) => void) | null;
		onerror: ((event: WebSocketEventMap['error']) => void) | null;
		onmessage: ((event: WebSocketEventMap['message']) => void) | null;
		onopen: ((event: WebSocketEventMap['open']) => void) | null;
		addEventListener<K extends keyof WebSocketEventMap>(
			type: K,
			listener: (event: WebSocketEventMap[K]) => void,
			options?: AddEventListenerOptions
		): void;
		addEventListener(
			type: string,
			listener: (event: Event) => void,
			options?: AddEventListenerOptions
		): void;
		removeEventListener<K extends keyof WebSocketEventMap>(
			type: K,
			listener: (event: WebSocketEventMap[K]) => void,
			options?: EventListenerOptions
		): void;
		removeEventListener(
			type: string,
			listener: (event: Event) => void,
			options?: EventListenerOptions
		): void;
		dispatchEvent(event: Event): boolean;
		close(code?: number, reason?: string | Buffer): void;
		terminate(): void;
		ping(data?: unknown, mask?: boolean, failSilently?: boolean): void;
		pong(data?: unknown, mask?: boolean, failSilently?: boolean): void;
		send(data: unknown, options?: WebSocketSendOptions): void;
		// Additional methods from WebSocketServer
		on(
			event: 'connection',
			listener: (socket: WebSocket, request: IncomingMessage) => void
		): this;
		on(event: 'error', listener: (error: Error) => void): this;
		on(event: 'listening', listener: () => void): this;
		on(event: 'close', listener: () => void): this;
		on(event: 'message', listener: (data: Buffer | string) => void): this;
		on(event: 'open', listener: () => void): this;
		once(
			event: 'connection',
			listener: (socket: WebSocket, request: IncomingMessage) => void
		): this;
		once(event: 'error', listener: (error: Error) => void): this;
		once(event: 'listening', listener: () => void): this;
		once(event: 'close', listener: () => void): this;
		off<K extends keyof WebSocketEventMap>(type: K, listener: (event: WebSocketEventMap[K]) => void): this;
	}

	export interface WebSocketSendOptions {
		binary?: boolean;
		compress?: boolean;
		fin?: boolean;
		mask?: boolean;
	}

	export interface WebSocketServerOptions {
		backlog?: number;
		clientTracking?: boolean;
		handleProtocols?: (
			protocols: Set<string>,
			request: IncomingMessage
		) => string | false;
		maxPayload?: number;
		noServer?: boolean;
		server?: import('http').Server | import('https').Server;
		skipUTF8Validation?: boolean;
		WebSocket?: typeof WebSocket;
		host?: string;
		port?: number;
		path?: string;
	}

	export interface PerMessageDeflateOptions {
		compressEachMessage?: (data: Buffer) => Promise<Buffer>;
		decompressEachMessage?: (data: Buffer, isLast: boolean) => Promise<Buffer>;
		params?: {
			[key: string]: unknown;
			_memChunks?: Buffer[];
			_memDeflate?: {
				readonly length: number;
				readonly value: Buffer;
				[key: string]: unknown;
			};
			_memInflate?: {
				readonly length: number;
				readonly value: Buffer;
				[key: string]: unknown;
			};
			_params?: {
				clientMaxWindowBits?: number | null;
				clientNoContextTakeover?: boolean;
				serverMaxWindowBits?: number | null;
				serverNoContextTakeover?: boolean;
			};
		};
	}

	export class WebSocketServer<T extends WebSocket = WebSocket> extends (await import('events')).EventEmitter {
		readonly options: WebSocketServerOptions & {
			maxPayload: number;
			skipUTF8Validation: boolean;
		};
		readonly clients: Set<T>;
		readonly shouldHandle: (request: IncomingMessage) => boolean;

		constructor(options?: WebSocketServerOptions, callback?: () => void);
		address(): { port: number; family: string; address: string } | null;
		close(callback?: (error?: Error) => void): this;
		handleUpgrade(
			request: IncomingMessage,
			socket: import('net').Socket,
			head: Buffer,
			callback: (socket: T, request: IncomingMessage) => void
		): void;
		on(
			event: 'connection',
			listener: (socket: T, request: IncomingMessage) => void
		): this;
		on(event: 'error', listener: (error: Error) => void): this;
		on(event: 'headers', listener: (headers: string[], request: IncomingMessage) => void): this;
		on(event: 'listening', listener: () => void): this;
		on(event: 'close', listener: () => void): this;
		once(
			event: 'connection',
			listener: (socket: T, request: IncomingMessage) => void
		): this;
		once(event: 'error', listener: (error: Error) => void): this;
		once(event: 'headers', listener: (headers: string[], request: IncomingMessage) => void): this;
		once(event: 'listening', listener: () => void): this;
		once(event: 'close', listener: () => void): this;
		off<K extends keyof WebSocketEventMap>(type: K, listener: (event: WebSocketEventMap[K]) => void): this;
	}

	export const WebSocket: {
		prototype: WebSocket;
		new (address?: string | URL, options?: WebSocketConstructorOptions): WebSocket;
		CONNECTING: 0;
		OPEN: 1;
		CLOSING: 2;
		CLOSED: 3;
	};

	export const WebSocketServer: typeof import('ws').WebSocketServer;

	export default WebSocket;
}