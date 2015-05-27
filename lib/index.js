
var MongoOplog = require('mongo-oplog'),
	Emitter = require('events').EventEmitter;

var events = {
	n: 'noop',
	i: 'insert',
	u: 'update',
	d: 'delete'
};

module.exports = MongoStream;

function applyDefaults (options) {
	options = options?options:{};
	if (!options.host) 				{ options.host = 'localhost'; };
	if (!options.port) 				{ options.port = 27017; }
	if (!options.authdb) 			{ options.authdb = 'admin'; };
	if (!options.dbOpts) 			{ options.dbOpts = {w:1}; };
	if (!options.format) 			{ options.format = 'raw'; };
	if (!options.useMasterOplog) 	{ options.useMasterOplog = false; };
	if (!options.convertObjectIDs) 	{ options.convertObjectIDs = true; };
	if (!options.onError)		 	{ options.onError = function (error) { console.log('Error - MongoStream:'); console.log(error); }; };

	return options;
}

function MongoStream (options) {
	this.status = 'connecting';
	this.watching = {};
	this.options = applyDefaults(options);
	this.oplog = connect(this);

	var self = this;

	this.events = new Emitter();
	this.events.on('error', self.options.onError);
	this.events.on('connected', function () { self.status = 'connected'; });

	this.watch = function (collection, notify) {
		if (!self.oplog) {
			setTimeout(function() {
				self.watch(collection, notify);
			},10000);
			return;
		}
		if (!collection) { collection = 'all'; };
		if (!notify) { notify = console.log };

		if (!self.watching[collection]) {
			self.watching[collection] = self.oplog.filter()
				.ns((collection=='all'?'*':collection))
				.on('op', function (data) {  
					//console.log(data);
					if (self.options.format == 'pretty' && events[data.op]) {
						data.op = events[data.op];
					}
					//self.events.emit(collection, data);
					notify(data);
				});
			self.oplog.tail();
		} else {
			self.watching[collection].on('op', function (data) {  
				//self.events.emit(collection, data);
				notify(data);
			});
		}
	}

	this.stop = function (collection) {
		if (!collection) { collection = 'all'; };

		if (!self.watching[collection]) {
			console.log("Oplog already stopped");
		} else {
			self.watching[collection].stop();
			delete self.watching[collection];
		}
	}

	this.stopAll = function () {
		for (var collection in self.watching) {
			self.stop(collection);
		}
	}

	return this;
}

function connect(obj) {
	var connectionString = "mongodb://";
	var connectionStringOptions = "?";

	// Authentication
	if (obj.options.username && obj.options.password) {
		connectionString += obj.options.username;
		connectionString += ":";
		connectionString += obj.options.password;
		connectionString += "@";
		connectionStringOptions += "authSource="+obj.options.authdb;
	}

	// Kind of Connections
	if (obj.options.replicaSet) {
		var servers = [];
		for (var i = 0; i < obj.options.replicaSet.length; i++) {
			servers.push(obj.options.replicaSet[i].host+":"+(obj.options.replicaSet[i].port?obj.options.replicaSet[i].port:27017));
		};
		connectionString += servers.join(",");
	} else {
		connectionString += obj.options.host+":"+(obj.options.port?obj.options.port:27017);
	}

	return MongoOplog(connectionString+"/local"+connectionStringOptions);
}