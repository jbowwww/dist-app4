"use strict";

const console = require('../stdio.js').Get('fs/iterate', { minLevel: 'verbose' });	// debug verbose log
const inspect = require('../utility.js').makeInspect({ depth: 2, breakLength: 0 });
const promisifyMethods = require('../utility.js').promisifyMethods;
const util = require('util');
const _ = require('lodash');
const nodeFs = promisifyMethods(require('fs'));
const nodePath = require('path');
const stream = new require('stream');
stream.finished = util.promisify(stream.finished);
var pipeline = util.promisify(stream.pipeline);
const PromisePipe = require('../promise-pipe.js');
const Q = require('q');
Q.longStackSupport = true;
const getDevices = require('./devices.js');
const pathDepth = require('./path-depth.js');
const { trace } = require('../Task.js');

module.exports = /*trace*/({ createFsItem, iterate });

// creates a POJO FS item to be used by iterate. Takes a path and returns an object containing path, stats, and fileType
function createFsItem(path, stats) {
	return ({
		path: /*nodePath.resolve*/(path),
		stats,
		get fileType() { return stats.isDirectory() ? 'dir' : stats.isFile() ? 'file' : 'unknown'; },
		get pathDepth() { return this.path.split(nodePath.sep).length - 1; },
		get extension() {
			var n = this.path.lastIndexOf('.');
			var n2 = Math.max(this.path.lastIndexOf('/'), this.path.lastIndexOf('\\'));
			return (n < 0 || (n2 > 0 && n2 > n)) ? '' : this.path.slice(n + 1);
		},
		[util.inspect.custom](depth, options) {
			return _.assign({}, this);
		}
	});
}

// TODO: Make this scan all FS entries under the path without slowing for back pressure, or perhaps only dirs, or dirs+files but not stat?
// or just all three (dirs+files+stats) so it then has sizes.. and can calculate progress and estimate ETA. If not including stats, estimate
// would be less accurate as don't know sizes of files so probably all 3
// Whether this shgould be a generator func (async or not) or a stream, or otherwise (just a fn call returns object, fn args include the
// data processing fn?) IDK .. but iterate should maintain an object with total numbers (+sizes if incl stats) of FS entries under path,
// total processed, dirs/files counts and progress (raw and % virtual) and ETA
async function* iterate(options) {

	console.log(`iterate=${typeof iterate} this=${typeof this} equal=${iterate === this}`);
	options = _.defaults(options, {
		path: nodePath.resolve(options.path || '.'),
		maxDepth: 1,
		filter: item => true,
		objectMode: true,
		highWaterMark: 16,
		handleError(err) { console.warn(`iterate: ${err/*.stack*/}`); }
	});
	console.verbose(`iterate(${inspect(options, { compact: false })})`);
  	
	var self = {
		root: options.path,
		rootItem: null,
		paths: [options.path],
		errors: [],
		promisePipe(...args) { return /*stream.finished*/(pipeline(self, new PromisePipe(...args).stream())); },
		task: { max: 1, current: 0 }
	};

	for (let i = 0; i < self.paths.length; i++) { // as long as JS will re-evaluate self.paths.length each iteration? because self.paths continues growing
		var path = self.paths[i];
		// self.task.max = self.paths.length - 1;
		// self.task.current = i;
		try {
			var stats = await nodeFs.lstat(path);
			var item = createFsItem(path, stats);
			if (path === self.root) {
				self.rootItem = item;
			}
			if (!options.filter || options.filter(item)) {
				var currentDepth = item.pathDepth; - self.rootItem.pathDepth/*self.rootDepth*/;	// +1 because below here next files are read from this dir
				if (item.fileType === 'dir' && ((options.maxDepth === 0) || (currentDepth <= options.maxDepth + self.rootItem.pathDepth/*self.rootDepth*/))/* && (!options.filter || options.filter(item))*/) {
					var names = (await nodeFs.readdir(item.path)).filter(options.filter);
					console.debug(`${names.length} entries at depth=${currentDepth} in dir:${item.path} self.paths=[${self.paths.length}] item=${inspect(item)}`);
					_.forEach(names, name => self.paths.push(/*{ path:*/ nodePath.join(item.path, name)/*, dir: item, drive*/ /*}*/));

					yield item;
				} else {
					yield item;
				}
			}
		} catch (e) {
			self.errors.push(e);
			options.handleError(e);
		}
	}

	if (self.errors.length) {
		console.warn(`iterate('${self.root}'): stream end: ${self.errors.length} errors: ${self.errors.join('\n\t')}`);
	} else {
		console.debug(`iterate('${self.root}'): stream end`);
	}
}
