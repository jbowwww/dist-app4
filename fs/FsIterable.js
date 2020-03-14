"use strict";

const { inspect, promisify } = require('util');//.makeInspect({ depth: 2, breakLength: 0, compact: false });
const _ = require('lodash');
const promisifyObject = o => Object.keys(o).reduce((a, k) =>
	Object.defineProperty(a, k, { writeable: true, enumerable: true, value: o[k] instanceof Function ? promisify(o[k]) : o[k] }), {});
const nodeFs = promisifyObject(require('fs'));
const nodePath = require('path');
const stream = new require('stream');
stream.finished = promisify(stream.finished);
var pipeline = promisify(stream.pipeline);

const inspectWithGetters = function(wrapped, inspectFn) {
	return Object.assign(wrapped, {
		[inspect.custom]: typeof inspectFn === 'function' ? inspectFn
		 : () => inspect(_.assign({}, wrapped))
	});
};
const inspectArray = function(wrapped, inspectFn) {
	return Object.assign(wrapped, {
		[inspect.custom]: typeof inspectFn === 'function' ? inspectFn
		 : () => 'Array[' + this.items.length + ']'
	});
};
const log = require('debug')('FsIterable');
log.info = log.extend('info');
log.warn = log.extend('warn');

// log(`_ = ${inspect(_)}\n\nfs = ${inspect(nodeFs)}`);

module.exports = FsIterable;

function FsIterable(options) {
	if (!(this instanceof FsIterable)) {
		return new FsIterable(options);
	} else if (typeof options === 'string') {
		options = { path: options };
	}
	const fsIterable = this;
	this.options = options = _.defaults(options, {
		path: nodePath.resolve(options.path || '.'),
		maxDepth: 1,
		filter: item => true,
		handleError(err) { log.warn(err/*.stack*/); }
	});
	this.root = options.path;
	this.rootItem = null;
	this.count = inspectWithGetters({
		file: 0,
		dir: 0,
		unknown: 0,
		get all() { return this.file + this.dir + this.unknown; }
 	});
	this.errors = [];
	this.items = inspectWithGetters([], () => 'Array[' + this.items.length + ']');
	this.itemIndex = 0;
	this[Symbol.asyncIterator] = async function* () {
		while (this._fsIterateInnerCalls > 0 || this.itemIndex < this.items.length) {
			yield this.items[this.itemIndex++];
		}
		this.itemIndex = 0;
	};

	log(`FsIterate(${inspect(options, { compact: false })}): this=${inspect(this, { compact: false })}`);
	
	this.progress = inspectWithGetters({
		get total() { return fsIterable.count.all; },
		get current() { return fsIterable.itemIndex; },
		get progress() { return this.total === 0 ? 0 : 100 * fsIterable.itemIndex / this.total; }
	});

	this._fsIterateInnerCalls = 0;
	const fsIterateInner = async path => {
		try {
			this._fsIterateInnerCalls++;
			var stats = await nodeFs.lstat(path);
			var item = inspectWithGetters({
				path: /*nodePath.resolve*/(path),
				stats,
				get fileType() { return stats.isDirectory() ? 'dir' : stats.isFile() ? 'file' : 'unknown'; },
				get pathDepth() { return this.path.split(nodePath.sep).length - 1; },
				get extension() {
					var n = this.path.lastIndexOf('.');
					var n2 = Math.max(this.path.lastIndexOf('/'), this.path.lastIndexOf('\\'));
					return (n < 0 || (n2 > 0 && n2 > n)) ? '' : this.path.slice(n + 1);
				}
			});
			if (path === this.root) {
				this.rootItem = item;
			}
			if (!this.options.filter || this.options.filter(item)) {
				var currentDepth = item.pathDepth; - this.rootItem.pathDepth
				this.items.push(item);
				this.count[item.fileType]++;
				if (item.fileType === 'dir' && ((this.options.maxDepth === 0) || (currentDepth <= this.options.maxDepth + this.rootItem.pathDepth))) {
					var names = (await nodeFs.readdir(item.path)).filter(this.options.filter);
					log('%d entries at depth=%d in dir:%s this.items=[%d] item=%o', names.length, currentDepth, item.path, this.items.length, item);
					await Promise.all(names.map(name => fsIterateInner(nodePath.join(item.path, name))));
				}
			}
		} catch (e) {
			this.errors.push(e);
			this.options.handleError(e);
		} finally {
			this._fsIterateInnerCalls--;
		}
	};
	fsIterateInner(this.options.path);
}
