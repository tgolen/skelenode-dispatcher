# Skelenode Dispatcher
This is a Skelenode component to manage publish/subscribe events across all parts of your application. When used in conjunction with Skelenode API, you can also listen for events from the front-end of your application. Because of it's use with redis it can communicate across all nodes in a cluster with no issues.

The dispatched events do not contain any data. This means that we can keep it lean and not have to worry about
permissions or access rights. When a callback is fired, it's the responsability of the listener to respond to the event appropriately.

For example, your front-end has a list of restaurants. It can listen to an event like 'change:restaurant' and when there is a change to the list of restaurants, the server will emit the event 'change:restaurant'. The client will then fire off a request to the server to fetch a new list of restaurants.

# Requirements
* You must have a redis server that you can connect to

# Installation
```
npm install skelenode-dispatcher
```

# Usage
```javascript
var dispatcher = require('skelenode-dispatcher');

// start the dispatcher which connects to redis
dispatcher.start(redisPort, redisHost, redisPassword, debug);
```

## Methods

### start(port, host, password, debug)
Connects to redis on the given `port`, `host`, and optional `password`. The `debug` argument is a boolean which will output logs to the server to help troubleshoot what's happening.

### attach(context)
Attaches the dispatcher to a particular `context`, adding the "dispatcher" namespace to it.

After being attached, you can `context.dispatcher.subscribe(event, callback)` or `context.dispatcher.unsubscribe(event, callback)`.

### attached(context)
Determines whether or not the dispatcher has been attached to the specified `context`.

### detach(context)
Detaches the dispatcher from a particular `context`, remove the "dispatcher" namespace from it and stopping all subscriptions.

### subscribe(event, callback)
Subscribes a `callback` to a particular `event`. Anytime this event is published to a dispatcher, on any node in the system, the callback will be executed.

### unsubscribe(event, callback)
Unsubscribes a `callback` from a particular `event`.

### publish(event)
Publishes an event across the cluster. All dispatchers that are listening for this event will notify their attached contexts.

# Contributing
Open a pull request with plenty of well-written instructions on what you are submitting and why you are submitting it
