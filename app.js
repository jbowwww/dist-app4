
"use strict";
const log = require('@jbowwww/log').disable('debug');
const console = require('./stdio.js').Get('app', { minLevel: 'verbose' });	// log verbose log
const inspect = require('./utility.js').makeInspect({ depth: 3, /*breakLength: 0,*/ compact: false });
const { promisifyMethods } = require('./utility.js');
const fs = promisifyMethods(require('fs'));
const _ = require('lodash');
const mongoose = require('mongoose');
// const Task = require('./Task.js');
const v8 = require('v8');
const formatSizes = require('./format-sizes.js');

// fs.truncate('errors.txt', 0);

var app = {

	// _namespace: createNamespace('myapp.mynamespace'),

	db: {},	// { connection: undefined, url: undefined },
	async dbConnect(url = 'mongodb://localhost:27017/ArtefactsJS') {
		log.verbose(`dbConnect: Opening db '${url}'...`);
		try {
			let connection = await mongoose.connect(url, { useNewUrlParser: true });
			log.verbose(`dbConnect: opened db '${url}'`);
			app.db = { connection, url };
			return connection;
		} catch (err) {
			app.onError(`dbConnect: Error opening db '${url}': ${err.stack||err}`);
		}
	},
	async dbClose() {
		log.verbose(`dbClose: Closing db '${app.db.url}' ...`);
		try {
			await mongoose.connection.close();
			log.verbose(`dbClose: db closed '${app.db.url}'`);
			app.db = {};
		} catch (err) {
			app.onError(`dbClose: Error closing db '${app.db.url}': ${err.stack||err}`);
		}
	},
	
	// Trying to conceive a neat way to track executing tasks(i.e. promises)
	// would like an easy way to name them without having to verbosely specify them in an object or array or such
	// perhaps model/document/? methods could be wrapped so that the promises they return automatically getAllResponseHeaders
	// properties set on them describing the method name, etc, 
	
	/*
	Task,
	tasks: {},

	_tasks: {
		running: [],
		finished: [],
		get all() { return _.concat(this.running, this.finished); }
	},
	// _taskCount: 0,

	 run(... function funcs) 
	 execute an async task registered with the app
	async run(...funcs) {
		if (!_.isArray(args) || args.length < 1 || !_.every(args, arg => _.isFunction(arg))) {
			throw new TypeError(`run(... function functions): has incorrect args: ${inspect(args)}`);
		}
		await Promise.all(_.map(funcs, fn => (fn instanceof Task ? fn : new Task(fn)).run()));
		
		log(`Starting task '${task.name}'`);
		task.status = 'running';
		task.promise = this._namespace.run(fn);//() => fn(task));
		task.r = await task.promise;
		this._tasks.running.splice(this._tasks.running.indexOf(task), 1);
		task.status = 'finished';
		task.endTime = Date.now();
		this._tasks.finished.push(task);
		log(`Finished task '${task.name}' in ${task.duration} ms: r=${inspect(task.r)} app._tasks=${inspect(app._tasks)}`);
	
	}
	*/

	logStats() {
		log( `mongoose.models count=${_.keys(mongoose.models).length} names=${mongoose.modelNames().join(', ')}\n` + 
			`models[]._stats: ${inspect(_.mapValues(mongoose.models, (model, modelName) => (model._stats)))}\n` +
			`heap stats: ${inspect(formatSizes(v8.getHeapStatistics()))}\n` + 
			`mem usage: ${inspect(formatSizes(process.memoryUsage()))}\n` +
			`cpu usage: ${inspect(/*formatSizes*/(_.mapValues(process.cpuUsage(), v => v / 1000000)))}\n` +
			`uptime: ${process.uptime()}\n`);
			// `Task.current: ${inspect(Task.current)}`);
			// `Tasks.all (${Task.all.length}): ${inspect(Task.all, { depth: 3, compact: false } )} Tasks.uniqueContexts (${Task.uniqueContexts.length})=${inspect(Task.uniqueContexts, { depth: 3, compact: false })}`);
		app.logErrors();
	},
	logErrors() {
		if (app.errors && app.errors.length > 0 && app._errorLastWritten < app.errors.length) {
			fs.appendFileSync('errors.txt', app.errors.map(e => (e.stack||e)+'\n\n'));
			log.error(`Errors: ${inspect(app.errors, { depth: 3, compact: false })}`);
			app._errorLastWritten = app.errors.length;
		}
		if (app.warnings && app.warnings.length > 0 && app._warningLastWritten < app.warnings.length) {
			fs.appendFileSync('warnings.txt', app.warnings.map(e => (e.stack||e)+'\n\n'));
			log.warn(`Warnings: ${inspect(app.warnings, { depth: 3, compact: false })}`);
			app._warningLastWritten = app.warnings.length;
		}
	},
	
	warnings: [],
	_warningLastWritten: 0,
	onWarning(err, msg = '', rethrow) {
		if (_.isString(err) && arguments.length <= 2) {
			if (msg !== undefined && !(msg instanceof Boolean))
			err = new Error(err);
			rethrow = true;
			msg = '';
		} else if (!(err instanceof Error)) {
			throw new Error(`onWarning: err should be instanceof Error: msg='${msg}' rethrow=${rethrow}`);
		} else if (msg instanceof Boolean) {
			rethrow = msg;
			msg = '';
		} else if (!_.isString(msg)) {
			throw new Error(`onWarning: msg(optional) should be String and rethrow(optional) should be Boolean: err=${err.stack||err} msg=${msg} rethrow=${rethrow}`);
		} else if (rethrow !== undefined && (!rethrow instanceof Boolean)) {
			throw new Error(`onWarning: msg(optional) should be String and rethrow(optional) should be Boolean: err=${err.stack||err} msg=${msg} rethrow=${rethrow}`);
		} else if (rethrow === undefined) {
			rethrow = false;
		}
		app.warnings.push(err);
		log.warn(`warn: ${msg?msg+' ':''}error: ${err.stack||err}`);
		if (rethrow) {
			throw err;
		}
	},

	errors: [],
	_errorLastWritten: 0,
	onError(err, msg = '', rethrow) {
		if (_.isString(err) && arguments.length <= 2) {
			if (msg !== undefined && !(msg instanceof Boolean))
			err = new Error(err);
			rethrow = true;
			msg = '';
		} else if (!(err instanceof Error)) {
			throw new Error(`onError: err should be instanceof Error: err=${err} msg='${msg}' rethrow=${rethrow}`);
		} else if (msg instanceof Boolean) {
			rethrow = msg;
			msg = '';
		} else if (!_.isString(msg)) {
			throw new Error(`onError: msg(optional) should be String and rethrow(optional) should be Boolean: err=${err.stack||err} msg=${msg} rethrow=${rethrow}`);
		} else if (rethrow !== undefined && (!rethrow instanceof Boolean)) {
			throw new Error(`onError: msg(optional) should be String and rethrow(optional) should be Boolean: err=${err.stack||err} msg=${msg} rethrow=${rethrow}`);
		} else if (rethrow === undefined) {
			rethrow = true;
		}
		app.errors.push(err);
		log.warn(`warn: ${msg?msg+' ':''}error: ${err.stack||err}`);
		if (rethrow) {
			throw err;
		}
	},
	onUncaughtException(err, msg = '') {
		app.onError(err, msg);
		app.quit(1, 'Exiting due to uncaught exception');
	},
	
	onSigInt() {
		app.logStats();
		log,log('Press ctrl-c again to quit ...');
		process.once('SIGINT', quitHandler);
		setTimeout(() => {
			process.off('SIGINT', quitHandler);
			process.once('SIGINT', app.onSigInt);
		}, 1000);
		function quitHandler() {
			app.quit(1, 'Exiting due to SIGINT');
		}
	},
	async onBeforeExit() {
		await app.quit();
	},
	async quit(exitCode = 0, exitMsg = 'Exiting') {
		if (typeof exitCode === 'string') {
			exitMsg = exitCode;
			exitCode = 0;
		}
		exitMsg += `  (exitCode=${exitCode}) ...`;
		app.logStats();
		await app.dbClose();
		log.info(exitMsg);
		process.nextTick(() => process.exit(exitCode));
	}

};

app = _.bindAll(app, _.functions(app));

process.on('uncaughtException', app.onUncaughtException);
process.once('SIGINT', app.onSigInt);
process.on('beforeExit', app.onBeforeExit);

module.exports = app;
