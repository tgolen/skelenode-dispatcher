'use strict';

/*
 Provides a central place to send and receive messages. It works across the entire cluster, and knows how to send a message from any
 arbitrary point in our codebase to another.

 Practically, Dispatcher is used as follows:
 - When a new client connects (like a Socket.IO socket): dispatcher.attach(socket).
 "socket.dispatcher.subscribe" and "socket.dispatcher.unsubscribe" are now available for use, such as:
 socket.dispatcher.subscribe('user_20ea5dc5dd8df57c52d14f512fc6c893', function() { ... }).
 - When a change is made to this user, we can:
 dispatcher.publish('user_20ea5dc5dd8df57c52d14f512fc6c893');
 - The matching client's callback is executed, and the client can download the updated user object, or take some other appropriate action.

 Do you notice how we don't send any data with the publish? This is because the Dispatcher is inherently security-less. Clients can subscribe
 to anything that they want. (Ideally, they only subscribe to stuff they can access. Only malicious users would try otherwise.) When a
 message is received, the client can then hit the appropriate API to get the updated data. This keeps the pub/sub very light, and means we
 don't have to duplicate all of our often complicated security logic in to the Dispatcher. It also keeps our Redis very lightly loaded.
 */
var redis = require('./lib/redis'),
	redisPublisher,
	DEBUG_DISPATCHER = true,
	bunyan = require('bunyan'),
	log = bunyan.createLogger({name: '[DISPATCHER]'}),
	redisPort,
	redisHost,
	redisPassword;

/*
 Public API.
 */
exports.start = start;
exports.attach = attach;
exports.attached = attached;
exports.publish = publish;
exports.detach = detach;

/*
 Implementation.
 */

/**
 * Starts up the dispatcher, connecting it with other dispatchers and preparing it to attach to different contexts.
 * @returns {*} The dispatcher, for fluent calls.
 */
function start(port, host, password, debug) {
	/*jshint validthis: true */
	DEBUG_DISPATCHER = debug;
	redisPort = port;
	redisHost = host;
	redisPassword = password;
	redisPublisher = redis.createClient(port, host, password);
	return this;
}

/**
 * Attaches the dispatcher to a particular context, adding the "dispatcher" namespace to it.
 * After being attached, you can "context.dispatcher.subscribe(event, callback)" or "context.dispatcher.unsubscribe(event, callback)".
 * @param context An object that wants to subscribe to events sent through the dispatcher.
 * @returns {*} The dispatcher, for fluent calls.
 */
function attach(context) {
	/*jshint validthis: true */
	if (!context) {
		return false;
	}
	if (attached(context)) {
		return;
	}
	if (DEBUG_DISPATCHER) log.info('ATTACHED');

	var client = redis.createClient(redisPort, redisHost, redisPassword);
	context.dispatcher = {
		_callbacks: {},
		_client: client,
		_context: context,
		subscribe: subscribe,
		unsubscribe: unsubscribe
	};
	client.dispatcher = {
		_callbacks: context.dispatcher._callbacks,
		_context: context.dispatcher._context
	};
	client.on('message', handleMessage);

	return this;
}

/**
 * Determines whether or not the dispatcher has been attached to the specified context.
 * @param context An object that wants to subscribe to events sent through the dispatcher.
 * @returns {boolean} Attached or not.
 */
function attached(context) {
	if (DEBUG_DISPATCHER) log.info('ATTACHED: ' + ((!!context.dispatcher) ? 'yes' : 'no'));
	if (!context) {
		return false;
	}
	return !!context.dispatcher;
}

/**
 * Subscribes to a particular event. Anytime this event is published to a dispatcher, on any node in the system, the callback will be
 * executed shortly thereafter.
 * @param event A string name for an event, such as "org_14301" to be notified whenever that org is updated.
 * @param callback A callback to be executed when the event is published.
 * @returns {*} The context, for fluent calls.
 */
function subscribe(event, callback) {
	/*jshint validthis: true */
	if (DEBUG_DISPATCHER) log.info('SUBSCRIBE: ' + event);
	if (!event || !callback) {
		return this;
	}
	if (this._callbacks[event]) {
		this._callbacks[event].push(callback);
	}
	else {
		this._callbacks[event] = [ callback ];
	}

	this._client.subscribe(event);

	return this;
}

/**
 * Publishes an event across the cluster. All dispatchers that are listening for this event will notify their attached contexts.
 * @param event A string name for an event, such as "org_14301" to be notified whenever that org is updated.
 * @returns {*} The dispatcher, for fluent calls.
 */
function publish(event) {
	/*jshint validthis: true */
	if (DEBUG_DISPATCHER) log.info('PUBLISH: ' + event);
	if (!event) {
		return;
	}
	redisPublisher.publish(event, '');
	return this;
}

/**
 * An internal method, called when a new message is received. It loops through all callbacks for the event, and executes them.
 * @param event The string name for an event that was passed to the "publish" call.
 * @param message A string payload sent with the publish.
 */
function handleMessage(event, message) {
	/*jshint validthis: true */
	if (DEBUG_DISPATCHER) log.info('MESSAGE: ' + event);
	if (!event) {
		return;
	}
	if (message && message !== '') {
		throw 'A message payload was sent across Redis. We intentionally do not support this to avoid security issues.';
	}

	var callbacks = this.dispatcher._callbacks[event];
	if (DEBUG_DISPATCHER) log.info('MESSAGE: CALLBACK LENGTH: ' + (callbacks && callbacks.length));
	for (var i = 0, iL = callbacks && callbacks.length; i < iL; i++) {
		callbacks[i].call(this.dispatcher._context, event);
	}
}

/**
 * Unsubscribes from a particular event.
 * @param event The string name passed to the "subscribe" call.
 * @param callback The callback passed to the "subscribe" call.
 * @returns {*} The context, for fluent calls.
 */
function unsubscribe(event, callback) {
	/*jshint validthis: true */
	if (DEBUG_DISPATCHER) log.info('UNSUBSCRIBE: ' + event);
	if (!event || !callback) {
		return;
	}
	var callbacks = this._callbacks[event];
	if (callbacks) {
		for (var i = callbacks.length - 1; i >= 0; i--) {
			if (callbacks[i] === callback) {
				callbacks.splice(i, 1);
			}
		}
	}

	if (!callbacks || callbacks.length === 0) {
		this._client.unsubscribe(event);
	}

	return this;
}

/**
 * Detaches the dispatcher from a particular context, remove the "dispatcher" namespace from it and stopping all subscriptions.
 * @param context The object passed to the "attach" call.
 * @returns {*} The dispatcher, for fluent calls.
 */
function detach(context) {
	/*jshint validthis: true */
	if (DEBUG_DISPATCHER) log.info('DETACHED.');
	if (!context) {
		return;
	}
	if (!attached(context)) {
		return;
	}

	context.dispatcher._client.quit();
	context.dispatcher._client.dispatcher = null;
	context.dispatcher = null;

	return this;
}