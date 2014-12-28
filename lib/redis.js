'use strict';

/*
 Dependencies.
 */
var redis = require('redis'),
	config = require('config'),
	bunyan = require('bunyan'),
	log = bunyan.createLogger({name: '[REDIS]'});

/*
 Public API.
 */
exports.redis = redis;
exports.createClient = createClient;

/*
 Implementation.
 */
function createClient(port, host, password) {
	var client = redis.createClient(port, host, {
		connect_timeout: false, // Never stop trying to connect to Redis...
		max_attempts: null, // ... no matter how many times it slaps us in the face.
		retry_max_delay: 5000, // Decay attempts to reconnect to a max of 5 seconds.
		enable_offline_queue: true // Queue up requests while we wait for a connection to re-establish.
	});

	client.on('error', function(err) {
		// Log the error, but don't quit. Our offline queue will keep us going until Redis comes back.
		log.error(err);
	});

	if (client && password) {
		client.auth(password);
	}

	return client;
}